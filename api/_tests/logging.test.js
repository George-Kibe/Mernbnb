import { describe, it, expect, beforeAll, beforeEach, afterAll, inject, vi } from "vitest";
import { createRequire } from "module";
import { EventEmitter } from "events";
import { Writable } from "stream";

const require = createRequire(import.meta.url);
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { mockClient } = require("aws-sdk-client-mock");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const h = require("./helpers");
const { createLogger, createHttpLogger, maskEmail, sanitize, LEVELS } = require("../_src/logger");
const { createDatabase, databaseHost } = require("../_src/db");
const { FetchImageError } = require("../_src/lib/fetchImage");
const { createShellLoader } = require("../_src/seo/shell");

const s3 = mockClient(S3Client);
const capture = h.captureLogger();
const { lines, find } = capture;
let fetchImage;
let app;
let db;
beforeAll(async () => {
    ({ app, db } = h.makeApp({
        mongoUri: h.databaseUri(inject("mongoUri")),
        logger: capture.logger,
        fetchImage: (...args) => fetchImage(...args),
        loadShell: async () => { throw new Error("no template"); },
    }));
    await db.connect();
});
beforeEach(async () => {
    await h.clearDatabase();
    lines.length = 0;
    s3.reset();
});
afterAll(async () => {
    s3.restore();
    await h.closeDatabase();
});

const requestLine = (method, url) => lines.find((l) => l.http?.method === method && l.http?.url === url);

describe("createLogger", () => {
    const logTo = (config, options) => {
        const out = [];
        const stream = new Writable({ write(chunk, enc, done) { out.push(chunk.toString()); done(); } });
        return { logger: createLogger(config, { stream, ...options }), out };
    };

    it("writes one JSON line per event with the service, level and time", () => {
        const { logger, out } = logTo({ env: "production", logLevel: "info" });
        logger.info("Listing created", { placeId: "p1" });
        const entry = JSON.parse(out[0]);
        expect(entry).toMatchObject({ level: "info", message: "Listing created", placeId: "p1", service: "airbuenas-api" });
        expect(Date.parse(entry.timestamp)).not.toBeNaN();
    });

    it("redacts credentials at any depth", () => {
        const { logger, out } = logTo({ env: "production", logLevel: "info" });
        logger.info("x", {
            headers: { authorization: "Bearer abc", Cookie: "sid=1" },
            body: { password: "hunter2", nested: { token: "t", accessToken: "a" } },
            s3: { secretAccessKey: "s", accessKeyId: "k" },
            jwt_secret: "j",
            list: [{ password: "p" }],
        });
        const text = out[0];
        for (const secret of ["Bearer abc", "sid=1", "hunter2", '"t"', '"a"', '"s"', '"k"', '"j"', '"p"']) expect(text).not.toContain(secret);
        expect(JSON.parse(text).body.nested.token).toBe("[redacted]");
    });

    it("keeps errors' names, messages, codes and stacks", () => {
        const { logger, out } = logTo({ env: "production", logLevel: "info" });
        const cause = new Error("socket closed");
        logger.error("Failed", { err: Object.assign(new Error("boom", { cause }), { code: "E1", status: 502 }) });
        logger.error(new Error("thrown directly"));
        const [first, second] = out.map((line) => JSON.parse(line));
        expect(first.err).toMatchObject({ name: "Error", message: "boom", code: "E1", status: 502, cause: { message: "socket closed" } });
        expect(first.err.stack).toContain("logging.test.js");
        expect(second).toMatchObject({ level: "error", message: "thrown directly" });
        expect(second.stack).toContain("Error: thrown directly");
    });

    it("respects the level, and 'silent'", () => {
        const warnOnly = logTo({ env: "production", logLevel: "warn" });
        warnOnly.logger.info("dropped");
        warnOnly.logger.warn("kept");
        expect(warnOnly.out.map((line) => JSON.parse(line).message)).toEqual(["kept"]);
        const silent = logTo({ env: "production", logLevel: "silent" });
        silent.logger.error("nothing");
        expect(silent.out).toEqual([]);
        expect([LEVELS.fatal, LEVELS.trace, LEVELS.http]).toEqual(["error", "silly", "http"]);
        expect(createLogger({ env: "production", logLevel: "unknown" }).level).toBe("info");
    });

    it("prints readable lines in development", () => {
        const { logger, out } = logTo({ env: "development", logLevel: "debug" });
        logger.child({ requestId: "3f2a1c9e-aaaa-bbbb" }).info("Listing created", { placeId: "p1" });
        logger.warn("Plain message");
        logger.error("Failed", { err: new Error("boom") });
        const plain = out.map((line) => line.replace(new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g"), "")); // strip colours
        expect(plain[0]).toMatch(/^\d\d:\d\d:\d\d info \[3f2a1c9e\] Listing created \{"placeId":"p1"\}\n$/);
        expect(plain[1]).toMatch(/^\d\d:\d\d:\d\d warn Plain message\n$/);
        expect(plain[2]).toContain('Failed {"err":{"name":"Error","message":"boom"}}\nError: boom\n    at ');
    });

    it("makes values log-safe", () => {
        const circular = { a: 1 };
        circular.self = circular;
        let deep = { v: "bottom" };
        for (let i = 0; i < 8; i++) deep = { deep };
        const id = new mongoose.Types.ObjectId("0123456789abcdef01234567");
        expect(sanitize(circular)).toEqual({ a: 1, self: "[circular]" });
        expect(JSON.stringify(sanitize(deep))).toContain("[truncated]");
        expect(sanitize(Buffer.from("abc"))).toBe("[3 bytes]");
        expect(sanitize({ when: new Date("2030-01-01T00:00:00Z"), id, list: [1, "a"] })).toEqual({ when: "2030-01-01T00:00:00.000Z", id: "0123456789abcdef01234567", list: [1, "a"] });
    });

    it("masks email addresses", () => {
        expect(maskEmail("amina@example.com")).toBe("a***@example.com");
        expect(maskEmail("nope")).toBe("***");
        expect(maskEmail(undefined)).toBe("***");
    });
});

describe("request log lines", () => {
    it("logs method, URL, status, duration, IP and user agent, tagged with the request id", async () => {
        const res = await request(app).get("/api/places?page=1").set("User-Agent", "vitest").expect(200);
        const line = requestLine("GET", "/api/places?page=1");
        expect(line).toMatchObject({ level: "info", requestId: res.headers["x-request-id"], http: { status: 200, userAgent: "vitest" } });
        expect(line.message).toMatch(/^GET \/api\/places\?page=1 200 in [\d.]+ ms$/);
        expect(typeof line.http.durationMs).toBe("number");
        expect(line.http.ip).toBeTruthy();
    });

    it("keeps a sane incoming request id and replaces anything else", async () => {
        await request(app).get("/api/places").set("X-Request-Id", "trace-123").expect("X-Request-Id", "trace-123");
        expect(requestLine("GET", "/api/places").requestId).toBe("trace-123");
        const res = await request(app).get("/api/places").set("X-Request-Id", "bad id!");
        expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("says why a request failed, at warn for 4xx and error for 5xx", async () => {
        await request(app).get("/api/nope").expect(404);
        expect(requestLine("GET", "/api/nope")).toMatchObject({ level: "warn", error: "That endpoint doesn't exist." });

        const { auth } = await h.createUser();
        await request(app).post("/api/places").set("Authorization", auth).send({}).expect(400);
        expect(requestLine("POST", "/api/places").error).toMatch(/ \(title, address, photos, description, checkIn, checkOut, maxGuests, price\)$/);

        const spy = vi.spyOn(h.Place, "countDocuments").mockRejectedValueOnce(new Error("secret internals"));
        await request(app).get("/api/places?page=2").expect(500);
        spy.mockRestore();
        expect(requestLine("GET", "/api/places?page=2")).toMatchObject({ level: "error", http: { status: 500 } });
        expect(find("Request failed")).toMatchObject({ level: "error", status: 500, err: { message: "secret internals" } });
        expect(find("Request failed").err.stack).toContain("Error: secret internals");
    });

    it("records who made the request", async () => {
        const { user, auth } = await h.createUser();
        await request(app).get("/api/users/me").set("Authorization", auth).expect(200);
        expect(requestLine("GET", "/api/users/me").userId).toBe(String(user._id));
    });

    it("skips health checks", async () => {
        await request(app).get("/api/health").expect(200);
        expect(lines.find((l) => l.http?.url === "/api/health")).toBeUndefined();
    });

    it("flags requests the client abandoned", () => {
        const { logger, lines: out } = h.captureLogger();
        const req = Object.assign(new EventEmitter(), { headers: {}, path: "/api/places", method: "GET", originalUrl: "/api/places", ip: "1.2.3.4", get: () => undefined });
        const res = Object.assign(new EventEmitter(), { setHeader: vi.fn(), statusCode: 200, locals: {}, writableFinished: false });
        createHttpLogger(logger)(req, res, () => {});
        res.emit("close");
        res.emit("finish"); // logged once
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ level: "warn", message: expect.stringContaining("aborted"), http: { aborted: true } });
    });
});

describe("account events", () => {
    const account = { name: "Amina", email: "amina@example.com", password: "correct horse battery" };

    it("logs sign-ups and logins by user id, never the email or password", async () => {
        const { body } = await request(app).post("/api/users/register").send(account).expect(201);
        expect(find("Account created")).toMatchObject({ level: "info", userId: body.user._id });
        await request(app).post("/api/users/register").send(account).expect(409);
        expect(find("Registration refused: email already registered")).toMatchObject({ email: "a***@example.com" });

        await request(app).post("/api/users/login").send({ email: account.email, password: account.password }).expect(200);
        expect(find("Logged in")).toMatchObject({ userId: body.user._id });
        await request(app).post("/api/users/login").send({ email: account.email, password: "not-the-password-9" }).expect(401);
        await request(app).post("/api/users/login").send({ email: "nobody@example.com", password: "whatever1" }).expect(401);
        const failures = lines.filter((l) => l.message === "Login failed");
        expect(failures.map((l) => [l.level, l.email, l.reason])).toEqual([
            ["warn", "a***@example.com", "wrong password"],
            ["warn", "n***@example.com", "no such account"],
        ]);

        const everything = JSON.stringify(lines);
        for (const secret of ["amina@example.com", "correct horse battery", "not-the-password-9", "whatever1", "eyJ"]) expect(everything).not.toContain(secret);
    });

    it("logs expired and invalid sessions differently", async () => {
        const { user } = await h.createUser();
        const expired = jwt.sign({ id: String(user._id) }, h.JWT_SECRET, { algorithm: "HS256", expiresIn: -10, subject: String(user._id) });
        await request(app).get("/api/users/me").set("Authorization", `Bearer ${expired}`).expect(401);
        expect(find("Session expired")).toMatchObject({ level: "info" });
        await request(app).get("/api/users/me").set("Authorization", "Bearer not.a.token").expect(401);
        expect(find("Rejected an invalid token")).toMatchObject({ level: "warn", reason: expect.any(String) });
        const noId = jwt.sign({ name: "x" }, h.JWT_SECRET, { algorithm: "HS256" });
        await request(app).get("/api/users/me").set("Authorization", `Bearer ${noId}`).expect(401);
        expect(find("Rejected a token without a user id")).toBeTruthy();
    });
});

describe("listing and booking events", () => {
    const body = h.placeFields({ photos: ["places/abc/1.jpg"] });

    it("logs listings created, what changed on update, and blocked edits", async () => {
        const host = await h.createUser();
        const { body: place } = await request(app).post("/api/places").set("Authorization", host.auth).send(body).expect(201);
        expect(find("Listing created")).toMatchObject({ placeId: place._id, userId: String(host.user._id), price: 5000, photos: 1, address: "Naivasha, Nakuru" });

        await request(app).put(`/api/places/${place._id}`).set("Authorization", host.auth).send({ ...body, price: 6500, title: "Lakeside Cabin & Jetty" }).expect(200);
        expect(find("Listing updated")).toMatchObject({ placeId: place._id, changed: expect.arrayContaining(["price", "title"]) });
        expect(find("Listing updated").changed).not.toContain("address");

        const other = await h.createUser();
        await request(app).put(`/api/places/${place._id}`).set("Authorization", other.auth).send(body).expect(403);
        expect(find("Blocked an edit to someone else's listing")).toMatchObject({ level: "warn", userId: String(other.user._id), ownerId: String(host.user._id) });
    });

    it("logs bookings, refused dates and snooping", async () => {
        const host = await h.createUser();
        const guest = await h.createUser();
        const place = await h.createPlace(host.user);
        const trip = { placeId: String(place._id), checkIn: "2031-03-10", checkOut: "2031-03-12", guests: 2, name: "Guest", phoneNumber: "+254 700 000000" };
        const { body: booking } = await request(app).post("/api/bookings").set("Authorization", guest.auth).send(trip).expect(201);
        expect(find("Booking created")).toMatchObject({
            bookingId: booking._id, placeId: trip.placeId, userId: String(guest.user._id), hostId: String(host.user._id),
            checkIn: "2031-03-10", checkOut: "2031-03-12", nights: 2, guests: 2, total: 10000,
        });
        expect(JSON.stringify(find("Booking created"))).not.toContain("700 000000"); // no phone numbers

        await request(app).post("/api/bookings").set("Authorization", guest.auth).send(trip).expect(409);
        expect(find("Booking refused: dates already booked")).toMatchObject({ placeId: trip.placeId, checkIn: "2031-03-10" });

        const stranger = await h.createUser();
        await request(app).get(`/api/bookings/${booking._id}`).set("Authorization", stranger.auth).expect(404);
        expect(find("Blocked access to someone else's booking")).toMatchObject({ level: "warn", bookingId: booking._id });
        lines.length = 0;
        await request(app).get("/api/bookings/000000000000000000000000").set("Authorization", stranger.auth).expect(404);
        expect(find("Blocked access to someone else's booking")).toBeUndefined(); // simply missing
    });

    it("logs searches that find nothing, and others only at debug", async () => {
        const { user } = await h.createUser();
        await h.createPlace(user);
        await request(app).get("/api/places?location=Atlantis&guests=2").expect(200);
        expect(find("Search found no stays")).toMatchObject({ level: "info", search: { location: "Atlantis", guests: 2 }, total: 0 });
        await request(app).get("/api/places?location=Naivasha").expect(200);
        expect(find("Search")).toMatchObject({ level: "debug", total: 1 });
        lines.length = 0;
        await request(app).get("/api/places").expect(200);
        expect(lines.filter((l) => /^Search/.test(l.message))).toEqual([]); // plain browsing
    });
});

describe("upload events", () => {
    it("logs issued upload URLs and photos added from links", async () => {
        const { user, auth } = await h.createUser();
        await request(app).post("/api/uploads/presign").set("Authorization", auth).send({ files: [{ type: "image/png", size: 100 }, { type: "image/jpeg", size: 50 }] }).expect(201);
        expect(find("Upload URLs issued")).toMatchObject({ userId: String(user._id), files: 2, bytes: 150 });

        fetchImage = async () => ({ buffer: Buffer.from("png"), type: "image/png" });
        s3.on(PutObjectCommand).resolves({});
        await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "https://images.example.com/a.png?sig=1" }).expect(201);
        expect(find("Photo added from a link")).toMatchObject({ host: "images.example.com", type: "image/png", bytes: 3 });
    });

    it("warns about refused links, e.g. private addresses", async () => {
        const { auth } = await h.createUser();
        fetchImage = async () => { throw new FetchImageError("That link points to a private address."); };
        await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "http://169.254.169.254/latest" }).expect(422);
        expect(find("Image link refused")).toMatchObject({ level: "warn", host: "169.254.169.254", reason: "That link points to a private address." });
        await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "not a url" }).expect(422);
        expect(lines.filter((l) => l.message === "Image link refused")[1].host).toBe("(not a URL)");
    });

    it("says how to fix missing S3 credentials", async () => {
        const { auth } = await h.createUser();
        fetchImage = async () => ({ buffer: Buffer.from("png"), type: "image/png" });
        s3.on(PutObjectCommand).rejects(Object.assign(new Error("no creds"), { name: "CredentialsProviderError" }));
        await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "https://images.example.com/a.png" }).expect(503);
        expect(find(/^Photo uploads are down: no S3 credentials/)).toMatchObject({ level: "error", err: { name: "CredentialsProviderError" } });
    });
});

describe("abuse signals", () => {
    it("logs which rate limit was hit, by IP or user", async () => {
        const limited = h.captureLogger();
        const { app: strict } = h.makeApp({ db, logger: limited.logger, env: { AUTH_RATE_LIMIT_MAX: "1", UPLOAD_RATE_LIMIT_MAX: "1" }, fetchImage: async () => { throw new FetchImageError("nope"); } });
        await request(strict).post("/api/users/login").send({}).expect(400);
        await request(strict).post("/api/users/login").send({}).expect(429);
        expect(limited.find("Rate limit reached: auth")).toMatchObject({ level: "warn", limiter: "auth", limit: 1, windowMinutes: 15, ip: expect.any(String) });

        const { user, auth } = await h.createUser();
        await request(strict).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "https://x.example/a.png" }).expect(422);
        await request(strict).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "https://x.example/a.png" }).expect(429);
        expect(limited.find("Rate limit reached: upload")).toMatchObject({ limiter: "upload", userId: String(user._id), windowMinutes: 60 });
    });

    it("warns about cross-origin requests from unknown sites, but not from the site itself", async () => {
        await request(app).get("/api/places").set("Origin", "https://evil.example").expect(200);
        expect(find(/^CORS: origin not allowed/)).toMatchObject({ level: "warn", origin: "https://evil.example" });
        lines.length = 0;
        const res = await request(app).get("/api/places").set("Origin", "https://mernbnb.vercel.app").expect(200);
        expect(res.headers["access-control-allow-origin"]).toBe("https://mernbnb.vercel.app");
        await request(app).get("/api/places").set("Origin", "http://localhost:5173").expect(200);
        expect(find(/^CORS/)).toBeUndefined();
    });
});

describe("database and page events", () => {
    const fakeMongoose = (connect) => ({ connect, connection: Object.assign(new EventEmitter(), { readyState: 1 }), disconnect: vi.fn() });

    it("logs connection attempts with the host and timing, never credentials", async () => {
        const { logger, lines: out } = h.captureLogger();
        const conn = fakeMongoose(vi.fn().mockResolvedValue().mockRejectedValueOnce(new Error("timed out")));
        const database = createDatabase("mongodb+srv://admin:s3cret@cluster0.abc.mongodb.net/app?retryWrites=true", logger, { connection: conn });
        await expect(database.connect()).rejects.toThrow("timed out");
        await database.connect();
        expect(out.map((l) => [l.level, l.message, l.host])).toEqual([
            ["info", "Connecting to MongoDB", "cluster0.abc.mongodb.net"],
            ["error", "MongoDB connection failed; requests that need it get a 503", "cluster0.abc.mongodb.net"],
            ["info", "Connecting to MongoDB", "cluster0.abc.mongodb.net"],
            ["info", "MongoDB connected", "cluster0.abc.mongodb.net"],
        ]);
        expect(out[1].err.message).toBe("timed out");
        expect(typeof out[3].durationMs).toBe("number");
        expect(JSON.stringify(out)).not.toContain("s3cret");

        conn.connection.emit("disconnected");
        conn.connection.emit("reconnected");
        conn.connection.emit("error", new Error("network"));
        expect(out.slice(4).map((l) => [l.level, l.message])).toEqual([
            ["warn", "MongoDB disconnected"],
            ["info", "MongoDB reconnected"],
            ["error", "MongoDB connection error"],
        ]);
        // Watched once per connection, however many databases share it.
        await createDatabase("mongodb://h", logger, { connection: conn }).connect();
        conn.connection.emit("reconnected");
        expect(out.filter((l) => l.message === "MongoDB reconnected")).toHaveLength(2);
    });

    it("finds the host in any MongoDB URL", () => {
        expect(databaseHost("mongodb://user:pw@db1:27017,db2:27017/app?replicaSet=rs")).toBe("db1:27017,db2:27017");
        expect(databaseHost("mongodb://127.0.0.1:27017")).toBe("127.0.0.1:27017");
    });

    it("logs page failures and where the page template came from", async () => {
        const res = await request(app).get("/place/0123456789abcdef01234567").expect(503);
        expect(res.text).toContain("temporarily unavailable");
        expect(find("Could not load the page template (client/dist/index.html)")).toMatchObject({ level: "error", err: { message: "no template" } });

        const { logger, lines: out } = h.captureLogger();
        const shell = '<!--seo:start--><!--seo:end--><div id="root"></div>';
        await createShellLoader({ files: [], logger, fetch: async () => ({ ok: true, text: async () => shell }) })("https://site.example");
        expect(out[0]).toMatchObject({ message: "Page template fetched from the site", origin: "https://site.example" });
    });
});
