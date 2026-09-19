const express = require("express");
const { z } = require("zod");
const { UploadError, MAX_IMAGE_BYTES } = require("../lib/s3");
const { fetchImage: defaultFetchImage, FetchImageError } = require("../lib/fetchImage");
const { validate } = require("../middleware/validate");
const { HttpError, badRequest, serviceUnavailable } = require("../errors");

const NO_S3_CREDENTIALS = "Photo uploads aren't set up on this server yet (missing S3 credentials).";

// S3 problems -> a helpful status instead of a generic 500.
const storageError = (req, error) => {
    if (error?.name === "CredentialsProviderError") {
        req.log.error("Photo uploads are down: no S3 credentials (set S3_ACCESS_KEY and S3_SECRET_ACCESS_KEY)", { err: error });
        return serviceUnavailable(NO_S3_CREDENTIALS);
    }
    return error;
};
const hostOf = (link) => {
    try {
        return new URL(link).hostname;
    } catch {
        return "(not a URL)";
    }
};

const presignBody = z.object({
    files: z.array(z.object({ type: z.string().max(100), size: z.number() })).min(1, "No files to upload.").max(100),
});
const linkBody = z.object({ link: z.string().trim().min(1, "Enter a valid image link.").max(2048) });

// Photo uploads. Files go straight from the browser to S3 via presigned URLs;
// links are downloaded server-side with SSRF protection.
const createUploadsRouter = ({ storage, limiters, auth, fetchImage = defaultFetchImage }) => {
    const router = express.Router();
    router.use(auth, limiters.upload);

    // { files: [{ type, size }] } -> [{ key, uploadUrl, url }]
    router.post("/presign", validate({ body: presignBody }), async (req, res) => {
        const { files } = req.valid.body;
        let targets;
        try {
            targets = await storage.createUploadUrls(req.user.id, files);
        } catch (error) {
            if (error instanceof UploadError) throw badRequest(error.message);
            throw storageError(req, error);
        }
        req.log.info("Upload URLs issued", { userId: req.user.id, files: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) });
        res.status(201).json(targets);
    });

    // { link } -> { key, url }
    router.post("/by-link", validate({ body: linkBody }), async (req, res) => {
        const { link } = req.valid.body;
        let image;
        try {
            image = await fetchImage(link, { maxBytes: MAX_IMAGE_BYTES });
        } catch (error) {
            // Includes blocked private addresses, i.e. possible SSRF attempts.
            if (error instanceof FetchImageError) {
                req.log.warn("Image link refused", { userId: req.user.id, host: hostOf(link), reason: error.message });
                throw new HttpError(422, error.message);
            }
            throw error;
        }
        const key = storage.newPhotoKey(req.user.id, image.type);
        try {
            await storage.putPhoto(key, image.buffer, image.type);
        } catch (error) {
            throw storageError(req, error);
        }
        req.log.info("Photo added from a link", { userId: req.user.id, host: hostOf(link), type: image.type, bytes: image.buffer.length, key });
        res.status(201).json({ key, url: await storage.photoUrl(key) });
    });

    return router;
};

module.exports = { createUploadsRouter, NO_S3_CREDENTIALS };
