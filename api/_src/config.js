const { z } = require("zod");

// Origins allowed to call the API cross-origin when CORS_ORIGINS isn't set.
// The client normally calls /api on its own origin, which needs no CORS.
const DEFAULT_CORS_ORIGINS = {
    production: ["https://mernbnb.vercel.app", "https://kibe-mernbnb.vercel.app"],
    development: ["http://localhost:5173"],
    test: ["http://localhost:5173"],
};

// Public address of the site, used in canonical links, sitemaps and share
// previews. Keep it in sync with the client's VITE_SITE_URL.
const DEFAULT_SITE_URL = "https://mernbnb.vercel.app";

const DEV_JWT_SECRET = "development-only-jwt-secret-do-not-use-in-production";

const positiveInt = (fallback) => z.coerce.number().int().positive().default(fallback);
const optionalString = z.string().trim().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: positiveInt(5000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "http", "verbose", "debug", "trace", "silent"]).optional(),
    MONGO_URL: optionalString,
    JWT_SECRET: optionalString,
    JWT_EXPIRES_IN: z.string().default("7d"),
    CORS_ORIGINS: optionalString,
    SITE_URL: z.url({ protocol: /^https?$/ }).default(DEFAULT_SITE_URL),
    // Number of proxies in front of the app (Vercel = 1). Needed for real client IPs.
    TRUST_PROXY: z.coerce.number().int().min(0).optional(),
    RATE_LIMIT_WINDOW_MS: positiveInt(15 * 60 * 1000),
    RATE_LIMIT_MAX: positiveInt(300),
    AUTH_RATE_LIMIT_MAX: positiveInt(10),
    WRITE_RATE_LIMIT_MAX: positiveInt(30),
    UPLOAD_RATE_LIMIT_MAX: positiveInt(60),
    PAGE_RATE_LIMIT_MAX: positiveInt(600),
    RESET_RATE_LIMIT_MAX: positiveInt(10),
    // "mongo" shares the counts between serverless instances; "memory" counts per instance.
    RATE_LIMIT_STORE: z.enum(["mongo", "memory"]).optional(),
    // Email (password reset codes), over SMTP.
    SMTP_HOST: optionalString,
    SMTP_PORT: positiveInt(587),
    SMTP_SECURE: z.enum(["true", "false"]).optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    MAIL_FROM: optionalString,
    S3_BUCKET: z.string().default("mernbnb-images-bucket"),
    S3_REGION: z.string().default("eu-west-1"),
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
});

class ConfigError extends Error {}

// Validates the environment once at startup. Production refuses to start
// without a database URL and a strong JWT secret.
const loadConfig = (env = process.env) => {
    const parsed = schema.safeParse(env);
    if (!parsed.success) {
        const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new ConfigError(`Invalid environment: ${problems}`);
    }
    const e = parsed.data;
    const production = e.NODE_ENV === "production";

    if (production && !e.MONGO_URL) throw new ConfigError("MONGO_URL is required in production.");
    if (production && (!e.JWT_SECRET || e.JWT_SECRET.length < 32)) {
        throw new ConfigError("JWT_SECRET is required in production and must be at least 32 characters.");
    }

    return {
        env: e.NODE_ENV,
        isProduction: production,
        port: e.PORT,
        logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === "test" ? "silent" : production ? "info" : "debug"),
        mongoUrl: e.MONGO_URL,
        jwt: { secret: e.JWT_SECRET ?? DEV_JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
        corsOrigins: e.CORS_ORIGINS
            ? e.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
            : DEFAULT_CORS_ORIGINS[e.NODE_ENV],
        siteUrl: e.SITE_URL.replace(/\/+$/, ""),
        trustProxy: e.TRUST_PROXY ?? (production ? 1 : 0),
        rateLimit: {
            windowMs: e.RATE_LIMIT_WINDOW_MS,
            max: e.RATE_LIMIT_MAX,
            authMax: e.AUTH_RATE_LIMIT_MAX,
            writeMax: e.WRITE_RATE_LIMIT_MAX,
            uploadMax: e.UPLOAD_RATE_LIMIT_MAX,
            pageMax: e.PAGE_RATE_LIMIT_MAX,
            resetMax: e.RESET_RATE_LIMIT_MAX,
            store: e.RATE_LIMIT_STORE ?? (production ? "mongo" : "memory"),
        },
        // Without SMTP_HOST, development prints emails to the log and
        // production can't send them (password reset is then unavailable).
        mail: {
            transport: e.SMTP_HOST ? "smtp" : production ? "none" : "log",
            host: e.SMTP_HOST,
            port: e.SMTP_PORT,
            secure: e.SMTP_SECURE ? e.SMTP_SECURE === "true" : e.SMTP_PORT === 465,
            user: e.SMTP_USER,
            password: e.SMTP_PASSWORD,
            from: e.MAIL_FROM ?? `"AirBuenas" <no-reply@${new URL(e.SITE_URL).hostname}>`,
        },
        s3: {
            bucket: e.S3_BUCKET,
            region: e.S3_REGION,
            endpoint: e.S3_ENDPOINT?.replace(/\/$/, ""),
            accessKeyId: e.S3_ACCESS_KEY,
            secretAccessKey: e.S3_SECRET_ACCESS_KEY,
        },
    };
};

module.exports = { loadConfig, ConfigError, DEV_JWT_SECRET, DEFAULT_SITE_URL };
