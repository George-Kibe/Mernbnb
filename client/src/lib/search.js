import { format, isValid, parseISO, startOfDay } from "date-fns";

// Home-page search state. It lives in the URL, e.g.
//   /?location=Kilifi&checkin=2026-10-01&checkout=2026-10-04&adults=2&pets=1
export const MAX_GUESTS = 16; // adults + children
const LIMITS = { adults: MAX_GUESTS, children: MAX_GUESTS - 1, infants: 5, pets: 5 };
export const GUEST_TYPES = ["adults", "children", "infants", "pets"];

export const EMPTY_SEARCH = { location: "", checkIn: null, checkOut: null, adults: 0, children: 0, infants: 0, pets: 0 };

const toDay = (value) => {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) && /^\d{4}-\d{2}-\d{2}$/.test(value) ? startOfDay(date) : null;
};
const toCount = (value, max) => Math.min(Math.max(Number.parseInt(value, 10) || 0, 0), max);
export const dayString = (date) => format(date, "yyyy-MM-dd");

export const readSearch = (params) => {
  const checkIn = toDay(params.get("checkin"));
  const checkOut = toDay(params.get("checkout"));
  const valid = checkIn && checkOut && checkOut > checkIn;
  const search = {
    location: (params.get("location") || "").slice(0, 100),
    checkIn: valid ? checkIn : null,
    checkOut: valid ? checkOut : null,
  };
  for (const type of GUEST_TYPES) search[type] = toCount(params.get(type), LIMITS[type]);
  return search;
};

// URL query params for a search (only the fields that are set).
export const searchParamsFor = (search) => {
  const params = {};
  if (search.location.trim()) params.location = search.location.trim();
  if (search.checkIn && search.checkOut) {
    params.checkin = dayString(search.checkIn);
    params.checkout = dayString(search.checkOut);
  }
  for (const type of GUEST_TYPES) if (search[type] > 0) params[type] = String(search[type]);
  return params;
};

// Filters for GET /api/places.
export const apiFiltersFor = (search) => {
  const { location, checkin, checkout } = searchParamsFor(search);
  const guests = totalGuests(search);
  return {
    ...(location && { location }),
    ...(checkin && { checkin, checkout }),
    ...(guests > 0 && { guests }),
    ...(search.pets > 0 && { pets: 1 }),
  };
};

export const totalGuests = (search) => search.adults + search.children;
export const hasSearch = (search) => Object.keys(searchParamsFor(search)).length > 0;

export const datesLabel = ({ checkIn, checkOut }) => {
  if (!checkIn || !checkOut) return null;
  return checkIn.getMonth() === checkOut.getMonth() && checkIn.getFullYear() === checkOut.getFullYear()
    ? `${format(checkIn, "MMM d")} – ${format(checkOut, "d")}`
    : `${format(checkIn, "MMM d")} – ${format(checkOut, "MMM d")}`;
};

const plural = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
export const guestsLabel = (search) => {
  const guests = totalGuests(search);
  if (!guests) return null;
  return [
    plural(guests, "guest"),
    search.infants > 0 && plural(search.infants, "infant"),
    search.pets > 0 && plural(search.pets, "pet"),
  ].filter(Boolean).join(", ");
};

// Keeps counts consistent the way Airbnb does: children, infants or pets
// need at least one adult, and adults + children stay within MAX_GUESTS.
// Returns `search` itself when the change isn't allowed, so callers can
// disable a stepper with `setGuestCount(...) === search`.
export const setGuestCount = (search, type, value) => {
  const clamped = Math.min(Math.max(value, 0), LIMITS[type]);
  if (clamped === search[type]) return search;
  const next = { ...search, [type]: clamped };
  if (totalGuests(next) > MAX_GUESTS) return search;
  if (type !== "adults" && next[type] > 0 && next.adults === 0) next.adults = 1;
  if (type === "adults" && next.adults === 0 && (next.children || next.infants || next.pets)) return search;
  return next;
};
