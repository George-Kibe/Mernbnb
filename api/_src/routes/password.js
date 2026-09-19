const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const { validate } = require("../middleware/validate");
const { signToken } = require("../middleware/auth");
const { badRequest, serviceUnavailable } = require("../errors");
const { maskEmail } = require("../logger");
const { passwordResetCode, passwordChanged } = require("../lib/emails");
const { email, newPassword, BCRYPT_COST } = require("./users");

const CODE_MINUTES = 10;
const RESEND_AFTER_MS = 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_ATTEMPTS = 5;
const RESET_TOKEN_MINUTES = 15;
const PURPOSE = "password-reset";

const INVALID_CODE = "That code is incorrect or has expired. Check your latest email, or request a new code.";
const EXPIRED_RESET = "This password reset has expired. Please start again.";

const forgotBody = z.object({ email });
const verifyBody = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") });
const resetBody = z.object({ resetToken: z.string().min(1).max(2000), password: newPassword });

// Password reset with a one-time code sent by email:
//   1. POST /forgot { email }            -> 202, and a 6-digit code by email
//   2. POST /verify { email, code }      -> { resetToken } (valid 15 minutes, once)
//   3. POST /reset  { resetToken, password } -> { user, token }: logged in
// Answers never reveal whether an account exists. Codes are stored as HMACs,
// expire after 10 minutes and allow 5 guesses; an account gets at most one
// code a minute and 5 an hour, and every step is rate limited per IP.
const createPasswordRouter = ({ config, limiters, mailer, now = Date.now }) => {
    const router = express.Router();
    const secret = config.jwt.secret;
    const hashCode = (userId, code) => crypto.createHmac("sha256", secret).update(`${PURPOSE}:${userId}:${code}`).digest();

    router.use(limiters.reset);

    router.post("/forgot", validate({ body: forgotBody }), async (req, res) => {
        if (!mailer.enabled) {
            req.log.error("Password reset requested, but email isn't set up (set SMTP_HOST and friends)");
            throw serviceUnavailable("Password reset by email isn't available right now. Please try again later.");
        }
        const address = req.valid.body.email;
        const accepted = () =>
            res.status(202).json({ message: "If an account exists for that email, we've sent it a code.", resendAfterSeconds: RESEND_AFTER_MS / 1000 });

        // An unknown email gets the same answer. (Its timing differs, as no
        // email is sent, but sign-up already tells whether an email is taken.)
        const user = await User.findOne({ email: address });
        if (!user) {
            req.log.info("Password reset requested for an unknown email", { email: maskEmail(address) });
            return accepted();
        }
        const userId = String(user._id);
        const time = now();
        const current = await PasswordReset.findOne({ user: user._id });
        if (current && time - current.lastSentAt.getTime() < RESEND_AFTER_MS) {
            req.log.info("Password reset code not resent: asked again within a minute", { userId });
            return accepted();
        }
        const inWindow = current && time - current.windowStart.getTime() < SEND_WINDOW_MS;
        if (inWindow && current.sends >= MAX_SENDS_PER_WINDOW) {
            req.log.warn("Password reset code limit reached for an account", { userId, sends: current.sends });
            return accepted();
        }

        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
        const windowStart = inWindow ? current.windowStart : new Date(time);
        const expiresAt = new Date(time + CODE_MINUTES * 60 * 1000);
        const sends = inWindow ? current.sends + 1 : 1;
        await PasswordReset.findOneAndUpdate(
            { user: user._id },
            {
                $set: {
                    codeHash: hashCode(userId, code).toString("hex"),
                    expiresAt,
                    attempts: 0,
                    tokenId: null, // a new code cancels any reset in progress
                    sends,
                    windowStart,
                    lastSentAt: new Date(time),
                    purgeAt: new Date(Math.max(windowStart.getTime() + SEND_WINDOW_MS, expiresAt.getTime() + RESET_TOKEN_MINUTES * 60 * 1000)),
                },
            },
            { upsert: true }
        );

        try {
            await mailer.send({ to: user.email, ...passwordResetCode({ name: user.name, code, minutes: CODE_MINUTES }) });
            req.log.info("Password reset code sent", { userId, sends });
        } catch (err) {
            // Same answer (so it doesn't reveal the account), but let the user retry now.
            await PasswordReset.updateOne({ user: user._id }, { $set: { lastSentAt: new Date(0) }, $inc: { sends: -1 } });
            req.log.error("Could not send the password reset email", { userId, err });
        }
        accepted();
    });

    router.post("/verify", validate({ body: verifyBody }), async (req, res) => {
        const { email: address, code } = req.valid.body;
        const user = await User.findOne({ email: address });
        if (!user) throw badRequest(INVALID_CODE);
        const userId = String(user._id);

        // Use up an attempt first (atomically), so parallel guesses can't exceed the limit.
        const reset = await PasswordReset.findOneAndUpdate(
            { user: user._id, tokenId: null, expiresAt: { $gt: new Date(now()) }, attempts: { $lt: MAX_ATTEMPTS } },
            { $inc: { attempts: 1 } },
            { returnDocument: "after" }
        );
        if (!reset) {
            req.log.info("Password reset code refused: none active, expired or out of attempts", { userId });
            throw badRequest(INVALID_CODE);
        }
        if (!crypto.timingSafeEqual(hashCode(userId, code), Buffer.from(reset.codeHash, "hex"))) {
            req.log.warn("Wrong password reset code", { userId, attemptsLeft: MAX_ATTEMPTS - reset.attempts });
            throw badRequest(INVALID_CODE);
        }

        const tokenId = crypto.randomUUID();
        await PasswordReset.updateOne({ _id: reset._id }, { $set: { tokenId } });
        const resetToken = jwt.sign({ purpose: PURPOSE }, secret, {
            algorithm: "HS256",
            subject: userId,
            jwtid: tokenId,
            expiresIn: `${RESET_TOKEN_MINUTES}m`,
        });
        req.log.info("Password reset code accepted", { userId });
        res.json({ resetToken, expiresInSeconds: RESET_TOKEN_MINUTES * 60 });
    });

    router.post("/reset", validate({ body: resetBody }), async (req, res) => {
        const { resetToken, password } = req.valid.body;
        let payload;
        try {
            payload = jwt.verify(resetToken, secret, { algorithms: ["HS256"] });
        } catch (error) {
            req.log.info("Password reset token refused", { reason: error.message });
            throw badRequest(EXPIRED_RESET);
        }
        if (payload.purpose !== PURPOSE || !payload.sub || !payload.jti) {
            req.log.warn("A token that isn't a reset token was used to reset a password");
            throw badRequest(EXPIRED_RESET);
        }
        // Deleting it makes the token single-use.
        const reset = await PasswordReset.findOneAndDelete({ user: payload.sub, tokenId: payload.jti });
        const user = reset && (await User.findById(payload.sub));
        if (!user) {
            req.log.warn("Password reset token already used or replaced", { userId: payload.sub });
            throw badRequest(EXPIRED_RESET);
        }

        user.password = await bcrypt.hash(password, BCRYPT_COST);
        await user.save();
        req.log.info("Password changed with a reset code", { userId: String(user._id) });

        try {
            await mailer.send({ to: user.email, ...passwordChanged({ name: user.name, siteUrl: config.siteUrl }) });
        } catch (err) {
            req.log.error("Could not send the 'password changed' email", { userId: String(user._id), err });
        }
        res.json({ user: user.toJSON(), token: signToken(user, config.jwt) });
    });

    return router;
};

module.exports = { createPasswordRouter, PURPOSE, MAX_ATTEMPTS, MAX_SENDS_PER_WINDOW, CODE_MINUTES };
