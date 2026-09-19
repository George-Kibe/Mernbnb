import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPhotoStorage, UploadError } = require("../_src/lib/s3");

const HOUR = 60 * 60 * 1000;
const make = (overrides = {}, now = () => Date.parse("2030-01-01T10:15:00Z"), logger = { warn: vi.fn() }) =>
    createPhotoStorage({ bucket: "bkt", region: "eu-west-1", accessKeyId: "AKIATEST", secretAccessKey: "secret", ...overrides }, { logger, now });

describe("toPhotoKey / normalizePhotos", () => {
    const s = make({ endpoint: "http://localhost:9000" });
    it.each([
        ["https://bkt.s3.amazonaws.com/places/a.jpg", "places/a.jpg"],
        ["https://bkt.s3.eu-west-1.amazonaws.com/places/a%20b.jpg?X-Amz-Signature=1", "places/a b.jpg"],
        ["https://s3.eu-west-1.amazonaws.com/bkt/places/c.png", "places/c.png"],
        ["https://s3.amazonaws.com/bkt/d.png", "d.png"],
        ["http://localhost:9000/bkt/places/e.webp?x=1", "places/e.webp"],
        ["https://elsewhere.example/f.jpg", "https://elsewhere.example/f.jpg"],
        ["places/g.jpg", "places/g.jpg"],
    ])("%s -> %s", (input, key) => {
        expect(s.toPhotoKey(input)).toBe(key);
    });

    it("drops junk and duplicates, trims, and caps the count", () => {
        expect(s.normalizePhotos([" places/a.jpg ", "", null, 42, "https://bkt.s3.amazonaws.com/places/a.jpg"])).toEqual(["places/a.jpg"]);
        expect(s.normalizePhotos("nope")).toEqual([]);
        expect(s.normalizePhotos(Array.from({ length: 60 }, (_, i) => `k${i}`))).toHaveLength(50);
    });
});

describe("photoUrl", () => {
    it("signs keys with a URL that is stable within the hour", async () => {
        let time = Date.parse("2030-01-01T10:15:00Z");
        const s = make({}, () => time);
        const first = await s.photoUrl("places/a.jpg");
        const url = new URL(first);
        expect(url.host).toBe("bkt.s3.eu-west-1.amazonaws.com");
        expect(url.searchParams.get("X-Amz-Date")).toBe("20300101T100000Z");
        expect(url.searchParams.get("X-Amz-Expires")).toBe("7200");
        time += 30 * 60 * 1000;
        expect(await s.photoUrl("places/a.jpg")).toBe(first); // cached
        time += HOUR;
        expect(await s.photoUrl("places/a.jpg")).not.toBe(first); // new window
    });

    it("passes external URLs through", async () => {
        expect(await make().photoUrl("https://images.example.org/x.jpg")).toBe("https://images.example.org/x.jpg");
    });

    it("falls back to public URLs (warning once) when it can't sign", async () => {
        const logger = { warn: vi.fn() };
        const aws = make({ accessKeyId: undefined, secretAccessKey: undefined }, undefined, logger);
        expect(await aws.photoUrl("places/a b.jpg")).toBe("https://bkt.s3.eu-west-1.amazonaws.com/places/a%20b.jpg");
        expect(await aws.photoUrl("places/c.jpg")).toBe("https://bkt.s3.eu-west-1.amazonaws.com/places/c.jpg");
        expect(logger.warn).toHaveBeenCalledTimes(1);
        const minio = make({ accessKeyId: undefined, secretAccessKey: undefined, endpoint: "http://localhost:9000" });
        expect(await minio.photoUrl("places/a.jpg")).toBe("http://localhost:9000/bkt/places/a.jpg");
    });

    it("uses path-style URLs for custom endpoints", async () => {
        const url = new URL(await make({ endpoint: "http://localhost:9000" }).photoUrl("places/a.jpg"));
        expect(`${url.origin}${url.pathname}`).toBe("http://localhost:9000/bkt/places/a.jpg");
    });
});

describe("withPhotoUrls", () => {
    it("handles documents, plain objects and empty values", async () => {
        const s = make();
        expect(await s.withPhotoUrls(null)).toBeNull();
        const plain = await s.withPhotoUrls({ title: "x", photos: ["https://e.example/a.jpg"] });
        expect(plain).toEqual({ title: "x", photos: ["https://e.example/a.jpg"] });
        const doc = { toJSON: () => ({ title: "y" }) };
        expect(await s.withPhotoUrls(doc)).toEqual({ title: "y", photos: [] });
    });
});

describe("createUploadUrls", () => {
    it("validates the batch", async () => {
        const s = make();
        await expect(s.createUploadUrls("u", "x")).rejects.toThrow(UploadError);
        await expect(s.createUploadUrls("u", [null])).rejects.toThrow("Only JPEG");
        await expect(s.createUploadUrls("u", [{ type: "image/png", size: 1.5 }])).rejects.toThrow("smaller than 10 MB");
    });

    it("creates keys per content type", async () => {
        const s = make();
        const out = await s.createUploadUrls("user1", ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].map((type) => ({ type, size: 5 })));
        expect(out.map((o) => o.key.split(".").pop())).toEqual(["jpg", "png", "webp", "avif", "gif"]);
        expect(out.every((o) => o.key.startsWith("places/user1/"))).toBe(true);
    });
});
