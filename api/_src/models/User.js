const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
        // bcrypt hash; never returned unless explicitly selected with "+password".
        password: { type: String, required: true, select: false },
        // Set when the password is reset: tokens issued before it stop working.
        passwordChangedAt: { type: Date },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                delete ret.password;
                delete ret.passwordChangedAt;
                delete ret.__v;
                return ret;
            },
        },
    }
);

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
