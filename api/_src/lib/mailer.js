const nodemailer = require("nodemailer");

class MailUnavailableError extends Error {}

// Sends email. config.transport is "smtp" (any provider: Gmail, Brevo, SES,
// Resend, Mailgun…), "log" (development: the email is printed to the log
// instead, so codes can be read without an SMTP account) or "none"
// (production without SMTP: sending throws MailUnavailableError).
// `transporter` lets tests supply their own.
const createMailer = (config, { logger, transporter } = {}) => {
    const smtp =
        transporter ??
        (config.transport === "smtp"
            ? nodemailer.createTransport({
                  host: config.host,
                  port: config.port,
                  secure: config.secure,
                  auth: config.user ? { user: config.user, pass: config.password } : undefined,
                  // Fail fast rather than hold a serverless function open.
                  connectionTimeout: 10_000,
                  greetingTimeout: 10_000,
                  socketTimeout: 15_000,
              })
            : null);

    const enabled = config.transport !== "none";

    // { to, subject, text, html } -> resolves when the provider accepted it.
    const send = async ({ to, subject, text, html }) => {
        if (smtp) {
            const info = await smtp.sendMail({ from: config.from, to, subject, text, html });
            return { messageId: info.messageId };
        }
        if (config.transport === "log") {
            logger?.warn(`Email not sent (no SMTP_HOST, development): "${subject}"\n${text}`, { transport: "log" });
            return { messageId: "logged" };
        }
        throw new MailUnavailableError("Email isn't set up on this server.");
    };

    return { enabled, send, transport: config.transport };
};

module.exports = { createMailer, MailUnavailableError };
