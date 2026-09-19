import { useEffect } from "react";
import { formatPrice } from "./format";

// Page titles, descriptions and canonical links. Listing and destination
// pages arrive with these already in the HTML (api/_src/seo builds them with
// the same formulas); the app keeps <head> right as people navigate, and
// Google reads the rendered result, so the two must agree.

export const SITE_NAME = "AirBuenas";
export const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://mernbnb.vercel.app").replace(/\/+$/, "");
const SUFFIX = ` | ${SITE_NAME}`;
const HOME_HEADING = "Holiday homes & vacation rentals in Kenya";
export const DEFAULT_DESCRIPTION =
  "Book beach villas, safari cottages, lake cabins and city apartments across Kenya on AirBuenas. Compare photos, amenities and nightly prices in Kenyan shillings.";
const DESCRIPTION_LENGTH = 160;

// "Diani Beach" -> "diani-beach". Same as the API's lib/destinations.js.
export const slugify = (text) =>
  String(text)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Whitespace collapsed and cut at a word boundary. Same as the API's.
export const truncate = (text, max) => {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
};

export const addressParts = (address) => String(address ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const pageSuffix = (page) => (page > 1 ? ` · Page ${page}` : "");
const withPage = (path, page) => (page > 1 ? `${path}?page=${page}` : path);

// --- Metadata for each kind of page -----------------------------------------

export const homeSeo = ({ page = 1, searching = false, location = "" } = {}) =>
  searching
    ? { title: `${location ? `Stays in ${location}` : "Search results"}${SUFFIX}`, noindex: true }
    : { title: `${HOME_HEADING}${pageSuffix(page)}${SUFFIX}`, description: DEFAULT_DESCRIPTION, path: withPage("/", page) };

export const placeSeo = (place) => {
  const town = addressParts(place.address)[0] ?? "Kenya";
  const guests = `${place.maxGuests} ${place.maxGuests === 1 ? "guest" : "guests"}`;
  return {
    title: `${place.title}${place.title.toLowerCase().includes(town.toLowerCase()) ? "" : ` · ${town}`}${SUFFIX}`,
    description: truncate(
      `Stay in ${place.address} for up to ${guests} from ${formatPrice(place.price)} per night. ${place.description ?? ""}`,
      DESCRIPTION_LENGTH
    ),
    path: `/place/${place._id}`,
  };
};

export const destinationSeo = ({ name, slug, count, minPrice }, page = 1) => ({
  title: `Vacation rentals in ${name}${pageSuffix(page)}${SUFFIX}`,
  description: truncate(
    `Book ${count} holiday ${count === 1 ? "home" : "homes"} and vacation rentals in ${/kenya/i.test(name) ? name : `${name}, Kenya`}${
      minPrice ? `, from ${formatPrice(minPrice)} per night` : ""
    }. Compare photos, amenities and prices on ${SITE_NAME}.`,
    DESCRIPTION_LENGTH
  ),
  path: withPage(`/stays/${slug}`, page),
});

// Pages that shouldn't appear in search results (account pages, errors).
export const privateSeo = (title) => ({ title: `${title}${SUFFIX}`, noindex: true });

// --- Applying it to <head> ---------------------------------------------------

// The page the HTML was served for: its structured data (JSON-LD) describes
// that page only, so it is removed once the app shows another one.
const INITIAL_PATH = window.location.pathname;

const setMeta = (attribute, key, content) => {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (content === null || content === undefined) return element?.remove();
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
};

const setCanonical = (href) => {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!href) return link?.remove();
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
};

// Updates the tags index.html starts with. Share images (og:image) are left
// alone: link previews come from the server-rendered HTML, never from here.
export const applySeo = ({ title, description = DEFAULT_DESCRIPTION, path, noindex = false }) => {
  const url = !noindex && path ? `${SITE_URL}${path}` : null;
  document.title = title;
  setMeta("name", "description", description);
  setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow, max-image-preview:large");
  setCanonical(url);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  if (noindex || window.location.pathname !== INITIAL_PATH) document.getElementById("structured-data")?.remove();
};

// Applies `seo` (from the builders above) while the page is shown. Pass
// null while the page is loading: <head> keeps what the server sent.
export const useSeo = (seo) => {
  const { title, description, path, noindex } = seo ?? {};
  useEffect(() => {
    if (title) applySeo({ title, description, path, noindex });
  }, [title, description, path, noindex]);
};
