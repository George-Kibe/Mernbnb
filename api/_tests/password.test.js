import { describe, it, expect, beforeAll, beforeEach, afterAll, inject, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const jwt = require("jsonwebtoken");
const h = require("./helpers");
const { createMailer, MailUnavailableError } = require("../_src/lib/mailer");
const { passwordResetCode, passwordChanged } = require("../_src/lib/emails");
const { MAX_ATTEMPTS, MAX_SENDS_PER_WINDOW } = require("../_src/routes/password");

const MINUTE = 60 * 1000;
const GENERIC = "If an account exists for that email, we've sent it a code.";
const INVALID_CODE = "That code is incorrect or has expired. Check your latest email, or request a new code.";
const EXPIRED = "This password reset has expired. Please start again.";

let clock = Date.parse("2030-01-01T10:00:00Z");
let mailer;
let app;
let db;
const logs = h.captureLogger();
beforeAll(async () => {
    mailer = h.fakeMailer();
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), now: () => clock, mailer, logger: logs.logger }));
    await db.connect();
});
let user;
beforeEach(async () => {
    await h.clearDatabase();
    mailer.sent.length = 0;
    logs.lines.length = 0;
    clock += 24 * 60 * MINUTE; // a fresh hour for every test
    ({ user } = await h.createUser({ name: "Amina <b>", email: "amina@example.com" }));
});
afterAll(() => h.closeDatabase());

const forgot = (email = "amina@example.com", target = app) => request(target).post("/api/users/password/forgot").send({ email });
const verify = (code, email = "amina@example.com") => request(app).post("/api/users/password/verify").send({ email, code });
const reset = (resetToken, password = "a brand new password") => request(app).post("/api/users/password/reset").send({ resetToken, password });
const lastCode = () => mailer.sent.at(-1).text.match(/\b(\d{6})\b/)[1];
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

describe("POST /api/users/password/forgot", () => {
    it("emails a 6-digit code, storing only a hash of it", async () => {
        const res = await forgot("  AMINA@example.com ").expect(202);
        expect(res.body).toEqual({ message: GENERIC, resendAfterSeconds: 60 });
        expect(mailer.sent).toHaveLength(1);
        const [mail] = mailer.sent;
        const code = lastCode();
        expect(mail).toMatchObject({ to: "amina@example.com", subject: `${code} is your AirBuenas password reset code` });
        expect(mail.text).toContain("expires in 10 minutes");
        expect(mail.html).toContain(`>${code}</p>`);
        expect(mail.html).toContain("Hi Amina &lt;b&gt;,"); // names are escaped
        const stored = await h.PasswordReset.findOne({ user: user._id }).lean();
        expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(stored)).not.toContain(code);
        expect(JSON.stringify(logs.lines)).not.toContain(code);
        expect(logs.find("Password reset code sent")).toMatchObject({ userId: String(user._id), sends: 1 });
    });

    it("answers the same for unknown emails, without sending anything", async () => {
        const res = await forgot("nobody@example.com").expect(202);
        expect(res.body.message).toBe(GENERIC);
        expect(mailer.sent).toHaveLength(0);
        expect(logs.find("Password reset requested for an unknown email")).toMatchObject({ email: "n***@example.com" });
    });

    it("sends at most one code a minute, and a new code replaces the old one", async () => {
        await forgot().expect(202);
        const first = lastCode();
        await forgot().expect(202);
        expect(mailer.sent).toHaveLength(1);
        clock += MINUTE + 1;
        await forgot().expect(202);
        expect(mailer.sent).toHaveLength(2);
        const second = lastCode();
        if (first !== second) await verify(first).expect(400);
        await verify(second).expect(200);
    });

    it(`sends at most ${MAX_SENDS_PER_WINDOW} codes an hour to one account`, async () => {
        for (let i = 0; i < MAX_SENDS_PER_WINDOW + 2; i++) {
            await forgot().expect(202);
            clock += MINUTE + 1;
        }
        expect(mailer.sent).toHaveLength(MAX_SENDS_PER_WINDOW);
        expect(logs.find("Password reset code limit reached for an account")).toMatchObject({ level: "warn" });
        clock += 60 * MINUTE;
        await forgot().expect(202);
        expect(mailer.sent).toHaveLength(MAX_SENDS_PER_WINDOW + 1);
    });

    it("lets the user try again right away when the email couldn't be sent", async () => {
        const failing = { enabled: true, send: vi.fn().mockRejectedValueOnce(new Error("SMTP down")).mockResolvedValue({}) };
        const { app: flaky } = h.makeApp({ db, mailer: failing, now: () => clock, logger: logs.logger });
        await forgot(undefined, flaky).expect(202); // doesn't reveal the account
        expect(logs.find("Could not send the password reset email")).toMatchObject({ level: "error", err: { message: "SMTP down" } });
        await forgot(undefined, flaky).expect(202);
        expect(failing.send).toHaveBeenCalledTimes(2);
        expect((await h.PasswordReset.findOne({ user: user._id })).sends).toBe(1);
    });

    it("is unavailable, and says so, when email isn't set up", async () => {
        const { app: noMail } = h.makeApp({ db, mailer: createMailer({ transport: "none" }) });
        const res = await forgot(undefined, noMail).expect(503);
        expect(res.body.error).toMatch(/isn't available right now/);
    });

    it("validates the email", async () => {
        await forgot("not-an-email").expect(400);
    });
});

describe("POST /api/users/password/verify", () => {
    it("exchanges the right code for a single-purpose reset token", async () => {
        await forgot();
        const res = await verify(lastCode()).expect(200);
        expect(res.body.expiresInSeconds).toBe(900);
        const payload = jwt.decode(res.body.resetToken);
        expect(payload).toMatchObject({ purpose: "password-reset", sub: String(user._id) });
        expect(payload.exp - payload.iat).toBe(900);
        // It isn't a login.
        await request(app).get("/api/users/me").set("Authorization", `Bearer ${res.body.resetToken}`).expect(401);
        expect(logs.find("Rejected a token that isn't a session token")).toBeTruthy();
        // The code is used up.
        await verify(lastCode()).expect(400);
    });

    it(`allows ${MAX_ATTEMPTS} guesses per code`, async () => {
        await forgot();
        const code = lastCode();
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const res = await verify(wrong(code)).expect(400);
            expect(res.body.error).toBe(INVALID_CODE);
        }
        expect(logs.find("Wrong password reset code")).toMatchObject({ attemptsLeft: MAX_ATTEMPTS - 1 });
        await verify(code).expect(400); // even the right one, now
        clock += MINUTE + 1;
        await forgot();
        await verify(lastCode()).expect(200); // a new code starts over
    });

    it("refuses expired codes, unknown emails and badly formed codes", async () => {
        await forgot();
        const code = lastCode();
        clock += 10 * MINUTE + 1;
        expect((await verify(code).expect(400)).body.error).toBe(INVALID_CODE);
        expect((await verify(code, "nobody@example.com").expect(400)).body.error).toBe(INVALID_CODE);
        expect((await verify("12ab56").expect(400)).body.error).toBe("Enter the 6-digit code from the email.");
    });
});

describe("POST /api/users/password/reset", () => {
    const resetToken = async () => {
        await forgot();
        return (await verify(lastCode()).expect(200)).body.resetToken;
    };

    it("sets the new password, logs the user in and confirms by email", async () => {
        const token = await resetToken();
        const res = await reset(token).expect(200);
        expect(res.body.user).toMatchObject({ _id: String(user._id), email: "amina@example.com" });
        expect(res.body.user.password).toBeUndefined();
        await request(app).get("/api/users/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);

        await request(app).post("/api/users/login").send({ email: "amina@example.com", password: h.PASSWORD }).expect(401);
        await request(app).post("/api/users/login").send({ email: "amina@example.com", password: "a brand new password" }).expect(200);

        expect(mailer.sent.at(-1)).toMatchObject({ to: "amina@example.com", subject: "Your AirBuenas password was changed" });
        expect(mailer.sent.at(-1).text).toContain("https://mernbnb.vercel.app/forgot-password");
        expect(await h.PasswordReset.countDocuments()).toBe(0);
        expect(logs.find("Password changed with a reset code")).toMatchObject({ userId: String(user._id) });
        expect(JSON.stringify(logs.lines)).not.toContain("a brand new password");
    });

    it("works once per token", async () => {
        const token = await resetToken();
        await reset(token).expect(200);
        expect((await reset(token, "another password 2").expect(400)).body.error).toBe(EXPIRED);
    });

    it("is cancelled by asking for a new code", async () => {
        const token = await resetToken();
        clock += MINUTE + 1;
        await forgot();
        await reset(token).expect(400);
    });

    it("refuses expired, forged and session tokens", async () => {
        const token = await resetToken();
        clock += 16 * MINUTE;
        vi.useFakeTimers({ now: Date.now() + 16 * MINUTE, toFake: ["Date"] });
        try {
            await reset(token).expect(400);
        } finally {
            vi.useRealTimers();
        }
        await reset("not.a.token").expect(400);
        await reset(jwt.sign({ purpose: "password-reset", sub: String(user._id), jti: "x" }, "some other secret")).expect(400);
        const { token: session } = await h.createUser();
        expect((await reset(session).expect(400)).body.error).toBe(EXPIRED);
        expect(logs.find("A token that isn't a reset token was used to reset a password")).toBeTruthy();
    });

    it("refuses a token for an account that no longer exists", async () => {
        const token = await resetToken();
        await h.User.deleteOne({ _id: user._id });
        await reset(token).expect(400);
    });

    it("requires a strong enough password", async () => {
        const token = await resetToken();
        expect((await reset(token, "short").expect(400)).body.error).toBe("Use at least 8 characters for your password.");
    });

    it("still succeeds when the confirmation email fails", async () => {
        const send = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("SMTP down"));
        const { app: flaky } = h.makeApp({ db, mailer: { enabled: true, send }, now: () => clock, logger: logs.logger });
        await request(flaky).post("/api/users/password/forgot").send({ email: "amina@example.com" }).expect(202);
        const code = send.mock.calls[0][0].text.match(/\b(\d{6})\b/)[1];
        const { body } = await request(flaky).post("/api/users/password/verify").send({ email: "amina@example.com", code }).expect(200);
        await request(flaky).post("/api/users/password/reset").send({ resetToken: body.resetToken, password: "a brand new password" }).expect(200);
        expect(logs.find("Could not send the 'password changed' email")).toMatchObject({ level: "error" });
    });

    it("rate limits reset requests per IP", async () => {
        const { app: strict } = h.makeApp({ db, mailer, now: () => clock, env: { RESET_RATE_LIMIT_MAX: "2" } });
        await forgot(undefined, strict).expect(202);
        await forgot(undefined, strict).expect(202);
        const res = await forgot(undefined, strict).expect(429);
        expect(res.body.error).toMatch(/Too many password reset attempts/);
    });
});

describe("mailer", () => {
    const message = { to: "a@example.com", subject: "Hi", text: "Body", html: "<p>Body</p>" };

    it("sends over SMTP with the configured sender", async () => {
        const transporter = { sendMail: vi.fn().mockResolvedValue({ messageId: "<1@x>" }) };
        const smtp = createMailer({ transport: "smtp", from: "AirBuenas <no-reply@example.com>" }, { transporter });
        expect(smtp.enabled).toBe(true);
        expect(await smtp.send(message)).toEqual({ messageId: "<1@x>" });
        expect(transporter.sendMail).toHaveBeenCalledWith({ from: "AirBuenas <no-reply@example.com>", ...message });
    });

    it("builds a real SMTP transport from the config", () => {
        expect(createMailer({ transport: "smtp", host: "smtp.example.com", port: 587, secure: false, user: "u", password: "p" }).enabled).toBe(true);
        expect(createMailer({ transport: "smtp", host: "smtp.example.com", port: 25, secure: false }).transport).toBe("smtp");
    });

    it("prints emails to the log in development", async () => {
        const { logger, find } = h.captureLogger();
        expect(await createMailer({ transport: "log" }, { logger }).send(message)).toEqual({ messageId: "logged" });
        expect(find(/^Email not sent \(no SMTP_HOST, development\): "Hi"\nBody$/)).toMatchObject({ level: "warn" });
    });

    it("refuses to send when email isn't set up", async () => {
        const none = createMailer({ transport: "none" });
        expect(none.enabled).toBe(false);
        await expect(none.send(message)).rejects.toThrow(MailUnavailableError);
    });

    it("builds both emails", () => {
        expect(passwordResetCode({ name: "A", code: "012345", minutes: 10 }).subject).toBe("012345 is your AirBuenas password reset code");
        expect(passwordChanged({ name: "A", siteUrl: "https://x.example" }).html).toContain('href="https://x.example/forgot-password"');
    });
});
