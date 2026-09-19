import { describe, it, expect, afterAll, inject } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");

describe("index.js (Vercel entry)", () => {
    const saved = { ...process.env };
    afterAll(async () => {
        process.env = saved;
        await require("mongoose").disconnect();
    });

    it("exports a configured Express app without starting a server", async () => {
        process.env.MONGO_URL = `${inject("mongoUri")}airbuenas-index-test`;
        process.env.JWT_SECRET = "x".repeat(40);
        const app = require("../index.js");
        expect(typeof app).toBe("function");
        const res = await request(app).get("/api/health").expect(200);
        expect(res.body.status).toBe("ok");
    });
});
