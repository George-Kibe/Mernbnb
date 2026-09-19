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
const db = createDatabase(config.mongoUrl, logger);
const storage = createPhotoStorage(config.s3, { logger });
const app = createApp({ config, logger, db, storage });

/* v8 ignore start -- process wiring, exercised by running the server */
if (require.main === module) {
    const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.env }, "API listening"));

    const shutdown = (signal) => {
        logger.info({ signal }, "Shutting down");
        server.close(() => {
            db.disconnect().finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
}
/* v8 ignore stop */

module.exports = app;
