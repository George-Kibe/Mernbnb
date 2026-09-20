import { describe, it, expect, beforeAll, afterAll, beforeEach, inject, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const h = require("./helpers");

let app;
let db;
beforeAll(async () => {
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")) }));
    await db.connect();
});
beforeEach(() => h.clearDatabase());
afterAll(() => h.closeDatabase());

describe("GET /api/places", () => {
    it("paginates newest first with totals", async () => {
        const { user } = await h.createUser();
        for (let i = 0; i < 15; i++) {
            await h.createPlace(user, { title: `Place ${i}` });
        }
        const page1 = await request(app).get("/api/places").expect(200);
        expect(page1.body).toMatchObject({ page: 1, limit: 12, total: 15, totalPages: 2 });
        expect(page1.body.places).toHaveLength(12);
        expect(page1.body.places[0].title).toBe("Place 14");
        const page2 = await request(app).get("/api/places?page=2").expect(200);
        expect(page2.body.places.map((p) => p.title)).toEqual(["Place 2", "Place 1", "Place 0"]);
    });

    it("falls back to defaults for invalid paging values and clamps the limit", async () => {
        const res = await request(app).get("/api/places?page=banana&limit=zzz").expect(200);
        expect(res.body).toMatchObject({ page: 1, limit: 12 });
        expect((await request(app).get("/api/places?limit=1000")).body.limit).toBe(50);
        expect((await request(app).get("/api/places?limit=-3")).body.limit).toBe(1);
        expect((await request(app).get("/api/places?page=-4")).body.page).toBe(1);
    });

    it("returns signed URLs for stored keys and leaves external URLs alone", async () => {
        const { user } = await h.createUser();
        await h.createPlace(user, { photos: ["places/u/a.jpg", "https://images.example.org/b.jpg"] });
        const { body } = await request(app).get("/api/places").expect(200);
        expect(body.places[0].photos[0]).toMatch(/^https:\/\/test-bucket\.s3\.eu-west-1\.amazonaws\.com\/places\/u\/a\.jpg\?.*X-Amz-Signature=/);
        expect(body.places[0].photos[1]).toBe("https://images.example.org/b.jpg");
        expect(body.places[0].__v).toBeUndefined();
    });

    describe("search filters", () => {
        let beach;
        let city;
        beforeEach(async () => {
            const { user } = await h.createUser();
            const { user: guest } = await h.createUser();
            beach = await h.createPlace(user, { title: "Beach", address: "Diani Beach, Kwale", maxGuests: 6, perks: ["Wifi", "Pets Allowed"] });
            city = await h.createPlace(user, { title: "City", address: "Kilimani, Nairobi", maxGuests: 2 });
            await h.createBooking(beach, guest, { checkIn: new Date("2030-01-10T00:00:00Z"), checkOut: new Date("2030-01-13T00:00:00Z") });
        });
        const titles = async (query) => (await request(app).get(`/api/places?${query}`).expect(200)).body.places.map((p) => p.title).sort();

        it("filters by location, case-insensitively", async () => {
            expect(await titles("location=KWALE")).toEqual(["Beach"]);
            expect(await titles("location=nairobi")).toEqual(["City"]);
        });
        it("escapes regex characters in the location", async () => {
            expect(await titles(`location=${encodeURIComponent(".*")}`)).toEqual([]);
        });
        it("filters by capacity and pets", async () => {
            expect(await titles("guests=5")).toEqual(["Beach"]);
            expect(await titles("pets=1")).toEqual(["Beach"]);
        });
        it("hides places booked on overlapping dates, allowing same-day turnover", async () => {
            expect(await titles("checkin=2030-01-11&checkout=2030-01-15")).toEqual(["City"]);
            expect(await titles("checkin=2030-01-13&checkout=2030-01-15")).toEqual(["Beach", "City"]);
            expect(await titles("checkin=2030-01-08&checkout=2030-01-10")).toEqual(["Beach", "City"]);
        });
        it("ignores invalid or reversed dates", async () => {
            expect(await titles("checkin=2030-01-15&checkout=2030-01-11")).toEqual(["Beach", "City"]);
            expect(await titles("checkin=garbage&checkout=2030-01-11")).toEqual(["Beach", "City"]);
            expect(await titles("checkin=2030-02-31&checkout=2030-03-02")).toEqual(["Beach", "City"]);
        });
        it("counts only matching places", async () => {
            const { body } = await request(app).get("/api/places?location=Nairobi").expect(200);
            expect(body).toMatchObject({ total: 1, totalPages: 1 });
        });
        it("keeps the city place visible when no booking matches", async () => {
            expect(city.title).toBe("City");
        });
    });
});

describe("GET /api/places/destinations", () => {
    it("counts each address part, most popular first", async () => {
        const { user } = await h.createUser();
        await h.createPlace(user, { address: "Diani Beach, Kwale", price: 9000 });
        await h.createPlace(user, { address: "Tiwi Beach, Kwale", price: 7000 });
        await h.createPlace(user, { address: "Karen, Nairobi" });
        await h.createPlace(user, { address: "Mũrang'a, !!!" }); // "!!!" has no slug
        await h.Place.collection.insertOne({ owner: user._id, title: "legacy", maxGuests: 1, price: 1 }); // no address
        const { body } = await request(app).get("/api/places/destinations").expect(200);
        expect(body[0]).toEqual({ name: "Kwale", slug: "kwale", count: 2, minPrice: 7000 });
        expect(body).toEqual(expect.arrayContaining([
            { name: "Diani Beach", slug: "diani-beach", count: 1, minPrice: 9000 },
            { name: "Karen", slug: "karen", count: 1, minPrice: 5000 },
        ]));
        expect(body).toContainEqual({ name: "Mũrang'a", slug: "murang-a", count: 1, minPrice: 5000 });
        expect(body.find((d) => d.name === "legacy" || d.name === "!!!")).toBeUndefined();
    });
});

describe("GET /api/places/:id", () => {
    it("returns one place", async () => {
        const { user } = await h.createUser();
        const place = await h.createPlace(user);
        const { body } = await request(app).get(`/api/places/${place._id}`).expect(200);
        expect(body.title).toBe("Lakeside Cabin");
    });
    it("404s for unknown and malformed ids", async () => {
        await request(app).get("/api/places/000000000000000000000000").expect(404);
        await request(app).get("/api/places/not-an-id").expect(404);
        await request(app).get("/api/places/zzzzzzzzzzzz").expect(404); // 12 chars: valid for Mongo, not for us
    });
});

describe("POST /api/places", () => {
    it("requires login", async () => {
        await request(app).post("/api/places").send(h.placeFields()).expect(401);
    });

    it("creates a listing owned by the signed-in user, ignoring any owner in the body", async () => {
        const { user, auth } = await h.createUser();
        const { user: other } = await h.createUser();
        const signedUrl = "https://test-bucket.s3.eu-west-1.amazonaws.com/places/x/a.jpg?X-Amz-Signature=abc";
        const res = await request(app)
            .post("/api/places")
            .set("Authorization", auth)
            .send({ ...h.placeFields({ photos: [signedUrl, signedUrl, "places/x/b.jpg"], perks: ["Wifi", "Wifi"] }), owner: String(other._id) })
            .expect(201);
        const stored = await h.Place.findById(res.body._id);
        expect(String(stored.owner)).toBe(String(user._id));
        expect(stored.photos).toEqual(["places/x/a.jpg", "places/x/b.jpg"]);
        expect(stored.perks).toEqual(["Wifi"]);
    });

    it.each([
        ["title", { title: "" }, "Add a title."],
        ["photos", { photos: [] }, "Add at least one photo."],
        ["perks", { perks: ["Helipad"] }, undefined],
        ["check-in time", { checkIn: "25:00" }, "Use the HH:MM time format."],
        ["guests", { maxGuests: 0 }, "At least 1 guest."],
        ["price", { price: 99.5 }, "Use a whole number for the price."],
    ])("rejects an invalid %s", async (label, override, message) => {
        const { auth } = await h.createUser();
        const res = await request(app).post("/api/places").set("Authorization", auth).send(h.placeFields(override)).expect(400);
        if (message) expect(res.body.error).toBe(message);
    });
});

describe("PUT /api/places/:id", () => {
    it("lets the owner update the listing", async () => {
        const { user, auth } = await h.createUser();
        const place = await h.createPlace(user);
        const res = await request(app).put(`/api/places/${place._id}`).set("Authorization", auth).send(h.placeFields({ title: "Renamed", price: 7000 })).expect(200);
        expect(res.body).toMatchObject({ title: "Renamed", price: 7000 });
    });

    it("forbids editing someone else's listing", async () => {
        const { user } = await h.createUser();
        const { auth: otherAuth } = await h.createUser();
        const place = await h.createPlace(user);
        const res = await request(app).put(`/api/places/${place._id}`).set("Authorization", otherAuth).send(h.placeFields({ title: "Hijacked" })).expect(403);
        expect(res.body.error).toBe("You can only edit your own listings.");
        expect((await h.Place.findById(place._id)).title).toBe("Lakeside Cabin");
    });

    it("404s for a missing listing and validates the body", async () => {
        const { user, auth } = await h.createUser();
        await request(app).put("/api/places/000000000000000000000000").set("Authorization", auth).send(h.placeFields()).expect(404);
        const place = await h.createPlace(user);
        await request(app).put(`/api/places/${place._id}`).set("Authorization", auth).send({ title: "Only a title" }).expect(400);
    });
});

describe("DELETE /api/places/:id", () => {
    const TODAY = Date.parse("2030-06-15T09:00:00Z");
    let app2;
    let deletePhotos;
    beforeAll(() => {
        deletePhotos = vi.fn().mockResolvedValue(2);
        const storage = { ...h.testStorage(), deletePhotos };
        ({ app: app2 } = h.makeApp({ db, storage, now: () => TODAY }));
    });

    const listing = async () => {
        const host = await h.createUser();
        const place = await h.createPlace(host.user, { photos: ["places/a/1.jpg", "places/a/2.jpg"] });
        return { host, place };
    };

    it("deletes your own listing and its photos", async () => {
        const { host, place } = await listing();
        await request(app2).delete(`/api/places/${place._id}`).set("Authorization", host.auth).expect(204);
        expect(await h.Place.findById(place._id)).toBeNull();
        expect(deletePhotos).toHaveBeenCalledWith(["places/a/1.jpg", "places/a/2.jpg"]);
        await request(app2).get(`/api/places/${place._id}`).expect(404);
    });

    it("refuses someone else's listing, and unknown ids", async () => {
        const { place } = await listing();
        const other = await h.createUser();
        const res = await request(app2).delete(`/api/places/${place._id}`).set("Authorization", other.auth).expect(403);
        expect(res.body.error).toBe("You can only delete your own listings.");
        await request(app2).delete(`/api/places/${place._id}`).expect(401);
        await request(app2).delete("/api/places/000000000000000000000000").set("Authorization", other.auth).expect(404);
        expect(await h.Place.findById(place._id)).not.toBeNull();
    });

    it("keeps listings that guests are still booked into", async () => {
        const { host, place } = await listing();
        const guest = await h.createUser();
        const booking = await h.createBooking(place, guest.user, { checkIn: new Date("2030-06-20T00:00:00Z"), checkOut: new Date("2030-06-23T00:00:00Z") });
        const res = await request(app2).delete(`/api/places/${place._id}`).set("Authorization", host.auth).expect(409);
        expect(res.body.error).toMatch(/upcoming bookings/);
        expect(await h.Place.findById(place._id)).not.toBeNull();

        // Once the stay is over, it can go.
        await h.Booking.updateOne({ _id: booking._id }, { $set: { checkIn: new Date("2030-06-01T00:00:00Z"), checkOut: new Date("2030-06-04T00:00:00Z") } });
        await request(app2).delete(`/api/places/${place._id}`).set("Authorization", host.auth).expect(204);
    });

    it("still deletes the listing when the bucket can't be reached", async () => {
        const { host, place } = await listing();
        deletePhotos.mockRejectedValueOnce(new Error("S3 down"));
        const logs = h.captureLogger();
        const { app: noisy } = h.makeApp({ db, storage: { ...h.testStorage(), deletePhotos }, logger: logs.logger, now: () => TODAY });
        await request(noisy).delete(`/api/places/${place._id}`).set("Authorization", host.auth).expect(204);
        expect(await h.Place.findById(place._id)).toBeNull();
        expect(logs.find("Could not delete unused photos from the bucket")).toMatchObject({ level: "error", photos: 2 });
    });
});

describe("photos no longer used", () => {
    it("are deleted from the bucket when a listing is edited", async () => {
        const deletePhotos = vi.fn().mockResolvedValue(1);
        const { app: app2 } = h.makeApp({ db, storage: { ...h.testStorage(), deletePhotos } });
        const host = await h.createUser();
        const place = await h.createPlace(host.user, { photos: ["places/a/old.jpg", "places/a/kept.jpg"] });
        const body = { ...h.placeFields(), photos: ["places/a/kept.jpg", "places/a/new.jpg"] };
        await request(app2).put(`/api/places/${place._id}`).set("Authorization", host.auth).send(body).expect(200);
        expect(deletePhotos).toHaveBeenCalledWith(["places/a/old.jpg"]);
    });

    it("are left alone when the photos didn't change", async () => {
        const deletePhotos = vi.fn();
        const { app: app2 } = h.makeApp({ db, storage: { ...h.testStorage(), deletePhotos } });
        const host = await h.createUser();
        const place = await h.createPlace(host.user, { photos: ["places/a/kept.jpg"] });
        await request(app2).put(`/api/places/${place._id}`).set("Authorization", host.auth).send({ ...h.placeFields(), photos: ["places/a/kept.jpg"], price: 7000 }).expect(200);
        expect(deletePhotos).not.toHaveBeenCalled();
    });
});
