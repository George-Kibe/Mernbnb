const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET = process.env.S3_BUCKET || "mernbnb-images-bucket";
const REGION = process.env.S3_REGION || "eu-west-1";
// Optional S3-compatible endpoint (MinIO, a local emulator). Unset for AWS.
const ENDPOINT = process.env.S3_ENDPOINT?.replace(/\/$/, "") || undefined;

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

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
// View URLs are signed from the start of the current hour and stay valid for
// two, so every request within an hour gets the same (browser-cacheable) URL
// and each URL is valid for at least an hour after it is handed out.
const VIEW_URL_WINDOW_MS = 60 * 60 * 1000;
const VIEW_URL_TTL_SECONDS = 2 * 60 * 60;

class UploadError extends Error {}

let client;
const s3 = () => {
    client ??= new S3Client({
        region: REGION,
        endpoint: ENDPOINT,
        forcePathStyle: Boolean(ENDPOINT),
        credentials: process.env.S3_ACCESS_KEY
            ? {
                  accessKeyId: process.env.S3_ACCESS_KEY,
                  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined, // fall back to the default AWS credential chain
    });
    return client;
};

const newPhotoKey = (userId, contentType) =>
    `places/${userId}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;

// Presigned PUT URLs for a batch of files described as { type, size }.
// Content-Type and Content-Length are signed, so S3 rejects an upload whose
// type or size differs from what was validated here.
const createUploadUrls = async (userId, files) => {
    if (!Array.isArray(files) || files.length === 0) {
        throw new UploadError("No files to upload.");
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
        throw new UploadError(`Upload at most ${MAX_FILES_PER_REQUEST} photos at a time.`);
    }
    for (const file of files) {
        if (!IMAGE_TYPES[file?.type]) {
            throw new UploadError("Only JPEG, PNG, WebP, AVIF and GIF images are supported.");
        }
        if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
            throw new UploadError("Each photo must be smaller than 10 MB.");
        }
    }
    return Promise.all(
        files.map(async ({ type, size }) => {
            const key = newPhotoKey(userId, type);
            const uploadUrl = await getSignedUrl(
                s3(),
                new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: type, ContentLength: size }),
                {
                    expiresIn: UPLOAD_URL_TTL_SECONDS,
                    signableHeaders: new Set(["content-type", "content-length"]),
                }
            );
            return { key, uploadUrl, url: await photoUrl(key) };
        })
    );
};

const putPhoto = (key, body, contentType) =>
    s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));

// URL prefixes under which this bucket's objects can appear. Photos saved
// before the presigned-URL change are stored as full public URLs.
const BUCKET_URL_PREFIXES = [
    `https://${BUCKET}.s3.amazonaws.com/`,
    `https://${BUCKET}.s3.${REGION}.amazonaws.com/`,
    `https://s3.${REGION}.amazonaws.com/${BUCKET}/`,
    `https://s3.amazonaws.com/${BUCKET}/`,
    ENDPOINT && `${ENDPOINT}/${BUCKET}/`,
].filter(Boolean);

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

// Reduces a stored photo, or a (signed) URL of one, to its S3 key. Anything
// that isn't in our bucket (legacy external URLs) is returned unchanged.
const toPhotoKey = (value) => {
    const prefix = BUCKET_URL_PREFIXES.find((p) => value.startsWith(p));
    if (!prefix) return value;
    return decodeURIComponent(value.slice(prefix.length).split("?")[0]);
};

// Cleans the photos array sent by the client before it is saved.
const normalizePhotos = (photos) => {
    if (!Array.isArray(photos)) return [];
    const keys = photos
        .filter((photo) => typeof photo === "string" && photo.trim())
        .map((photo) => toPhotoKey(photo.trim()));
    return [...new Set(keys)].slice(0, MAX_PHOTOS_PER_PLACE);
};

let signedUrlCache = { windowStart: 0, urls: new Map() };
let warnedAboutSigning = false;

// A signed GET URL for a stored photo.
const photoUrl = async (value) => {
    const key = toPhotoKey(value);
    if (isAbsoluteUrl(key)) return key;

    const now = Date.now();
    const windowStart = now - (now % VIEW_URL_WINDOW_MS);
    if (signedUrlCache.windowStart !== windowStart) {
        signedUrlCache = { windowStart, urls: new Map() };
    }
    const cached = signedUrlCache.urls.get(key);
    if (cached) return cached;

    try {
        const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
            expiresIn: VIEW_URL_TTL_SECONDS,
            signingDate: new Date(windowStart),
        });
        signedUrlCache.urls.set(key, url);
        return url;
    } catch (error) {
        // Without credentials we can't sign; a public URL still works if the
        // bucket allows public reads.
        if (!warnedAboutSigning) {
            console.error("Could not sign photo URLs, serving unsigned URLs:", error.message);
            warnedAboutSigning = true;
        }
        return ENDPOINT
            ? `${ENDPOINT}/${BUCKET}/${encodeURI(key)}`
            : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`;
    }
};

// A place (document or plain object) with `photos` resolved to signed URLs.
const withPhotoUrls = async (place) => {
    if (!place) return place;
    const plain = typeof place.toObject === "function" ? place.toObject() : { ...place };
    plain.photos = await Promise.all((plain.photos || []).map(photoUrl));
    return plain;
};

module.exports = {
    BUCKET,
    IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    UploadError,
    s3,
    newPhotoKey,
    createUploadUrls,
    putPhoto,
    normalizePhotos,
    photoUrl,
    withPhotoUrls,
};
