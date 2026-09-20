const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { unauthorized } = require("../errors");

const signToken = (user, { secret, expiresIn }) =>
    jwt.sign({ id: String(user._id), name: user.name, email: user.email }, secret, {
        algorithm: "HS256",
        expiresIn,
        subject: String(user._id),
    });

// Verifies `Authorization: Bearer <token>` and sets req.user = { id, name, email }.
// The account is read as well, so tokens for deleted accounts, and tokens
// issued before a password reset, stop working.
const requireAuth = ({ secret }) => async (req, res, next) => {
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
        const account = await User.findById(id).select("passwordChangedAt").lean();
        if (!account) {
            req.log.info("Token for an account that no longer exists", { userId: String(id) });
            return next(unauthorized("Your session is invalid. Please log in again."));
        }
        // Both in whole seconds: a token minted in the same second as the
        // change (the one the reset hands back) stays valid.
        if (account.passwordChangedAt && payload.iat < Math.floor(account.passwordChangedAt.getTime() / 1000)) {
            req.log.info("Session ended by a password change", { userId: String(id) });
            return next(unauthorized("Your password was changed. Please log in again."));
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
