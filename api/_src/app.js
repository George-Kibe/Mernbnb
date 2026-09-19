const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { createHttpLogger } = require("./logger");
const { createRateLimiters } = require("./middleware/rateLimit");
const { requireAuth } = require("./middleware/auth");
const { notFoundHandler, errorHandler } = require("./middleware/errors");
const { createUsersRouter } = require("./routes/users");
const { createPlacesRouter } = require("./routes/places");
const { createBookingsRouter, createMeRouter } = require("./routes/bookings");
const { createUploadsRouter } = require("./routes/uploads");

// Builds the Express app. Dependencies are passed in so tests can supply
// their own database, storage and image fetcher.
const createApp = ({ config, logger, db, storage, fetchImage, now }) => {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", config.trustProxy);

    app.use(createHttpLogger(logger));
    app.use(helmet());
    app.use(
        cors({
            // Same-origin requests (no Origin header) are always fine.
            origin: (origin, done) => done(null, !origin || config.corsOrigins.includes(origin)),
            methods: ["GET", "POST", "PUT", "DELETE"],
            allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
            exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
            maxAge: 600,
        })
    );
    app.use(compression());
    app.use(express.json({ limit: "100kb" }));

    // Liveness + database readiness, for uptime checks. Not rate limited.
    app.get("/api/health", async (req, res) => {
        let database = "up";
        try {
            await db.connect();
        } catch {
            database = "down";
        }
        res.status(database === "up" ? 200 : 503).json({ status: database === "up" ? "ok" : "degraded", database, uptime: Math.round(process.uptime()) });
    });

    const limiters = createRateLimiters(config.rateLimit);
    const auth = requireAuth(config.jwt);
    const deps = { config, storage, limiters, auth, fetchImage, now };

    app.use("/api", limiters.global);
    app.use(["/api/users", "/api/places", "/api/bookings", "/api/me"], db.requireConnection);
    app.use("/api/users", createUsersRouter(deps));
    app.use("/api/places", createPlacesRouter(deps));
    app.use("/api/bookings", createBookingsRouter(deps));
    app.use("/api/me", createMeRouter(deps));
    app.use("/api/uploads", createUploadsRouter(deps));

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
};

module.exports = { createApp };
