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

    if (status >= 500) req.log.error({ err }, "Request failed");
    res.status(status).json({ error: message, ...(details && { details }), requestId: req.id });
};

module.exports = { notFoundHandler, errorHandler };
