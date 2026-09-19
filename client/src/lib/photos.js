import axios from "axios";
import { api, errorMessage } from "./api";

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MIN_RECOMMENDED_PHOTOS = 5;
const MAX_FILES_PER_REQUEST = 20; // matches the API's presign limit

// Uploads go straight to S3. A bare axios instance keeps the API's
// Authorization header off those requests (S3 rejects a second auth scheme).
const s3 = axios.create();

// Returns a user-facing reason the file can't be uploaded, or null.
export const photoProblem = (file) => {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    return `${file.name} isn't a JPEG, PNG, WebP, AVIF or GIF image.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name} is larger than 10 MB.`;
  }
  return null;
};

export { errorMessage };

// Uploads files to S3 with presigned URLs.
// onProgress(fileIndex, fraction) reports per-file progress.
// Resolves to one result per file, in order: { url } or { error }.
export const uploadPhotos = async (files, onProgress) => {
  const results = [];
  for (let start = 0; start < files.length; start += MAX_FILES_PER_REQUEST) {
    const batch = files.slice(start, start + MAX_FILES_PER_REQUEST);
    let targets;
    try {
      ({ data: targets } = await api.post("/uploads/presign", {
        files: batch.map(({ type, size }) => ({ type, size })),
      }));
    } catch (error) {
      const message = errorMessage(error, "Could not start the upload.");
      results.push(...batch.map(() => ({ error: message })));
      continue;
    }
    const settled = await Promise.allSettled(
      targets.map((target, i) =>
        s3.put(target.uploadUrl, batch[i], {
          headers: { "Content-Type": batch[i].type },
          onUploadProgress: (event) =>
            onProgress?.(start + i, event.total ? event.loaded / event.total : 0),
        })
      )
    );
    results.push(
      ...settled.map((outcome, i) =>
        outcome.status === "fulfilled"
          ? { url: targets[i].url }
          : { error: `${batch[i].name} failed to upload.` }
      )
    );
  }
  return results;
};

// The server downloads the image and stores it in S3. Resolves to its URL.
export const addPhotoByLink = async (link) => {
  const { data } = await api.post("/uploads/by-link", { link });
  return data.url;
};
