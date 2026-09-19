const mongoose = require("mongoose");
const { Schema } = mongoose;

const PERKS = ["Wifi", "Free Parking", "Swimming Pool", "Public Tv", "Pets Allowed"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const PlaceSchema = new Schema(
    {
        owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        address: { type: String, required: true, trim: true, maxlength: 200 },
        // S3 keys (or legacy external URLs); see lib/s3.js.
        photos: { type: [String], validate: [(v) => v.length <= 50, "A listing can have at most 50 photos."] },
        description: { type: String, trim: true, maxlength: 5000, default: "" },
        perks: [{ type: String, enum: PERKS }],
        extraInfo: { type: String, trim: true, maxlength: 2000, default: "" },
        checkIn: { type: String, match: TIME },
        checkOut: { type: String, match: TIME },
        maxGuests: { type: Number, required: true, min: 1, max: 16 },
        // Price per night, in KES.
        price: { type: Number, required: true, min: 1, max: 10_000_000 },
    },
    {
        timestamps: true,
        toJSON: { transform: (doc, ret) => { delete ret.__v; return ret; } },
    }
);

// Home page: newest first.
PlaceSchema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.models.Place || mongoose.model("Place", PlaceSchema);
module.exports.PERKS = PERKS;
module.exports.TIME = TIME;
