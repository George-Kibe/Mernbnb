const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { createHttpLogger } = require("./logger");
const { createRateLimiters } = require("./middleware/rateLimit");
const { requireAuth } = require("./middleware/auth");
const { notFoundHandler, errorHandler } = require("./middleware/errors");
const { createUsersRouter } = require("./routes/users");
const { createPasswordRouter } = require("./routes/password");
const { createMailer } = require("./lib/mailer");
const { createPlacesRouter } = require("./routes/places");
const { createBookingsRouter, createMeRouter } = require("./routes/bookings");
const { createUploadsRouter } = require("./routes/uploads");
const { createPhotosRouter } = require("./routes/photos");
const { createSeoRouter } = require("./seo/router");
const { createShellLoader } = require("./seo/shell");

// Builds the Express app. Dependencies are passed in so tests can supply
// their own database, storage, image fetcher, mailer and page template.
const createApp = ({ config, logger, db, storage, fetchImage, now, loadShell = createShellLoader({ logger }), mailer = createMailer(config.mail, { logger }) }) => {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", config.trustProxy);

    app.use(createHttpLogger(logger));
    app.use(helmet());
    const corsOptions = {
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
        exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
        maxAge: 600,
    };
    app.use(
        cors((req, done) => {
            // Requests without an Origin header, and from the site itself, are always fine.
            const origin = req.get("origin");
            const allowed = !origin || origin === config.siteUrl || config.corsOrigins.includes(origin);
            if (!allowed) req.log.warn("CORS: origin not allowed, so browsers will block the response", { origin, hint: "add it to CORS_ORIGINS if it's yours" });
            done(null, { ...corsOptions, origin: allowed });
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
    const deps = { config, storage, limiters, auth, fetchImage, mailer, now };

    // Photo redirects are cached by the CDN and fetched by image crawlers, so
    // they get the higher page limit rather than the API one.
    app.use("/api/photos", limiters.pages, createPhotosRouter(deps));
    app.use("/api", limiters.global);
    app.use(["/api/users", "/api/places", "/api/bookings", "/api/me"], db.requireConnection);
    app.use("/api/users/password", createPasswordRouter(deps));
    app.use("/api/users", createUsersRouter(deps));
    app.use("/api/places", createPlacesRouter(deps));
    app.use("/api/bookings", createBookingsRouter(deps));
    app.use("/api/me", createMeRouter(deps));
    app.use("/api/uploads", createUploadsRouter(deps));

    app.use("/api", notFoundHandler);

    // Listing and destination pages, sitemap.xml, robots.txt and HTML 404s.
    app.use(createSeoRouter({ ...deps, db, loadShell }));

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
};

module.exports = { createApp };
