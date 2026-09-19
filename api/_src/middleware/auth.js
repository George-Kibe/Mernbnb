const jwt = require("jsonwebtoken");
const { unauthorized } = require("../errors");

const signToken = (user, { secret, expiresIn }) =>
    jwt.sign({ id: String(user._id), name: user.name, email: user.email }, secret, {
        algorithm: "HS256",
        expiresIn,
        subject: String(user._id),
    });

// Verifies `Authorization: Bearer <token>` and sets req.user = { id, name, email }.
const requireAuth = ({ secret }) => (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return next(unauthorized());
    try {
        const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
        const id = payload.sub ?? payload.id;
        // Tokens made for something else (e.g. a password reset) aren't sessions.
        if (payload.purpose) {
            req.log.warn("Rejected a token that isn't a session token", { purpose: payload.purpose });
            return next(unauthorized("Your session is invalid. Please log in again."));
        }
        if (!id) {
            req.log.warn("Rejected a token without a user id");
            return next(unauthorized("Your session is invalid. Please log in again."));
        }
        req.user = { id: String(id), name: payload.name, email: payload.email };
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            req.log.info("Session expired", { expiredAt: error.expiredAt });
            return next(unauthorized("Your session has expired. Please log in again."));
        }
        // A bad signature or a malformed token: tampering, or a token signed
        // with an old JWT_SECRET.
        req.log.warn("Rejected an invalid token", { reason: error.message });
        next(unauthorized("Your session is invalid. Please log in again."));
    }
};

module.exports = { signToken, requireAuth };
