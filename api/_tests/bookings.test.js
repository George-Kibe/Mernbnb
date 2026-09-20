import { describe, it, expect, beforeAll, afterAll, beforeEach, inject, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const h = require("./helpers");

// Freeze "today" at 2030-01-01 12:00 UTC.
const NOW = Date.parse("2030-01-01T12:00:00Z");

let app;
let db;
let host;
let guest;
let place;
beforeAll(async () => {
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), now: () => NOW }));
    await db.connect();
});
beforeEach(async () => {
    await h.clearDatabase();
    host = await h.createUser({ name: "Host" });
    guest = await h.createUser({ name: "Guest" });
    place = await h.createPlace(host.user, { maxGuests: 4, price: 5000 });
});
afterAll(() => h.closeDatabase());

const book = (auth, overrides = {}) =>
    request(app)
        .post("/api/bookings")
        .set("Authorization", auth)
        .send({ placeId: String(place._id), checkIn: "2030-01-10", checkOut: "2030-01-13", guests: 2, name: "Guest Person", phoneNumber: "+254 700 000 000", ...overrides });

describe("POST /api/bookings", () => {
    it("books a stay and prices it on the server (nights × nightly price)", async () => {
        const res = await book(guest.auth, { price: 1 }).expect(201); // client price ignored
        expect(res.body).toMatchObject({ price: 15000, guests: 2, owner: String(guest.user._id), place: String(place._id) });
        expect(res.body.checkIn).toBe("2030-01-10T00:00:00.000Z");
        expect(res.body.email).toBe(guest.user.email);
    });

    it("requires login", async () => {
        await request(app).post("/api/bookings").send({}).expect(401);
    });

    it.each([
        ["bad place id", { placeId: "nope" }, 400, "Unknown place."],
        ["bad date format", { checkIn: "10/01/2030" }, 400, "Use the YYYY-MM-DD date format."],
        ["impossible date", { checkIn: "2030-02-31" }, 400, "That date doesn't exist."],
        ["past check-in", { checkIn: "2029-12-01", checkOut: "2029-12-03" }, 400, "Check-in can't be in the past."],
        ["zero nights", { checkOut: "2030-01-10" }, 400, "Check-out must be after check-in."],
        ["reversed dates", { checkOut: "2030-01-05" }, 400, "Check-out must be after check-in."],
        ["too long", { checkOut: "2030-05-01" }, 400, "Stays can be at most 90 nights."],
        ["too many guests", { guests: 5 }, 400, "This place fits at most 4 guests."],
        ["no guests", { guests: 0 }, 400, "At least 1 guest."],
        ["bad phone", { phoneNumber: "call me" }, 400, "Enter a valid phone number."],
        ["no name", { name: "  " }, 400, "Enter your full name."],
        ["unknown place", { placeId: "000000000000000000000000" }, 404, "That place doesn't exist."],
    ])("rejects %s", async (label, override, status, message) => {
        const res = await book(guest.auth, override).expect(status);
        expect(res.body.error).toBe(message);
    });

    it("allows yesterday (UTC) for guests ahead of UTC", async () => {
        await book(guest.auth, { checkIn: "2029-12-31", checkOut: "2030-01-02" }).expect(201);
    });

    it("stops hosts booking their own place", async () => {
        const res = await book(host.auth).expect(400);
        expect(res.body.error).toBe("You can't book your own place.");
    });

    it("prevents double booking but allows same-day turnover", async () => {
        await book(guest.auth).expect(201);
        const other = await h.createUser();
        const clash = await book(other.auth, { checkIn: "2030-01-12", checkOut: "2030-01-15" }).expect(409);
        expect(clash.body.error).toMatch(/no longer available/);
        await book(other.auth, { checkIn: "2030-01-13", checkOut: "2030-01-15" }).expect(201);
    });

    // The overlap check can't stop two bookings made in the same moment, so
    // the loser withdraws itself afterwards.
    describe("when two guests book the same dates at once", () => {
        // Lets both requests past the overlap check, but not the check the
        // route makes after writing (that one filters on _id).
        const letBothThrough = () => {
            const exists = h.Booking.exists.bind(h.Booking);
            return vi.spyOn(h.Booking, "exists").mockImplementation((filter) => (filter._id ? exists(filter) : Promise.resolve(null)));
        };

        it("keeps exactly one booking", async () => {
            const spy = letBothThrough();
            const other = await h.createUser();
            const [first, second] = await Promise.all([book(guest.auth), book(other.auth)]);
            spy.mockRestore();
            expect([first.status, second.status].sort()).toEqual([201, 409]);
            expect(await h.Booking.countDocuments({ place: place._id })).toBe(1);
            const kept = [first, second].find((res) => res.status === 201).body;
            expect(await h.Booking.findById(kept._id)).not.toBeNull();
        });

        it("withdraws the booking it just wrote, and says the dates are taken", async () => {
            await book(guest.auth).expect(201);
            const spy = letBothThrough();
            const other = await h.createUser();
            const res = await book(other.auth, { checkIn: "2030-01-12", checkOut: "2030-01-14" }).expect(409);
            spy.mockRestore();
            expect(res.body.error).toMatch(/no longer available/);
            expect(await h.Booking.countDocuments({ place: place._id })).toBe(1);
        });
    });
});

describe("GET /api/bookings/:id", () => {
    it("is visible to the guest and the host, with signed place photos", async () => {
        const booking = await h.createBooking(place, guest.user);
        const asGuest = await request(app).get(`/api/bookings/${booking._id}`).set("Authorization", guest.auth).expect(200);
        expect(asGuest.body.place.title).toBe("Lakeside Cabin");
        expect(asGuest.body.place.photos[0]).toMatch(/X-Amz-Signature=/);
        await request(app).get(`/api/bookings/${booking._id}`).set("Authorization", host.auth).expect(200);
    });

    it("is hidden (404) from everyone else", async () => {
        const booking = await h.createBooking(place, guest.user);
        const stranger = await h.createUser();
        await request(app).get(`/api/bookings/${booking._id}`).set("Authorization", stranger.auth).expect(404);
        await request(app).get(`/api/bookings/${booking._id}`).expect(401);
    });

    it("404s for unknown ids", async () => {
        await request(app).get("/api/bookings/000000000000000000000000").set("Authorization", guest.auth).expect(404);
        await request(app).get("/api/bookings/x").set("Authorization", guest.auth).expect(404);
    });
});

describe("/api/me", () => {
    it("lists my places, newest first", async () => {
        await h.createPlace(host.user, { title: "Second" });
        await h.createPlace(guest.user, { title: "Not mine" });
        const { body } = await request(app).get("/api/me/places").set("Authorization", host.auth).expect(200);
        expect(body.map((p) => p.title)).toEqual(["Second", "Lakeside Cabin"]);
    });

    it("lists my trips with their places, skipping deleted places", async () => {
        await h.createBooking(place, guest.user);
        const gone = await h.createPlace(host.user, { title: "Gone" });
        await h.createBooking(gone, guest.user, { checkIn: new Date("2030-03-01T00:00:00Z"), checkOut: new Date("2030-03-02T00:00:00Z") });
        await h.Place.deleteOne({ _id: gone._id });
        const { body } = await request(app).get("/api/me/bookings").set("Authorization", guest.auth).expect(200);
        expect(body).toHaveLength(1);
        expect(body[0].place.title).toBe("Lakeside Cabin");
    });

    it("requires login", async () => {
        await request(app).get("/api/me/places").expect(401);
        await request(app).get("/api/me/bookings").expect(401);
    });
});
