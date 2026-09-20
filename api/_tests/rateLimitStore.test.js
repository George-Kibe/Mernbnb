import { describe, it, expect, beforeAll, beforeEach, afterAll, inject, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const mongoose = require("mongoose");
const h = require("./helpers");
const { createMongoStore, COLLECTION } = require("../_src/middleware/rateLimitStore");

const WINDOW = 60_000;
let clock = Date.parse("2030-01-01T10:00:00Z");
let db;
beforeAll(async () => {
    ({ db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")) }));
    await db.connect();
});
beforeEach(async () => {
    await mongoose.connection.collection(COLLECTION).deleteMany({});
    clock += WINDOW * 10;
});
afterAll(() => h.closeDatabase());

const store = (prefix = "test:", options = {}) => {
    const made = createMongoStore({ prefix, now: () => clock, ...options });
    made.init({ windowMs: WINDOW });
    return made;
};

describe("the rate limit store in MongoDB", () => {
    it("counts hits per key until the window ends", async () => {
        const limits = store();
        expect(await limits.increment("1.2.3.4")).toMatchObject({ totalHits: 1, resetTime: new Date(clock + WINDOW) });
        expect((await limits.increment("1.2.3.4")).totalHits).toBe(2);
        expect((await limits.increment("5.6.7.8")).totalHits).toBe(1); // a different client

        // Still the same window: the reset time doesn't move.
        clock += WINDOW - 1;
        expect(await limits.increment("1.2.3.4")).toMatchObject({ totalHits: 3, resetTime: new Date(clock - (WINDOW - 1) + WINDOW) });
        // Past it: a new window, even before MongoDB's TTL sweep removes the document.
        clock += 2;
        expect(await limits.increment("1.2.3.4")).toMatchObject({ totalHits: 1, resetTime: new Date(clock + WINDOW) });
    });

    it("keeps each limiter's counts apart", async () => {
        const api = store("global:");
        const pages = store("pages:");
        await api.increment("1.2.3.4");
        await api.increment("1.2.3.4");
        expect((await pages.increment("1.2.3.4")).totalHits).toBe(1);
        expect((await api.get("1.2.3.4")).totalHits).toBe(2);
    });

    it("can take a hit back, and forget a key", async () => {
        const limits = store();
        await limits.increment("1.2.3.4");
        await limits.increment("1.2.3.4");
        await limits.decrement("1.2.3.4");
        expect((await limits.get("1.2.3.4")).totalHits).toBe(1);
        await limits.decrement("1.2.3.4");
        await limits.decrement("1.2.3.4"); // never goes below zero
        expect((await limits.get("1.2.3.4")).totalHits).toBe(0);

        await limits.increment("1.2.3.4");
        await limits.resetKey("1.2.3.4");
        expect(await limits.get("1.2.3.4")).toBeUndefined();
        expect(await limits.get("never-seen")).toBeUndefined();
    });

    it("forgets keys by itself (a TTL index on expiresAt)", async () => {
        const limits = store();
        await limits.increment("1.2.3.4");
        const indexes = await mongoose.connection.collection(COLLECTION).indexes();
        expect(indexes.find((index) => index.key.expiresAt)).toMatchObject({ expireAfterSeconds: 0 });
        clock += WINDOW + 1;
        expect(await limits.get("1.2.3.4")).toBeUndefined(); // expired, even before the sweep
    });

    it("lets requests through when the database can't be reached, and says so", async () => {
        const logs = h.captureLogger();
        const broken = {
            connection: {
                collection: () => ({
                    createIndex: () => Promise.reject(new Error("no index")),
                    findOneAndUpdate: () => Promise.reject(new Error("no primary")),
                    updateOne: () => Promise.reject(new Error("no primary")),
                    deleteOne: () => Promise.reject(new Error("no primary")),
                    findOne: () => Promise.reject(new Error("no primary")),
                }),
            },
        };
        const limits = store("test:", { connection: broken, logger: logs.logger });
        expect(await limits.increment("1.2.3.4")).toEqual({ totalHits: 0, resetTime: new Date(clock + WINDOW) }); // 0 hits: allowed
        await limits.decrement("1.2.3.4");
        await limits.resetKey("1.2.3.4");
        expect(await limits.get("1.2.3.4")).toBeUndefined();
        expect(logs.lines.map((line) => line.level)).toEqual(Array(5).fill("warn"));
        expect(logs.find(/^Rate limit store unavailable \(counting\)/)).toMatchObject({ err: { message: "no primary" } });
        expect(logs.find("Could not create the rate limit index")).toBeTruthy();
    });

    it("has defaults for production", () => {
        expect(typeof createMongoStore().increment).toBe("function");
    });
});

describe("limits shared between instances", () => {
    it("counts one client's requests against every instance", async () => {
        // Two apps, as two serverless instances would be.
        const env = { RATE_LIMIT_MAX: "2", RATE_LIMIT_STORE: "mongo" };
        const instanceA = h.makeApp({ db, env }).app;
        const instanceB = h.makeApp({ db, env }).app;

        await request(instanceA).get("/api/nope").expect(404);
        await request(instanceA).get("/api/nope").expect(404);
        // The third request lands on the other instance, which knows about the first two.
        const res = await request(instanceB).get("/api/nope").expect(429);
        expect(res.body.error).toMatch(/Too many requests/);
        expect(res.headers["ratelimit"]).toMatch(/r=0/);
    });

    it("keeps counting per instance when configured that way", async () => {
        const env = { RATE_LIMIT_MAX: "2", RATE_LIMIT_STORE: "memory" };
        const instanceA = h.makeApp({ db, env }).app;
        const instanceB = h.makeApp({ db, env }).app;
        await request(instanceA).get("/api/nope").expect(404);
        await request(instanceA).get("/api/nope").expect(404);
        await request(instanceB).get("/api/nope").expect(404);
    });

    it("doesn't fail requests when the database is down", async () => {
        const logs = h.captureLogger();
        const down = { connect: () => Promise.reject(new Error("down")), requireConnection: (req, res, next) => next() };
        const { app } = h.makeApp({ db: down, env: { RATE_LIMIT_MAX: "1", RATE_LIMIT_STORE: "mongo" }, logger: logs.logger });
        const offline = { connection: { collection: () => { throw new Error("not connected"); } } };
        vi.spyOn(mongoose.connection, "collection").mockImplementation(offline.connection.collection);
        try {
            await request(app).get("/api/nope").expect(404);
            await request(app).get("/api/nope").expect(404); // not blocked, not failed
        } finally {
            vi.restoreAllMocks();
        }
        expect(logs.find(/^Rate limit store unavailable/)).toBeTruthy();
    });
});
