const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const { validate } = require("../middleware/validate");
const { signToken } = require("../middleware/auth");
const { conflict, unauthorized, notFound } = require("../errors");
const { maskEmail } = require("../logger");

const BCRYPT_COST = 10;

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));
const newPassword = z.string().min(8, "Use at least 8 characters for your password.").max(128, "Password is too long.");
const registerBody = z.object({
    name: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long."),
    email,
    password: newPassword,
});
const loginBody = z.object({
    email,
    password: z.string().min(1, "Enter your password.").max(128),
});

const createUsersRouter = ({ config, limiters, auth }) => {
    const router = express.Router();

    router.post("/register", limiters.auth, validate({ body: registerBody }), async (req, res) => {
        const { name, email: address, password } = req.valid.body;
        const duplicate = () => {
            req.log.info("Registration refused: email already registered", { email: maskEmail(address) });
            return conflict("An account with this email already exists.");
        };
        if (await User.exists({ email: address })) throw duplicate();
        try {
            const user = await User.create({ name, email: address, password: await bcrypt.hash(password, BCRYPT_COST) });
            req.log.info("Account created", { userId: String(user._id) });
            res.status(201).json({ user });
        } catch (error) {
            // Lost a race with a concurrent registration.
            if (error.code === 11000) throw duplicate();
            throw error;
        }
    });

    router.post("/login", limiters.auth, validate({ body: loginBody }), async (req, res) => {
        const { email: address, password } = req.valid.body;
        const user = await User.findOne({ email: address }).select("+password");
        // Same answer for an unknown email and a wrong password; the log says which.
        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.log.warn("Login failed", { email: maskEmail(address), reason: user ? "wrong password" : "no such account" });
            throw unauthorized("Incorrect email or password.");
        }
        req.log.info("Logged in", { userId: String(user._id) });
        res.json({ user: user.toJSON(), token: signToken(user, config.jwt) });
    });

    router.get("/me", auth, async (req, res) => {
        const user = await User.findById(req.user.id);
        if (!user) throw notFound("Account not found.");
        res.json({ user });
    });

    return router;
};

module.exports = { createUsersRouter, email, newPassword, BCRYPT_COST };
