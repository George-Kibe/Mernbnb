const mongoose = require("mongoose");

// A rate-limit store in MongoDB, so every serverless instance counts against
// the same totals. The in-memory store (express-rate-limit's default) counts
// per instance, which multiplies the limit by however many are running.
//
// Each limiter gets its own store with its own `prefix`, so a client's API
// requests and page requests are counted separately. Documents expire by
// themselves (a TTL index), and if the database can't be reached the request
// is allowed rather than failed.
const COLLECTION = "ratelimits";

const createMongoStore = ({ prefix = "", connection = mongoose, logger, now = Date.now, collectionName = COLLECTION } = {}) => {
    let indexed = null;
    const collection = () => connection.connection.collection(collectionName);
    // Created once per process; MongoDB ignores it if it already exists.
    const ready = () => {
        indexed ??= collection()
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
            .catch((err) => {
                indexed = null; // try again next time
                logger?.warn("Could not create the rate limit index", { err });
            });
        return indexed;
    };

    let windowMs = 60_000;
    const id = (key) => `${prefix}${key}`;

    // A failure here must not fail the request: the limiter is a guard rail,
    // not the point of the request.
    const failOpen = (err, action) => {
        logger?.warn(`Rate limit store unavailable (${action}); this request isn't counted`, { err });
    };

    return {
        localKeys: false,

        init(options) {
            windowMs = options.windowMs;
        },

        async increment(key) {
            const time = now();
            const fresh = new Date(time + windowMs);
            try {
                await ready();
                const current = new Date(time);
                const doc = await collection().findOneAndUpdate(
                    { _id: id(key) },
                    [
                        {
                            // An expired document starts a new window instead of adding to the old one.
                            $set: {
                                hits: { $cond: [{ $gt: ["$expiresAt", current] }, { $add: ["$hits", 1] }, 1] },
                                expiresAt: { $cond: [{ $gt: ["$expiresAt", current] }, "$expiresAt", fresh] },
                            },
                        },
                    ],
                    { upsert: true, returnDocument: "after" }
                );
                return { totalHits: doc.hits, resetTime: doc.expiresAt };
            } catch (err) {
                failOpen(err, "counting");
                return { totalHits: 0, resetTime: fresh };
            }
        },

        // For limits that only count failures (`skipSuccessfulRequests`).
        async decrement(key) {
            try {
                await collection().updateOne({ _id: id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
            } catch (err) {
                failOpen(err, "uncounting");
            }
        },

        async resetKey(key) {
            try {
                await collection().deleteOne({ _id: id(key) });
            } catch (err) {
                failOpen(err, "resetting");
            }
        },

        async get(key) {
            try {
                const doc = await collection().findOne({ _id: id(key) });
                if (!doc || doc.expiresAt <= new Date(now())) return undefined;
                return { totalHits: doc.hits, resetTime: doc.expiresAt };
            } catch (err) {
                failOpen(err, "reading");
                return undefined;
            }
        },
    };
};

module.exports = { createMongoStore, COLLECTION };
