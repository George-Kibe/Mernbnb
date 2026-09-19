const { HttpError, notFound } = require("../errors");

// Unknown /api routes: JSON 404 instead of Express's HTML page.
const notFoundHandler = (req, res, next) => next(notFound("That endpoint doesn't exist."));

// Every error becomes `{ error, details?, requestId }`. Internal details and
// stack traces are logged, never sent to the client.
const errorHandler = (err, req, res, next) => {
    let status = 500;
    let message = "Something went wrong on our side. Please try again.";
    let details;

    if (err instanceof HttpError) {
        ({ status, message, details } = err);
    } else if (err.type === "entity.parse.failed") {
        status = 400;
        message = "The request body isn't valid JSON.";
    } else if (err.type === "entity.too.large") {
        status = 413;
        message = "The request body is too large.";
    } else if (err.name === "ValidationError" && err.errors) {
        // Mongoose schema validation that slipped past request validation.
        status = 400;
        details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
        message = details[0]?.message ?? "Invalid data.";
    }

    // The request log line (logger.js) reports this message and the fields
    // that failed validation, so a 4xx says why without another log line.
    res.locals.error = details?.length ? `${message} (${details.map((d) => d.field).join(", ")})` : message;
    if (status >= 500) req.log.error("Request failed", { err, status });
    res.status(status).json({ error: message, ...(details && { details }), requestId: req.id });
};

module.exports = { notFoundHandler, errorHandler };
