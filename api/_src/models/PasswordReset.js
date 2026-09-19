const mongoose = require("mongoose");
const { Schema } = mongoose;

// The current password reset for a user (at most one). The code itself is
// never stored, only an HMAC of it. MongoDB deletes the document at
// `purgeAt`, which outlives the code so the hourly send limit holds.
const PasswordResetSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    // Wrong guesses for the current code.
    attempts: { type: Number, default: 0 },
    // Codes sent since windowStart (limits email flooding).
    sends: { type: Number, default: 1 },
    windowStart: { type: Date, required: true },
    lastSentAt: { type: Date, required: true },
    // Set once the right code is entered: the id of the reset token issued.
    tokenId: { type: String, default: null },
    purgeAt: { type: Date, required: true },
});

PasswordResetSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.PasswordReset || mongoose.model("PasswordReset", PasswordResetSchema);
