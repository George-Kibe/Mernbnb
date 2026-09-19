const { escapeHtml } = require("../seo/html");

// Transactional emails, as { subject, text, html }. The HTML uses inline
// styles and no images, so it renders the same in every mail client.

const layout = (heading, bodyHtml) => `<!DOCTYPE html>
<html lang="en"><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;padding:32px">
        <tr><td style="font-size:22px;font-weight:bold;color:#0063da;padding-bottom:24px">AirBuenas</td></tr>
        <tr><td style="font-size:20px;font-weight:bold;padding-bottom:12px">${heading}</td></tr>
        <tr><td style="font-size:15px;line-height:1.5">${bodyHtml}</td></tr>
      </table>
      <p style="font-size:12px;color:#888;padding-top:16px">AirBuenas · Stays across Kenya</p>
    </td></tr>
  </table>
</body></html>`;

const passwordResetCode = ({ name, code, minutes }) => ({
    subject: `${code} is your AirBuenas password reset code`,
    text: [
        `Hi ${name},`,
        "",
        `Your code to reset your AirBuenas password is: ${code}`,
        "",
        `It expires in ${minutes} minutes. If you didn't ask to reset your password, ignore this email: your password stays the same.`,
        "",
        "Never share this code. AirBuenas will never ask you for it.",
    ].join("\n"),
    html: layout(
        "Reset your password",
        `<p>Hi ${escapeHtml(name)},</p>
         <p>Enter this code to reset your AirBuenas password:</p>
         <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f0f6ff;border-radius:8px;padding:16px;text-align:center;margin:20px 0">${code}</p>
         <p>It expires in ${minutes} minutes. If you didn't ask to reset your password, ignore this email: your password stays the same.</p>
         <p style="color:#666;font-size:13px">Never share this code. AirBuenas will never ask you for it.</p>`
    ),
});

const passwordChanged = ({ name, siteUrl }) => ({
    subject: "Your AirBuenas password was changed",
    text: [
        `Hi ${name},`,
        "",
        "The password for your AirBuenas account was just changed.",
        "",
        `If this wasn't you, reset your password now at ${siteUrl}/forgot-password and check your account.`,
    ].join("\n"),
    html: layout(
        "Your password was changed",
        `<p>Hi ${escapeHtml(name)},</p>
         <p>The password for your AirBuenas account was just changed.</p>
         <p>If this wasn't you, <a href="${escapeHtml(siteUrl)}/forgot-password" style="color:#0063da">reset your password now</a> and check your account.</p>`
    ),
});

module.exports = { passwordResetCode, passwordChanged };
