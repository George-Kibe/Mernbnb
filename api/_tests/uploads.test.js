import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, inject } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const request = require("supertest");
const { mockClient } = require("aws-sdk-client-mock");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { FetchImageError } = require("../_src/lib/fetchImage");
const { NO_S3_CREDENTIALS } = require("../_src/routes/uploads");
const h = require("./helpers");

const s3 = mockClient(S3Client);
let fetchImage;
let app;
let db;
let auth;
let user;
beforeAll(async () => {
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), fetchImage: (...args) => fetchImage(...args) }));
    await db.connect();
});
beforeEach(async () => {
    await h.clearDatabase();
    ({ user, auth } = await h.createUser());
    s3.reset();
    fetchImage = async () => ({ buffer: Buffer.from("png"), type: "image/png" });
});
afterEach(() => s3.reset());
afterAll(async () => {
    s3.restore();
    await h.closeDatabase();
});

describe("POST /api/uploads/presign", () => {
    it("requires login", async () => {
        await request(app).post("/api/uploads/presign").send({ files: [{ type: "image/png", size: 10 }] }).expect(401);
    });

    it("returns presigned uploads that sign type and size", async () => {
        const res = await request(app).post("/api/uploads/presign").set("Authorization", auth).send({ files: [{ type: "image/jpeg", size: 1234 }] }).expect(201);
        const [upload] = res.body;
        expect(upload.key).toMatch(new RegExp(`^places/${user._id}/[0-9a-f-]{36}\\.jpg$`));
        const url = new URL(upload.uploadUrl);
        expect(url.searchParams.get("X-Amz-SignedHeaders").split(";")).toEqual(expect.arrayContaining(["content-length", "content-type"]));
        expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
        expect(upload.url).toMatch(/X-Amz-Signature=/);
    });

    it.each([
        [{ files: [] }, "No files to upload."],
        [{}, undefined],
        [{ files: [{ type: "image/svg+xml", size: 10 }] }, "Only JPEG, PNG, WebP, AVIF and GIF images are supported."],
        [{ files: [{ type: "image/png", size: 11 * 1024 * 1024 }] }, "Each photo must be smaller than 10 MB."],
        [{ files: [{ type: "image/png", size: 0 }] }, "Each photo must be smaller than 10 MB."],
        [{ files: Array(21).fill({ type: "image/png", size: 10 }) }, "Upload at most 20 photos at a time."],
    ])("rejects invalid batch %#", async (body, message) => {
        const res = await request(app).post("/api/uploads/presign").set("Authorization", auth).send(body).expect(400);
        if (message) expect(res.body.error).toBe(message);
    });

    it("explains missing S3 credentials with a 503", async () => {
        const noCreds = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), db, storage: h.testStorage({ accessKeyId: undefined, secretAccessKey: undefined }) });
        const res = await request(noCreds.app).post("/api/uploads/presign").set("Authorization", auth).send({ files: [{ type: "image/png", size: 10 }] }).expect(503);
        expect(res.body.error).toBe(NO_S3_CREDENTIALS);
    });

    it("reports other storage failures as a 500", async () => {
        const storage = h.testStorage();
        storage.createUploadUrls = async () => { throw new Error("S3 is down"); };
        const broken = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), db, storage });
        await request(broken.app).post("/api/uploads/presign").set("Authorization", auth).send({ files: [{ type: "image/png", size: 10 }] }).expect(500);
    });

    it("rate limits uploads per user", async () => {
        const limited = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), db, env: { UPLOAD_RATE_LIMIT_MAX: "2" } });
        const send = () => request(limited.app).post("/api/uploads/presign").set("Authorization", auth).send({ files: [{ type: "image/png", size: 10 }] });
        await send().expect(201);
        await send().expect(201);
        const res = await send().expect(429);
        expect(res.body.error).toBe("Too many uploads. Please try again later.");
        const other = await h.createUser();
        await request(limited.app).post("/api/uploads/presign").set("Authorization", other.auth).send({ files: [{ type: "image/png", size: 10 }] }).expect(201);
    });
});

describe("POST /api/uploads/by-link", () => {
    it("downloads the image and stores it in S3", async () => {
        s3.on(PutObjectCommand).resolves({});
        let seen;
        fetchImage = async (link, options) => {
            seen = { link, options };
            return { buffer: Buffer.from("gif"), type: "image/gif" };
        };
        const res = await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: " https://example.com/a.gif " }).expect(201);
        expect(seen).toEqual({ link: "https://example.com/a.gif", options: { maxBytes: 10 * 1024 * 1024 } });
        expect(res.body.key).toMatch(/\.gif$/);
        const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
        expect(put).toMatchObject({ Bucket: "test-bucket", Key: res.body.key, ContentType: "image/gif" });
    });

    it("returns download problems as 422 with the reason", async () => {
        fetchImage = async () => { throw new FetchImageError("That link points to a private address."); };
        const res = await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "http://127.0.0.1/" }).expect(422);
        expect(res.body.error).toBe("That link points to a private address.");
    });

    it("treats unexpected download errors as 500", async () => {
        fetchImage = async () => { throw new Error("boom"); };
        await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "https://example.com/a.png" }).expect(500);
    });

    it("maps missing S3 credentials on upload to 503", async () => {
        s3.on(PutObjectCommand).rejects(Object.assign(new Error("no creds"), { name: "CredentialsProviderError" }));
        const res = await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "https://example.com/a.png" }).expect(503);
        expect(res.body.error).toBe(NO_S3_CREDENTIALS);
    });

    it("validates the link", async () => {
        await request(app).post("/api/uploads/by-link").set("Authorization", auth).send({ link: "" }).expect(400);
    });
});
