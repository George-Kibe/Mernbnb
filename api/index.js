// Entry point. On Vercel this file is the serverless function (it exports the
// Express app); locally `npm start` / `npm run dev` runs it as a server.
// Everything else lives in _src/: Vercel turns every .js file under api/ into
// a function unless its folder starts with an underscore.
// Tests supply their own environment; never load real credentials from .env.
if (process.env.NODE_ENV !== "test") require("dotenv").config({ quiet: true });
const { loadConfig } = require("./_src/config");
const { createLogger } = require("./_src/logger");
const { createDatabase } = require("./_src/db");
const { createPhotoStorage } = require("./_src/lib/s3");
const { createApp } = require("./_src/app");

const config = loadConfig();
const logger = createLogger(config);
// One line per start (on Vercel, per cold start) with the settings that
// explain later behaviour. Never secrets.
logger.info("API starting", {
    env: config.env,
    node: process.version,
    logLevel: config.logLevel,
    siteUrl: config.siteUrl,
    corsOrigins: config.corsOrigins,
    trustProxy: config.trustProxy,
    rateLimit: config.rateLimit,
    database: config.mongoUrl ? "configured" : "missing",
    email: config.mail.transport === "smtp" ? `smtp ${config.mail.host}:${config.mail.port}` : config.mail.transport === "log" ? "printed to the log (development)" : "not set up: password reset is off",
    s3: {
        bucket: config.s3.bucket,
        region: config.s3.region,
        endpoint: config.s3.endpoint ?? "aws",
        credentials: config.s3.accessKeyId ? "access key" : "default AWS chain",
    },
});
const db = createDatabase(config.mongoUrl, logger);
const storage = createPhotoStorage(config.s3, { logger });
const app = createApp({ config, logger, db, storage });

/* v8 ignore start -- process wiring, exercised by running the server */
if (require.main === module) {
    const server = app.listen(config.port, () => logger.info(`API listening on port ${config.port}`, { port: config.port, env: config.env }));

    const shutdown = (signal) => {
        logger.info("Shutting down: finishing open requests", { signal });
        server.close(() => {
            logger.info("HTTP server closed");
            db.disconnect().finally(() => process.exit(0));
        });
        setTimeout(() => {
            logger.error("Shutdown took longer than 10 s; exiting anyway");
            process.exit(1);
        }, 10_000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("unhandledRejection", (reason) => logger.error("Unhandled promise rejection", { err: reason }));
    process.on("uncaughtException", (err) => {
        logger.error("Uncaught exception; exiting", { err });
        process.exit(1);
    });
}
/* v8 ignore stop */

module.exports = app;
