import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { loadConfig, ConfigError, DEV_JWT_SECRET } = require("../_src/config");

const SECRET = "s".repeat(32);

describe("loadConfig", () => {
    it("uses development defaults", () => {
        const c = loadConfig({});
        expect(c).toMatchObject({ env: "development", isProduction: false, port: 5000, logLevel: "debug", trustProxy: 0, corsOrigins: ["http://localhost:5173"] });
        expect(c.jwt).toEqual({ secret: DEV_JWT_SECRET, expiresIn: "7d" });
        expect(c.rateLimit).toEqual({ windowMs: 900000, max: 300, authMax: 10, writeMax: 30, uploadMax: 60, pageMax: 600, resetMax: 10 });
        expect(c.mail).toMatchObject({ transport: "log", port: 587, secure: false, from: '"AirBuenas" <no-reply@mernbnb.vercel.app>' });
        expect(c.siteUrl).toBe("https://mernbnb.vercel.app");
        expect(c.s3).toMatchObject({ bucket: "mernbnb-images-bucket", region: "eu-west-1", endpoint: undefined });
    });

    it("takes the public site address without a trailing slash", () => {
        expect(loadConfig({ SITE_URL: "https://stays.example.co.ke/" }).siteUrl).toBe("https://stays.example.co.ke");
        expect(() => loadConfig({ SITE_URL: "ftp://example.com" })).toThrow(/SITE_URL/);
        expect(() => loadConfig({ SITE_URL: "not a url" })).toThrow(ConfigError);
    });

    it("sends email over SMTP when it's configured, and never logs it in production", () => {
        const smtp = loadConfig({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASSWORD: "p", MAIL_FROM: "Stays <hi@example.com>" }).mail;
        expect(smtp).toEqual({ transport: "smtp", host: "smtp.example.com", port: 465, secure: true, user: "u", password: "p", from: "Stays <hi@example.com>" });
        expect(loadConfig({ SMTP_HOST: "h", SMTP_SECURE: "true" }).mail.secure).toBe(true);
        expect(loadConfig({ NODE_ENV: "production", MONGO_URL: "m", JWT_SECRET: SECRET }).mail.transport).toBe("none");
        expect(() => loadConfig({ SMTP_SECURE: "yes" })).toThrow(/SMTP_SECURE/);
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
