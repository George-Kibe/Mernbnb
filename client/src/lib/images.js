// Responsive images. Unsplash (the demo listings) resizes on request, so the
// browser can pick a width that fits the layout instead of downloading the
// full-size photo. Other photos (uploads on S3) are served as they are.
const WIDTHS = [320, 480, 640, 800, 960, 1280, 1920];

// `sizes` for photos in the listing grid (1/2/3/4/6 columns, see PlaceListings).
export const CARD_SIZES = "(min-width: 1536px) 16vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw";
// `sizes` for the cover photo on a listing page: half the grid on desktop,
// full width on phones. The API preloads it with the same values.
export const COVER_SIZES = "(min-width: 768px) 50vw, 100vw";

export const srcSetFor = (src) => {
  let url;
  try {
    url = new URL(src);
  } catch {
    return undefined;
  }
  if (url.hostname !== "images.unsplash.com") return undefined;
  return WIDTHS.map((width) => {
    url.searchParams.set("w", String(width));
    return `${url} ${width}w`;
  }).join(", ");
};
