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
        if (!id) return next(unauthorized("Your session is invalid. Please log in again."));
        req.user = { id: String(id), name: payload.name, email: payload.email };
        next();
    } catch (error) {
        next(unauthorized(error.name === "TokenExpiredError"
            ? "Your session has expired. Please log in again."
            : "Your session is invalid. Please log in again."));
    }
};

module.exports = { signToken, requireAuth };
