const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Place = require("../models/Place");
const Booking = require("../models/Booking");
const { validate, objectIdParam, dateOnly, toUtcDay } = require("../middleware/validate");
const { badRequest, conflict, notFound } = require("../errors");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NIGHTS = 90;

const bookingBody = z.object({
    placeId: z.string().refine((id) => mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id), "Unknown place."),
    checkIn: dateOnly,
    checkOut: dateOnly,
    guests: z.coerce.number().int().min(1, "At least 1 guest.").max(16),
    name: z.string().trim().min(1, "Enter your full name.").max(100),
    phoneNumber: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number."),
});

// Today's date in UTC, allowing one day of slack for guests in time zones
// ahead of UTC (it may already be "tomorrow" for them).
const earliestCheckIn = (now) => {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    return new Date(today.getTime() - DAY_MS);
};

const withPlacePhotos = (storage) => async (booking) => {
    const plain = booking.toJSON();
    plain.place = await storage.withPhotoUrls(plain.place);
    return plain;
};

const createBookingsRouter = ({ storage, limiters, auth, now = Date.now }) => {
    const router = express.Router();

    // Book a stay. The server prices it (nights × nightly price) and rejects
    // dates that overlap an existing booking.
    router.post("/", auth, limiters.write, validate({ body: bookingBody }), async (req, res) => {
        const { placeId, guests, name, phoneNumber } = req.valid.body;
        const checkIn = toUtcDay(req.valid.body.checkIn);
        const checkOut = toUtcDay(req.valid.body.checkOut);
        const nights = Math.round((checkOut - checkIn) / DAY_MS);

        if (checkIn < earliestCheckIn(now())) throw badRequest("Check-in can't be in the past.");
        if (nights < 1) throw badRequest("Check-out must be after check-in.");
        if (nights > MAX_NIGHTS) throw badRequest(`Stays can be at most ${MAX_NIGHTS} nights.`);

        const place = await Place.findById(placeId);
        if (!place) throw notFound("That place doesn't exist.");
        if (String(place.owner) === req.user.id) throw badRequest("You can't book your own place.");
        if (guests > place.maxGuests) throw badRequest(`This place fits at most ${place.maxGuests} guests.`);

        const dates = { checkIn: req.valid.body.checkIn, checkOut: req.valid.body.checkOut };
        const taken = await Booking.exists({ place: place._id, checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } });
        if (taken) {
            req.log.info("Booking refused: dates already booked", { placeId, userId: req.user.id, ...dates });
            throw conflict("Those dates are no longer available. Please pick different dates.");
        }

        const booking = await Booking.create({
            place: place._id,
            owner: req.user.id,
            checkIn,
            checkOut,
            guests,
            name,
            phoneNumber,
            email: req.user.email,
            price: nights * place.price,
        });
        req.log.info("Booking created", {
            bookingId: String(booking._id),
            placeId,
            userId: req.user.id,
            hostId: String(place.owner),
            ...dates,
            nights,
            guests,
            total: booking.price,
        });
        res.status(201).json(booking);
    });

    // A booking is visible to the guest who made it and to the host.
    router.get("/:id", auth, objectIdParam("id"), async (req, res) => {
        const booking = await Booking.findById(req.params.id).populate("place");
        const isGuest = booking && String(booking.owner) === req.user.id;
        const isHost = booking?.place && String(booking.place.owner) === req.user.id;
        if (!isGuest && !isHost) {
            // Someone else's booking: answered like a missing one, but worth knowing about.
            if (booking) req.log.warn("Blocked access to someone else's booking", { bookingId: req.params.id, userId: req.user.id });
            throw notFound("Booking not found.");
        }
        res.json(await withPlacePhotos(storage)(booking));
    });

    return router;
};

// The signed-in user's own listings and trips.
const createMeRouter = ({ storage, auth }) => {
    const router = express.Router();
    router.use(auth);

    router.get("/places", async (req, res) => {
        const places = await Place.find({ owner: req.user.id }).sort({ createdAt: -1 });
        res.json(await Promise.all(places.map(storage.withPhotoUrls)));
    });

    router.get("/bookings", async (req, res) => {
        const bookings = await Booking.find({ owner: req.user.id }).sort({ checkIn: -1 }).populate("place");
        // Skip bookings whose place was deleted.
        res.json(await Promise.all(bookings.filter((b) => b.place).map(withPlacePhotos(storage))));
    });

    return router;
};

module.exports = { createBookingsRouter, createMeRouter, bookingBody, MAX_NIGHTS };
