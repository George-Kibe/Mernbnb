const jwt = require("jsonwebtoken");

// TODO(P0 #1 in CLAUDE.md): require JWT_SECRET and drop the fallback. The
// fallback keeps tokens issued before this change valid.
const jwtSecret = process.env.JWT_SECRET || "ugbnuwnfuwi7371gyrjfkwg20";

// Verifies `Authorization: Bearer <token>` and exposes the user as req.user.
const requireAuth = (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        res.status(401).json("Please log in first.");
        return;
    }
    try {
        const { id, name, email } = jwt.verify(token, jwtSecret);
        req.user = { id, name, email };
        next();
    } catch {
        res.status(401).json("Your session is invalid. Please log in again.");
    }
};

module.exports = { jwtSecret, requireAuth };
