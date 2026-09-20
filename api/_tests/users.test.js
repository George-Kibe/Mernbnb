import { describe, it, expect, beforeAll, afterAll, beforeEach, inject, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const jwt = require("jsonwebtoken");
const h = require("./helpers");

let app;
let db;
beforeAll(async () => {
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")) }));
    await db.connect();
    await h.User.init(); // unique index on email
});
beforeEach(() => h.clearDatabase());
afterAll(() => h.closeDatabase());

describe("POST /api/users/register", () => {
    const valid = { name: "  Amina  ", email: "  Amina@Example.COM ", password: "long enough password" };

    it("creates an account without exposing the password hash", async () => {
        const res = await request(app).post("/api/users/register").send(valid).expect(201);
        expect(res.body.user).toMatchObject({ name: "Amina", email: "amina@example.com" });
        expect(res.body.user.password).toBeUndefined();
        expect(res.body.user.__v).toBeUndefined();
        const stored = await h.User.findOne({ email: "amina@example.com" }).select("+password");
        expect(stored.password).toMatch(/^\$2[aby]\$10\$/);
    });

    it.each([
        [{ ...valid, name: "" }, "Enter your name."],
        [{ ...valid, email: "not-an-email" }, "Enter a valid email address."],
        [{ ...valid, password: "short" }, "Use at least 8 characters for your password."],
        [{ ...valid, password: "x".repeat(129) }, "Password is too long."],
        [{}, undefined],
    ])("rejects invalid input %#", async (body, message) => {
        const res = await request(app).post("/api/users/register").send(body).expect(400);
        if (message) expect(res.body.error).toBe(message);
        expect(res.body.details.length).toBeGreaterThan(0);
        expect(res.body.requestId).toBeTruthy();
    });

    it("rejects a duplicate email with 409", async () => {
        await request(app).post("/api/users/register").send(valid).expect(201);
        const res = await request(app).post("/api/users/register").send({ ...valid, email: "AMINA@example.com" }).expect(409);
        expect(res.body.error).toBe("An account with this email already exists.");
    });

    it("maps a concurrent duplicate (E11000) to 409", async () => {
        const spy = vi.spyOn(h.User, "create").mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));
        await request(app).post("/api/users/register").send(valid).expect(409);
        spy.mockRestore();
    });

    it("turns unexpected database errors into a 500 without details", async () => {
        const spy = vi.spyOn(h.User, "create").mockRejectedValueOnce(new Error("disk full"));
        const res = await request(app).post("/api/users/register").send(valid).expect(500);
        expect(res.body.error).toMatch(/Something went wrong/);
        expect(JSON.stringify(res.body)).not.toContain("disk full");
        spy.mockRestore();
    });
});

describe("POST /api/users/login", () => {
    it("returns the user and a signed, expiring token", async () => {
        const { user } = await h.createUser({ email: "host@example.com" });
        const res = await request(app).post("/api/users/login").send({ email: "HOST@example.com", password: h.PASSWORD }).expect(200);
        expect(res.body.user).toMatchObject({ _id: String(user._id), email: "host@example.com" });
        expect(res.body.user.password).toBeUndefined();
        const payload = jwt.verify(res.body.token, h.JWT_SECRET);
        expect(payload).toMatchObject({ sub: String(user._id), id: String(user._id), email: "host@example.com" });
        expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
    });

    it("gives the same answer for a wrong password and an unknown email", async () => {
        await h.createUser({ email: "host@example.com" });
        const wrong = await request(app).post("/api/users/login").send({ email: "host@example.com", password: "nope nope" }).expect(401);
        const unknown = await request(app).post("/api/users/login").send({ email: "who@example.com", password: "nope nope" }).expect(401);
        expect(wrong.body.error).toBe("Incorrect email or password.");
        expect(unknown.body.error).toBe(wrong.body.error);
    });

    it("validates the body", async () => {
        await request(app).post("/api/users/login").send({ email: "x@example.com" }).expect(400);
    });
});

describe("GET /api/users/me", () => {
    it("returns the signed-in user", async () => {
        const { user, auth } = await h.createUser();
        const res = await request(app).get("/api/users/me").set("Authorization", auth).expect(200);
        expect(res.body.user._id).toBe(String(user._id));
    });

    it("requires a token", async () => {
        const res = await request(app).get("/api/users/me").expect(401);
        expect(res.body.error).toBe("Please log in first.");
    });

    it("rejects tampered, expired and unsigned tokens", async () => {
        const { user, token } = await h.createUser();
        const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
        const expired = jwt.sign({ sub: String(user._id) }, h.JWT_SECRET, { expiresIn: -10 });
        const noneAlg = jwt.sign({ sub: String(user._id) }, null, { algorithm: "none" });
        const noSubject = jwt.sign({ name: "x" }, h.JWT_SECRET);
        for (const [token_, message] of [
            [tampered, "Your session is invalid. Please log in again."],
            [expired, "Your session has expired. Please log in again."],
            [noneAlg, "Your session is invalid. Please log in again."],
            [noSubject, "Your session is invalid. Please log in again."],
        ]) {
            const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${token_}`).expect(401);
            expect(res.body.error).toBe(message);
        }
    });

    it("401s when the account was deleted: the session is no longer valid", async () => {
        const { user, auth } = await h.createUser();
        await h.User.deleteOne({ _id: user._id });
        const res = await request(app).get("/api/users/me").set("Authorization", auth).expect(401);
        expect(res.body.error).toMatch(/log in again/);
    });
});

describe("auth rate limiting", () => {
    it("blocks repeated failed logins but not successful ones", async () => {
        const limited = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), env: { AUTH_RATE_LIMIT_MAX: "3" }, db });
        await h.createUser({ email: "host@example.com" });
        for (let i = 0; i < 5; i++) {
            await request(limited.app).post("/api/users/login").send({ email: "host@example.com", password: h.PASSWORD }).expect(200);
        }
        for (let i = 0; i < 3; i++) {
            await request(limited.app).post("/api/users/login").send({ email: "host@example.com", password: "bad password" }).expect(401);
        }
        const res = await request(limited.app).post("/api/users/login").send({ email: "host@example.com", password: h.PASSWORD }).expect(429);
        expect(res.body.error).toBe("Too many attempts. Please wait a few minutes and try again.");
        expect(res.headers.ratelimit).toBeTruthy();
    });
});
