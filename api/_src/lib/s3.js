const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Content types we accept, mapped to the file extension used in the key.
const IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;
const MAX_PHOTOS_PER_PLACE = 50;
const DELETE_BATCH = 1000; // S3's limit per DeleteObjects call

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
// View URLs are signed from the start of the current hour and stay valid for
// two, so every request within an hour gets the same (browser-cacheable) URL
// and each URL is valid for at least an hour after it is handed out.
const VIEW_URL_WINDOW_MS = 60 * 60 * 1000;
const VIEW_URL_TTL_SECONDS = 2 * 60 * 60;

class UploadError extends Error {}

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

// Photo storage in S3 (or an S3-compatible endpoint). Photos are stored as
// keys; clients get signed URLs.
const createPhotoStorage = ({ bucket, region, endpoint, accessKeyId, secretAccessKey }, { logger, now = Date.now } = {}) => {
    const client = new S3Client({
        region,
        endpoint,
        forcePathStyle: Boolean(endpoint),
        // Without explicit keys, fall back to the default AWS credential chain.
        credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
    });

    const newPhotoKey = (userId, contentType) =>
        `places/${userId}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;

    // URL prefixes under which this bucket's objects can appear. Photos saved
    // before the presigned-URL change are stored as full public URLs.
    const prefixes = [
        `https://${bucket}.s3.amazonaws.com/`,
        `https://${bucket}.s3.${region}.amazonaws.com/`,
        `https://s3.${region}.amazonaws.com/${bucket}/`,
        `https://s3.amazonaws.com/${bucket}/`,
        endpoint && `${endpoint}/${bucket}/`,
    ].filter(Boolean);

    // Reduces a stored photo, or a (signed) URL of one, to its S3 key. Anything
    // not in our bucket (legacy external URLs) is returned unchanged.
    const toPhotoKey = (value) => {
        const prefix = prefixes.find((p) => value.startsWith(p));
        return prefix ? decodeURIComponent(value.slice(prefix.length).split("?")[0]) : value;
    };

    // Cleans the photos array sent by the client before it is saved.
    const normalizePhotos = (photos) => {
        if (!Array.isArray(photos)) return [];
        const keys = photos
            .filter((photo) => typeof photo === "string" && photo.trim())
            .map((photo) => toPhotoKey(photo.trim()));
        return [...new Set(keys)].slice(0, MAX_PHOTOS_PER_PLACE);
    };

    const publicUrl = (key) =>
        endpoint ? `${endpoint}/${bucket}/${encodeURI(key)}` : `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;

    let cache = { windowStart: 0, urls: new Map() };
    let warnedAboutSigning = false;

    // A signed GET URL for a stored photo.
    const photoUrl = async (value) => {
        const key = toPhotoKey(value);
        if (isAbsoluteUrl(key)) return key;

        const time = now();
        const windowStart = time - (time % VIEW_URL_WINDOW_MS);
        if (cache.windowStart !== windowStart) cache = { windowStart, urls: new Map() };
        const cached = cache.urls.get(key);
        if (cached) return cached;

        try {
            const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
                expiresIn: VIEW_URL_TTL_SECONDS,
                signingDate: new Date(windowStart),
            });
            cache.urls.set(key, url);
            return url;
        } catch (error) {
            // Without credentials we can't sign; a public URL still works if
            // the bucket allows public reads.
            if (!warnedAboutSigning) {
                logger?.warn("Could not sign photo URLs; serving unsigned URLs, which only work if the bucket is public", { bucket, err: error });
                warnedAboutSigning = true;
            }
            return publicUrl(key);
        }
    };

    // A place (document or plain object) with `photos` resolved to signed URLs.
    const withPhotoUrls = async (place) => {
        if (!place) return place;
        const plain = typeof place.toJSON === "function" ? place.toJSON() : { ...place };
        plain.photos = await Promise.all((plain.photos || []).map(photoUrl));
        return plain;
    };

    // Presigned PUT URLs for files described as { type, size }. Content-Type
    // and Content-Length are signed, so S3 rejects any other type or size.
    const createUploadUrls = async (userId, files) => {
        if (!Array.isArray(files) || files.length === 0) throw new UploadError("No files to upload.");
        if (files.length > MAX_FILES_PER_REQUEST) {
            throw new UploadError(`Upload at most ${MAX_FILES_PER_REQUEST} photos at a time.`);
        }
        for (const file of files) {
            if (!IMAGE_TYPES[file?.type]) throw new UploadError("Only JPEG, PNG, WebP, AVIF and GIF images are supported.");
            if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
                throw new UploadError("Each photo must be smaller than 10 MB.");
            }
        }
        return Promise.all(
            files.map(async ({ type, size }) => {
                const key = newPhotoKey(userId, type);
                const uploadUrl = await getSignedUrl(
                    client,
                    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type, ContentLength: size }),
                    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) }
                );
                return { key, uploadUrl, url: await photoUrl(key) };
            })
        );
    };

    const putPhoto = (key, body, contentType) =>
        client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));

    // Removes photos from the bucket: for listings that were edited or
    // deleted, so their photos don't linger. Values that aren't ours (legacy
    // external URLs) are skipped. Returns the number of keys deleted.
    const deletePhotos = async (photos) => {
        const keys = [...new Set((photos ?? []).map(toPhotoKey).filter((key) => key && !isAbsoluteUrl(key)))];
        for (let start = 0; start < keys.length; start += DELETE_BATCH) {
            const batch = keys.slice(start, start + DELETE_BATCH);
            await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
        }
        return keys.length;
    };

    return { client, bucket, newPhotoKey, toPhotoKey, normalizePhotos, photoUrl, withPhotoUrls, createUploadUrls, putPhoto, deletePhotos };
};

module.exports = { createPhotoStorage, UploadError, IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_FILES_PER_REQUEST, MAX_PHOTOS_PER_PLACE };
