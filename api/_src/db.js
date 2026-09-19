const mongoose = require("mongoose");
const { serviceUnavailable } = require("./errors");

// One shared connection, opened lazily and reused across requests (and warm
// serverless invocations). Fails fast so a dead database becomes a 503
// instead of a function timeout.
const createDatabase = (url, logger, { connection = mongoose } = {}) => {
    let pending = null;

    const connect = () => {
        if (!url) return Promise.reject(new Error("MONGO_URL is not set."));
        pending ??= connection
            .connect(url, { serverSelectionTimeoutMS: 5000 })
            .then(() => {
                logger.info("MongoDB connected");
            })
            .catch((error) => {
                pending = null; // retry on the next request
                throw error;
            });
        return pending;
    };

    // Express middleware for routes that need the database.
    const requireConnection = async (req, res, next) => {
        try {
            await connect();
            next();
        } catch (error) {
            req.log.error({ err: error }, "MongoDB connection failed");
            next(serviceUnavailable("Database unavailable. Try again later."));
        }
    };

    const isConnected = () => connection.connection.readyState === 1;
    const disconnect = () => connection.disconnect();

    return { connect, requireConnection, isConnected, disconnect };
};

module.exports = { createDatabase };
