const express = require("express");
const { z } = require("zod");
const Place = require("../models/Place");
const Booking = require("../models/Booking");
const { validate, objectIdParam, dateOnly, toUtcDay } = require("../middleware/validate");
const { notFound, forbidden, conflict } = require("../errors");
const { listDestinations } = require("../lib/destinations");

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

// Mongo filter for the home-page search (and destination pages).
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

const createPlacesRouter = ({ storage, limiters, auth, now = Date.now }) => {
    // Photos that are no longer used are removed from the bucket. Failing at
    // that shouldn't fail the request, so it's logged instead.
    const forgetPhotos = async (req, photos, context) => {
        if (photos.length === 0) return;
        try {
            const deleted = await storage.deletePhotos(photos);
            if (deleted) req.log.info("Deleted photos that are no longer used", { ...context, photos: deleted });
        } catch (err) {
            req.log.error("Could not delete unused photos from the bucket", { ...context, photos: photos.length, err });
        }
    };

    const router = express.Router();

    // One page of places, newest first -> { places, page, limit, total, totalPages }
    router.get("/", validate({ query: listQuery }), async (req, res) => {
        const { page, limit, ...search } = req.valid.query;
        const filter = await searchFilter(search);
        const [total, docs] = await Promise.all([
            Place.countDocuments(filter),
            Place.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
        ]);
        // What people search for, and searches that find nothing (demand without supply).
        const searched = Object.fromEntries(Object.entries(search).filter(([, v]) => v));
        if (Object.keys(searched).length) req.log.log(total ? "debug" : "info", total ? "Search" : "Search found no stays", { search: searched, page, total });
        res.json({
            places: await Promise.all(docs.map(storage.withPhotoUrls)),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    });

    // Search suggestions: each comma-separated address part with a stay count
    // and its /stays/:slug page. Registered before "/:id" so "destinations"
    // isn't read as an id.
    router.get("/destinations", async (req, res) => {
        res.json(await listDestinations());
    });

    router.get("/:id", objectIdParam("id"), async (req, res) => {
        const place = await Place.findById(req.params.id);
        if (!place) throw notFound("That place doesn't exist.");
        res.json(await storage.withPhotoUrls(place));
    });

    router.post("/", auth, limiters.write, validate({ body: placeBody }), async (req, res) => {
        const body = req.valid.body;
        const place = await Place.create({ ...body, photos: storage.normalizePhotos(body.photos), owner: req.user.id });
        req.log.info("Listing created", { placeId: String(place._id), userId: req.user.id, address: place.address, price: place.price, photos: place.photos.length });
        res.status(201).json(await storage.withPhotoUrls(place));
    });

    router.put("/:id", auth, objectIdParam("id"), validate({ body: placeBody }), async (req, res) => {
        const place = await Place.findById(req.params.id);
        if (!place) throw notFound("That place doesn't exist.");
        if (String(place.owner) !== req.user.id) {
            req.log.warn("Blocked an edit to someone else's listing", { placeId: req.params.id, userId: req.user.id, ownerId: String(place.owner) });
            throw forbidden("You can only edit your own listings.");
        }
        const body = req.valid.body;
        const before = [...place.photos];
        place.set({ ...body, photos: storage.normalizePhotos(body.photos) });
        const changed = place.modifiedPaths().filter((path) => !path.includes("."));
        await place.save();
        req.log.info("Listing updated", { placeId: req.params.id, userId: req.user.id, changed });
        await forgetPhotos(req, before.filter((photo) => !place.photos.includes(photo)), { placeId: req.params.id, userId: req.user.id });
        res.json(await storage.withPhotoUrls(place));
    });

    // Delete your own listing, unless guests are booked into it.
    router.delete("/:id", auth, objectIdParam("id"), async (req, res) => {
        const place = await Place.findById(req.params.id);
        if (!place) throw notFound("That place doesn't exist.");
        if (String(place.owner) !== req.user.id) {
            req.log.warn("Blocked a delete of someone else's listing", { placeId: req.params.id, userId: req.user.id, ownerId: String(place.owner) });
            throw forbidden("You can only delete your own listings.");
        }
        const today = new Date(now());
        today.setUTCHours(0, 0, 0, 0);
        const booked = await Booking.exists({ place: place._id, checkOut: { $gte: today } });
        if (booked) {
            req.log.info("Listing not deleted: it still has bookings", { placeId: req.params.id, userId: req.user.id });
            throw conflict("This listing has upcoming bookings, so it can't be deleted yet.");
        }

        await place.deleteOne();
        req.log.info("Listing deleted", { placeId: req.params.id, userId: req.user.id, title: place.title });
        await forgetPhotos(req, place.photos, { placeId: req.params.id, userId: req.user.id });
        res.status(204).end();
    });

    return router;
};

module.exports = { createPlacesRouter, placeBody, listQuery, searchFilter, PAGE_SIZE };
