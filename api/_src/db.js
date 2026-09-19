const mongoose = require("mongoose");
const { serviceUnavailable } = require("./errors");

// "mongodb+srv://user:pass@cluster0.abc.mongodb.net/db?x=1" -> "cluster0.abc.mongodb.net",
// for logs: which database, never the credentials.
const databaseHost = (url) => String(url).replace(/^[a-z+]+:\/\/(?:[^@/]*@)?([^/?]*).*$/i, "$1");

// Connections whose events are already logged (tests create many databases
// on the one shared mongoose connection).
const watched = new WeakSet();

// One shared connection, opened lazily and reused across requests (and warm
// serverless invocations). Fails fast so a dead database becomes a 503
// instead of a function timeout.
const createDatabase = (url, logger, { connection = mongoose } = {}) => {
    let pending = null;
    const host = url ? databaseHost(url) : undefined;

    // Drops and recoveries after the first connection, e.g. an Atlas failover.
    const watch = () => {
        const events = connection.connection;
        if (typeof events?.on !== "function" || watched.has(events)) return;
        watched.add(events);
        events.on("disconnected", () => logger.warn("MongoDB disconnected", { host }));
        events.on("reconnected", () => logger.info("MongoDB reconnected", { host }));
        events.on("error", (err) => logger.error("MongoDB connection error", { host, err }));
    };

    const connect = () => {
        if (!url) return Promise.reject(new Error("MONGO_URL is not set."));
        if (!pending) {
            const started = Date.now();
            logger.info("Connecting to MongoDB", { host });
            pending = connection
                .connect(url, { serverSelectionTimeoutMS: 5000 })
                .then(() => {
                    logger.info("MongoDB connected", { host, durationMs: Date.now() - started });
                    watch();
                })
                .catch((err) => {
                    pending = null; // retry on the next request
                    logger.error("MongoDB connection failed; requests that need it get a 503", { host, durationMs: Date.now() - started, err });
                    throw err;
                });
        }
        return pending;
    };

    // Express middleware for routes that need the database. connect() logs
    // the failure; the request line shows the 503.
    const requireConnection = async (req, res, next) => {
        try {
            await connect();
            next();
        } catch {
            next(serviceUnavailable("Database unavailable. Try again later."));
        }
    };

    const isConnected = () => connection.connection.readyState === 1;
    const disconnect = () => connection.disconnect();

    return { connect, requireConnection, isConnected, disconnect };
};

module.exports = { createDatabase, databaseHost };
