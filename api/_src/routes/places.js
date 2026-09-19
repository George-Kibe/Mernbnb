const express = require("express");
const { z } = require("zod");
const Place = require("../models/Place");
const Booking = require("../models/Booking");
const { validate, objectIdParam, dateOnly, toUtcDay } = require("../middleware/validate");
const { notFound, forbidden } = require("../errors");

const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Search/pagination query. Invalid values fall back to defaults rather than
// failing, so a hand-edited URL still shows results.
const lenientInt = (fallback, min, max) =>
    z.coerce.number().int().min(min).max(max).catch(fallback).default(fallback);
const listQuery = z.object({
    page: lenientInt(1, 1, 10_000),
    limit: z.coerce.number().int().catch(PAGE_SIZE).default(PAGE_SIZE).transform((n) => Math.min(Math.max(n, 1), MAX_PAGE_SIZE)),
    location: z.string().trim().max(100).catch("").default(""),
    guests: lenientInt(0, 0, 16),
    pets: lenientInt(0, 0, 5),
    checkin: dateOnly.optional().catch(undefined),
    checkout: dateOnly.optional().catch(undefined),
});

const PERK = z.enum(Place.PERKS);
const time = z.string().regex(Place.TIME, "Use the HH:MM time format.");
// Body for creating/updating a listing. `photos` are keys or URLs (normalized).
const placeBody = z.object({
    title: z.string().trim().min(1, "Add a title.").max(120),
    address: z.string().trim().min(1, "Add an address.").max(200),
    photos: z.array(z.string().max(2048)).min(1, "Add at least one photo.").max(50),
    description: z.string().trim().min(1, "Add a description.").max(5000),
    perks: z.array(PERK).max(PERK.options.length).default([]).transform((p) => [...new Set(p)]),
    extraInfo: z.string().trim().max(2000).default(""),
    checkIn: time,
    checkOut: time,
    maxGuests: z.coerce.number().int().min(1, "At least 1 guest.").max(16, "At most 16 guests."),
    price: z.coerce.number().int("Use a whole number for the price.").min(1, "Set a nightly price.").max(10_000_000),
});

// Mongo filter for the home-page search.
const searchFilter = async ({ location, guests, pets, checkin, checkout }) => {
    const filter = {};
    if (location) filter.address = { $regex: escapeRegex(location), $options: "i" };
    if (guests > 0) filter.maxGuests = { $gte: guests };
    if (pets > 0) filter.perks = "Pets Allowed";
    if (checkin && checkout && checkout > checkin) {
        const booked = await Booking.distinct("place", { checkIn: { $lt: toUtcDay(checkout) }, checkOut: { $gt: toUtcDay(checkin) } });
        if (booked.length) filter._id = { $nin: booked };
    }
    return filter;
};

const createPlacesRouter = ({ storage, limiters, auth }) => {
    const router = express.Router();

    // One page of places, newest first -> { places, page, limit, total, totalPages }
    router.get("/", validate({ query: listQuery }), async (req, res) => {
        const { page, limit, ...search } = req.valid.query;
        const filter = await searchFilter(search);
        const [total, docs] = await Promise.all([
            Place.countDocuments(filter),
            Place.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
        ]);
        res.json({
            places: await Promise.all(docs.map(storage.withPhotoUrls)),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    });

    // Search suggestions: each comma-separated address part with a stay count.
    // Registered before "/:id" so "destinations" isn't read as an id.
    router.get("/destinations", async (req, res) => {
        const groups = await Place.aggregate([{ $group: { _id: "$address", count: { $sum: 1 } } }]);
        const counts = new Map();
        for (const { _id: address, count } of groups) {
            if (typeof address !== "string") continue;
            for (const part of new Set(address.split(",").map((s) => s.trim()).filter(Boolean))) {
                counts.set(part, (counts.get(part) || 0) + count);
            }
        }
        res.json(
            [...counts]
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        );
    });

    router.get("/:id", objectIdParam("id"), async (req, res) => {
        const place = await Place.findById(req.params.id);
        if (!place) throw notFound("That place doesn't exist.");
        res.json(await storage.withPhotoUrls(place));
    });

    router.post("/", auth, limiters.write, validate({ body: placeBody }), async (req, res) => {
        const body = req.valid.body;
        const place = await Place.create({ ...body, photos: storage.normalizePhotos(body.photos), owner: req.user.id });
        res.status(201).json(await storage.withPhotoUrls(place));
    });

    router.put("/:id", auth, objectIdParam("id"), validate({ body: placeBody }), async (req, res) => {
        const place = await Place.findById(req.params.id);
        if (!place) throw notFound("That place doesn't exist.");
        if (String(place.owner) !== req.user.id) throw forbidden("You can only edit your own listings.");
        const body = req.valid.body;
        place.set({ ...body, photos: storage.normalizePhotos(body.photos) });
        await place.save();
        res.json(await storage.withPhotoUrls(place));
    });

    return router;
};

module.exports = { createPlacesRouter, placeBody, listQuery };
