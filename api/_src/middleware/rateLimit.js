const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { HttpError } = require("../errors");

// Rate limits (per IP, or per user once authenticated). Responses carry the
// standard RateLimit / RateLimit-Policy headers and a JSON 429 body.
const limiter = ({ name, windowMs, limit, message, keyByUser = false, skipSuccessfulRequests = false, store }) =>
    rateLimit({
        windowMs,
        limit,
        store,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skipSuccessfulRequests,
        keyGenerator: (req) => (keyByUser && req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
        handler: (req, res, next) => {
            // Repeated lines for one IP or user are the signature of abuse.
            req.log.warn(`Rate limit reached: ${name}`, {
                limiter: name,
                limit,
                windowMinutes: windowMs / 60_000,
                ...(keyByUser && req.user ? { userId: req.user.id } : { ip: req.ip }),
            });
            next(new HttpError(429, message));
        },
    });

const HOUR = 60 * 60 * 1000;

// `createStore(name)` supplies a store shared by every instance (see
// rateLimitStore.js). Without it each instance counts on its own, which
// multiplies the limits when the platform runs several.
const createRateLimiters = ({ windowMs, max, authMax, writeMax, uploadMax, pageMax, resetMax }, { createStore } = {}) => {
    const limits = {
        // Every API request.
        global: { name: "global", windowMs, limit: max, message: "Too many requests. Please slow down and try again shortly." },
        // Server-rendered pages, the sitemap and robots.txt. Higher than the
        // API limit so search engine crawlers aren't turned away.
        pages: { name: "pages", windowMs, limit: pageMax, message: "Too many requests. Please slow down and try again shortly." },
        // Login/register: only failed attempts count, to slow down password guessing.
        auth: { name: "auth", windowMs, limit: authMax, skipSuccessfulRequests: true, message: "Too many attempts. Please wait a few minutes and try again." },
        // Password reset: requesting codes, entering them and setting the password.
        reset: { name: "reset", windowMs, limit: resetMax, message: "Too many password reset attempts. Please wait a few minutes and try again." },
        // Creating listings and bookings.
        write: { name: "write", windowMs: HOUR, limit: writeMax, keyByUser: true, message: "You're doing that too often. Please try again later." },
        // Photo uploads (each can move up to 10 MB).
        upload: { name: "upload", windowMs: HOUR, limit: uploadMax, keyByUser: true, message: "Too many uploads. Please try again later." },
    };
    return Object.fromEntries(
        Object.entries(limits).map(([key, options]) => [key, limiter({ ...options, store: createStore?.(options.name) })])
    );
};

module.exports = { createRateLimiters };
