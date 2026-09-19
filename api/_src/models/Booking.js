const mongoose = require("mongoose");
const { Schema } = mongoose;

const BookingSchema = new Schema(
    {
        place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
        // The guest who booked.
        owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        // Dates at UTC midnight; checkOut is exclusive.
        checkIn: { type: Date, required: true },
        checkOut: { type: Date, required: true },
        guests: { type: Number, min: 1, max: 16, default: 1 },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        phoneNumber: { type: String, required: true, trim: true, maxlength: 30 },
        email: { type: String, trim: true, lowercase: true, maxlength: 254 },
        // Total in KES, computed by the server (nights × nightly price).
        price: { type: Number, required: true, min: 0 },
    },
    {
        timestamps: true,
        toJSON: { transform: (doc, ret) => { delete ret.__v; return ret; } },
    }
);

// Availability checks: bookings of a place overlapping a date range.
BookingSchema.index({ place: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
