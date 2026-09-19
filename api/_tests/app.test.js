import { describe, it, expect, beforeAll, afterAll, inject, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const h = require("./helpers");
const { errorHandler } = require("../_src/middleware/errors");

let app;
let db;
beforeAll(async () => {
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")) }));
    await db.connect();
});
afterAll(() => h.closeDatabase());

describe("health", () => {
    it("reports ok when the database is up", async () => {
        const res = await request(app).get("/api/health").expect(200);
        expect(res.body).toMatchObject({ status: "ok", database: "up" });
        expect(typeof res.body.uptime).toBe("number");
    });

    it("reports 503 when the database is down", async () => {
        const down = { connect: () => Promise.reject(new Error("down")), requireConnection: db.requireConnection };
        const res = await request(h.makeApp({ db: down }).app).get("/api/health").expect(503);
        expect(res.body).toMatchObject({ status: "degraded", database: "down" });
    });
});

describe("security headers", () => {
    it("sets helmet headers and hides the framework", async () => {
        const res = await request(app).get("/api/places").expect(200);
        expect(res.headers["x-powered-by"]).toBeUndefined();
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(res.headers["strict-transport-security"]).toMatch(/max-age=/);
        expect(res.headers["content-security-policy"]).toBeTruthy();
    });
});

describe("CORS", () => {
    it("allows configured origins", async () => {
        const res = await request(app).get("/api/places").set("Origin", "http://localhost:5173").expect(200);
        expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("does not allow other origins", async () => {
        const res = await request(app).get("/api/places").set("Origin", "https://evil.example").expect(200);
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("answers preflights for allowed origins", async () => {
        const res = await request(app)
            .options("/api/places")
            .set("Origin", "http://localhost:5173")
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "authorization,content-type")
            .expect(204);
        expect(res.headers["access-control-allow-headers"]).toMatch(/Authorization/);
    });
});

describe("request ids", () => {
    it("generates one per request", async () => {
        const res = await request(app).get("/api/places").expect(200);
        expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("reuses a sane incoming id and replaces unsafe ones", async () => {
        const ok = await request(app).get("/api/places").set("X-Request-Id", "abc-123").expect(200);
        expect(ok.headers["x-request-id"]).toBe("abc-123");
        const bad = await request(app).get("/api/places").set("X-Request-Id", "<script>").expect(200);
        expect(bad.headers["x-request-id"]).not.toBe("<script>");
    });
});

describe("errors", () => {
    it("returns JSON 404s for unknown routes", async () => {
        const res = await request(app).get("/api/nope").expect(404);
        expect(res.body).toMatchObject({ error: "That endpoint doesn't exist." });
        expect(res.body.requestId).toBe(res.headers["x-request-id"]);
        await request(app).get("/").expect(404);
    });

    it("rejects malformed JSON with 400", async () => {
        const res = await request(app).post("/api/users/login").set("Content-Type", "application/json").send("{bad json").expect(400);
        expect(res.body.error).toBe("The request body isn't valid JSON.");
    });

    it("rejects oversized bodies with 413", async () => {
        const res = await request(app).post("/api/users/login").send({ email: "a@b.co", password: "x".repeat(200_000) }).expect(413);
        expect(res.body.error).toBe("The request body is too large.");
    });

    it("hides internal errors", async () => {
        const spy = vi.spyOn(h.Place, "countDocuments").mockRejectedValueOnce(new Error("secret internals"));
        const res = await request(app).get("/api/places").expect(500);
        expect(res.body.error).toMatch(/Something went wrong/);
        expect(JSON.stringify(res.body)).not.toContain("secret internals");
        spy.mockRestore();
    });

    it("turns Mongoose validation errors into 400s", () => {
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} };
        const err = { name: "ValidationError", errors: { price: { path: "price", message: "Price too high" } } };
        errorHandler(err, { id: "r1", log: { error: vi.fn() } }, res, () => {});
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.locals.error).toBe("Price too high (price)"); // for the request log line
        expect(res.json).toHaveBeenCalledWith({ error: "Price too high", details: [{ field: "price", message: "Price too high" }], requestId: "r1" });
    });

    it("falls back to a generic message for empty Mongoose validation errors", () => {
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} };
        errorHandler({ name: "ValidationError", errors: {} }, { id: "r2", log: { error: vi.fn() } }, res, () => {});
        expect(res.locals.error).toBe("Invalid data.");
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid data.", details: [], requestId: "r2" });
    });
});

describe("database outages", () => {
    it("returns 503 on data routes when the database is unreachable", async () => {
        const { app: offline } = h.makeApp({ mongoUri: "mongodb://127.0.0.1:1/offline?serverSelectionTimeoutMS=200" });
        const res = await request(offline).get("/api/places").expect(503);
        expect(res.body.error).toBe("Database unavailable. Try again later.");
    }, 15_000);
});

describe("global rate limit", () => {
    it("returns 429 with standard headers after the limit", async () => {
        const { app: limited } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), db, env: { RATE_LIMIT_MAX: "3" } });
        for (let i = 0; i < 3; i++) await request(limited).get("/api/places").expect(200);
        const res = await request(limited).get("/api/places").expect(429);
        expect(res.body.error).toBe("Too many requests. Please slow down and try again shortly.");
        expect(res.headers["ratelimit-policy"]).toMatch(/q=3/);
        expect(res.headers["retry-after"]).toBeTruthy();
        await request(limited).get("/api/health").expect(200); // health is exempt
    });
});
