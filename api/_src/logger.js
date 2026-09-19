const crypto = require("crypto");
const pino = require("pino");
const pinoHttp = require("pino-http");

// Never log credentials or personal secrets.
const REDACT = [
    "req.headers.authorization",
    "req.headers.cookie",
    'res.headers["set-cookie"]',
    "*.password",
    "*.token",
];

const hasPrettyPrinter = () => {
    try {
        require.resolve("pino-pretty");
        return true;
    } catch {
        return false;
    }
};

// JSON logs (one line per event) in production; pretty output in development
// when pino-pretty is installed. `destination` lets tests capture output.
const createLogger = (config, { destination, pretty = config.env === "development" && hasPrettyPrinter() } = {}) => {
    const options = { level: config.logLevel, redact: { paths: REDACT, censor: "[redacted]" }, base: { service: "airbuenas-api" } };
    if (pretty && !destination) {
        return pino({ ...options, transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } } });
    }
    return destination ? pino(options, destination) : pino(options);
};

// Accept a caller-provided request id only if it looks sane.
const REQUEST_ID = /^[A-Za-z0-9._-]{1,100}$/;

// One log line per request with method, path, status, duration and a request
// id (echoed back in X-Request-Id so users can quote it in bug reports).
const createHttpLogger = (logger) =>
    pinoHttp({
        logger,
        genReqId: (req, res) => {
            const incoming = req.headers["x-request-id"];
            const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
            res.setHeader("X-Request-Id", id);
            return id;
        },
        customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
        autoLogging: { ignore: (req) => req.url === "/api/health" },
        serializers: {
            req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
            res: (res) => ({ statusCode: res.statusCode }),
        },
    });

module.exports = { createLogger, createHttpLogger, hasPrettyPrinter };
