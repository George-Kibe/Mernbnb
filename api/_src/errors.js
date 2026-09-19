// An error that maps to an HTTP response. Anything else becomes a 500.
class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const unauthorized = (message = "Please log in first.") => new HttpError(401, message);
const forbidden = (message = "You don't have access to this.") => new HttpError(403, message);
const notFound = (message = "Not found.") => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);
const serviceUnavailable = (message) => new HttpError(503, message);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, serviceUnavailable };
