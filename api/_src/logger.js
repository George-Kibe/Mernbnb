const crypto = require("crypto");
const winston = require("winston");

const { format } = winston;
const SERVICE = "airbuenas-api";

// LOG_LEVEL -> winston level. "fatal" and "trace" are kept for older configs.
const LEVELS = { fatal: "error", error: "error", warn: "warn", info: "info", http: "http", verbose: "verbose", debug: "debug", trace: "silly" };

// Never log credentials or secrets, at any depth. Matched on the key name.
const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|password|token|access_?token|refresh_?token|secret|jwt_?secret|secret_?access_?key|access_?key_?id)$/i;
const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

const serializeError = (error) => ({
    name: error.name,
    message: error.message,
    ...(error.code !== undefined && { code: error.code }),
    ...(error.status !== undefined && { status: error.status }),
    stack: error.stack,
    ...(error.cause instanceof Error && { cause: serializeError(error.cause) }),
});

// A log-safe copy of `value`: secrets redacted, errors with their stack,
// dates and ObjectIds as strings, cycles and very deep nesting cut off.
const sanitize = (value, depth = 0, seen = new WeakSet()) => {
    if (value instanceof Error) return serializeError(value);
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "[circular]";
    if (depth >= MAX_DEPTH) return "[truncated]";
    seen.add(value);
    if (Buffer.isBuffer(value)) return `[${value.length} bytes]`;
    if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1, seen));
    if (typeof value.toJSON === "function") return sanitize(value.toJSON(), depth + 1, seen);
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1, seen);
    return copy;
};

// Applies sanitize() to every field of a log entry except winston's own.
const redact = format((info) => {
    for (const key of Object.keys(info)) {
        if (key === "level" || key === "message") continue;
        info[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(info[key]);
    }
    return info;
});

// Development: "12:04:05 info  [3f2a1c9e] Listing created {"placeId":"…"}",
// with an error's stack on the lines below.
const readable = format.printf(({ timestamp, level, message, service: _service, requestId, err, ...meta }) => {
    const id = requestId ? `[${String(requestId).slice(0, 8)}] ` : "";
    const details = { ...meta, ...(err && { err: { ...err, stack: undefined } }) };
    const extra = Object.values(details).some((v) => v !== undefined) ? ` ${JSON.stringify(details)}` : "";
    return `${timestamp} ${level} ${id}${message}${extra}${err?.stack ? `\n${err.stack}` : ""}`;
});

// JSON logs (one line per event) in production; readable, coloured lines in
// development. `stream` lets tests capture output. Use it as
// logger.info("What happened", { details }) and pass errors as `err`.
const createLogger = (config, { stream, pretty = config.env === "development" } = {}) =>
    winston.createLogger({
        level: LEVELS[config.logLevel] ?? "info",
        silent: config.logLevel === "silent",
        defaultMeta: { service: SERVICE },
        format: format.combine(
            format.errors({ stack: true }),
            redact(),
            pretty
                ? format.combine(format.timestamp({ format: "HH:mm:ss" }), format.colorize(), readable)
                : format.combine(format.timestamp(), format.json())
        ),
        transports: [stream ? new winston.transports.Stream({ stream }) : new winston.transports.Console({ stderrLevels: ["error"] })],
        exitOnError: false,
    });

// "amina@example.com" -> "a***@example.com": enough to spot a pattern (e.g.
// one account under attack) without storing the address.
const maskEmail = (email) => {
    const [name, domain] = String(email ?? "").split("@");
    return domain ? `${name.slice(0, 1)}***@${domain}` : "***";
};

// Accept a caller-provided request id only if it looks sane.
const REQUEST_ID = /^[A-Za-z0-9._-]{1,100}$/;
const QUIET_PATHS = new Set(["/api/health"]); // polled by uptime checks

// Gives each request an id (echoed back in X-Request-Id so users can quote it
// in bug reports) and a child logger, req.log, that tags every line with it.
// When the response ends, logs one line with method, URL, status, duration,
// client IP, user (if logged in) and the error message for 4xx/5xx.
const createHttpLogger = (logger) => (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    req.id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader("X-Request-Id", req.id);
    req.log = logger.child({ requestId: req.id });
    if (QUIET_PATHS.has(req.path)) return next();

    const started = process.hrtime.bigint();
    let logged = false;
    const log = (aborted) => {
        if (logged) return;
        logged = true;
        const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10;
        const status = res.statusCode;
        const level = aborted ? "warn" : status >= 500 ? "error" : status >= 400 ? "warn" : "info";
        req.log.log(level, `${req.method} ${req.originalUrl} ${aborted ? "aborted" : status} in ${durationMs} ms`, {
            http: {
                method: req.method,
                url: req.originalUrl,
                status,
                durationMs,
                ip: req.ip,
                userAgent: req.get("user-agent"),
                ...(aborted && { aborted: true }),
            },
            ...(req.user && { userId: req.user.id }),
            ...(res.locals.error && { error: res.locals.error }),
        });
    };
    res.on("finish", () => log(false));
    // The client went away before the response was sent.
    res.on("close", () => log(!res.writableFinished));
    next();
};

module.exports = { createLogger, createHttpLogger, maskEmail, sanitize, LEVELS };
