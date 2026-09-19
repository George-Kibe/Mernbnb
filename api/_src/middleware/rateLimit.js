const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { HttpError } = require("../errors");

// Rate limits (per IP, or per user once authenticated). Responses carry the
// standard RateLimit / RateLimit-Policy headers and a JSON 429 body.
//
// The default store is in-memory, i.e. per server instance. That stops abuse
// from a single client against one instance; on serverless platforms with many
// instances, pair it with a shared store (e.g. Redis) or the platform's WAF.
const limiter = ({ windowMs, limit, message, keyByUser = false, skipSuccessfulRequests = false }) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skipSuccessfulRequests,
        keyGenerator: (req) => (keyByUser && req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
        handler: (req, res, next) => next(new HttpError(429, message)),
    });

const createRateLimiters = ({ windowMs, max, authMax, writeMax, uploadMax }) => ({
    // Every API request.
    global: limiter({ windowMs, limit: max, message: "Too many requests. Please slow down and try again shortly." }),
    // Login/register: only failed attempts count, to slow down password guessing.
    auth: limiter({ windowMs, limit: authMax, skipSuccessfulRequests: true, message: "Too many attempts. Please wait a few minutes and try again." }),
    // Creating listings and bookings.
    write: limiter({ windowMs: 60 * 60 * 1000, limit: writeMax, keyByUser: true, message: "You're doing that too often. Please try again later." }),
    // Photo uploads (each can move up to 10 MB).
    upload: limiter({ windowMs: 60 * 60 * 1000, limit: uploadMax, keyByUser: true, message: "Too many uploads. Please try again later." }),
});

module.exports = { createRateLimiters };
