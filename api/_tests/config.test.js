import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { Writable } from "stream";

const require = createRequire(import.meta.url);
const { loadConfig, ConfigError, DEV_JWT_SECRET } = require("../_src/config");
const { createLogger, hasPrettyPrinter } = require("../_src/logger");

const SECRET = "s".repeat(32);

describe("loadConfig", () => {
    it("uses development defaults", () => {
        const c = loadConfig({});
        expect(c).toMatchObject({ env: "development", isProduction: false, port: 5000, logLevel: "debug", trustProxy: 0, corsOrigins: ["http://localhost:5173"] });
        expect(c.jwt).toEqual({ secret: DEV_JWT_SECRET, expiresIn: "7d" });
        expect(c.rateLimit).toEqual({ windowMs: 900000, max: 300, authMax: 10, writeMax: 30, uploadMax: 60 });
        expect(c.s3).toMatchObject({ bucket: "mernbnb-images-bucket", region: "eu-west-1", endpoint: undefined });
    });

    it("is silent in tests", () => {
        expect(loadConfig({ NODE_ENV: "test" }).logLevel).toBe("silent");
    });

    it("requires MONGO_URL and a strong JWT_SECRET in production", () => {
        expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: SECRET })).toThrow("MONGO_URL is required in production.");
        expect(() => loadConfig({ NODE_ENV: "production", MONGO_URL: "mongodb://x" })).toThrow(ConfigError);
        expect(() => loadConfig({ NODE_ENV: "production", MONGO_URL: "mongodb://x", JWT_SECRET: "short" })).toThrow(/at least 32 characters/);
    });

    it("configures production", () => {
        const c = loadConfig({ NODE_ENV: "production", MONGO_URL: "mongodb://x", JWT_SECRET: SECRET, S3_ENDPOINT: "http://minio:9000/", CORS_ORIGINS: " https://a.com , ,https://b.com" });
        expect(c).toMatchObject({ isProduction: true, logLevel: "info", trustProxy: 1, corsOrigins: ["https://a.com", "https://b.com"] });
        expect(c.s3.endpoint).toBe("http://minio:9000");
        expect(c.corsOrigins).not.toContain("");
        expect(loadConfig({ NODE_ENV: "production", MONGO_URL: "m", JWT_SECRET: SECRET }).corsOrigins).toContain("https://mernbnb.vercel.app");
    });

    it("treats blank optional values as unset", () => {
        expect(loadConfig({ S3_ACCESS_KEY: "  ", MONGO_URL: "" })).toMatchObject({ mongoUrl: undefined, s3: { accessKeyId: undefined } });
    });

    it("rejects invalid values with a readable message", () => {
        expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid environment: PORT/);
        expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    });
});

describe("createLogger", () => {
    const capture = () => {
        const lines = [];
        const destination = new Writable({ write(chunk, enc, done) { lines.push(JSON.parse(chunk)); done(); } });
        return { lines, destination };
    };

    it("writes JSON lines and redacts credentials", () => {
        const { lines, destination } = capture();
        const logger = createLogger({ env: "production", logLevel: "info" }, { destination });
        logger.info({ req: { headers: { authorization: "Bearer abc", cookie: "sid=1" } }, body: { password: "hunter2" }, auth: { token: "t" } }, "hello");
        expect(lines[0]).toMatchObject({ msg: "hello", service: "airbuenas-api", req: { headers: { authorization: "[redacted]", cookie: "[redacted]" } }, body: { password: "[redacted]" }, auth: { token: "[redacted]" } });
    });

    it("respects the level", () => {
        const { lines, destination } = capture();
        const logger = createLogger({ env: "production", logLevel: "warn" }, { destination });
        logger.info("dropped");
        logger.warn("kept");
        expect(lines.map((l) => l.msg)).toEqual(["kept"]);
    });

    it("uses pino-pretty in development when available", () => {
        expect(hasPrettyPrinter()).toBe(true);
        expect(createLogger({ env: "development", logLevel: "silent" }).level).toBe("silent");
        expect(createLogger({ env: "development", logLevel: "debug" }, { pretty: false }).level).toBe("debug");
    });
});
