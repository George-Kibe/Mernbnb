// Data the server already loaded for the page it rendered (listing and
// destination pages, see api/_src/seo), so the app can show it without
// fetching it again. Each entry is used by the first page that asks for it.
let data;

const read = () => {
  if (data === undefined) {
    try {
      data = JSON.parse(document.getElementById("initial-data")?.textContent || "{}") ?? {};
    } catch {
      data = {};
    }
  }
  return data;
};

// The server's `key` entry if `accept(entry)` agrees it belongs to this page.
// It is used up on the first call, so a later visit to the page loads fresh
// data (signed photo URLs expire).
export const takeInitialData = (key, accept = () => true) => {
  const entry = read()[key];
  if (entry === undefined || !accept(entry)) return undefined;
  delete data[key];
  return entry;
};

// The home page's first listings, if public/home-prefetch.js started loading
// them: a promise of the API response, or of null if that failed. Used once.
export const takeHomePrefetch = () => {
  const request = window.__homeListings;
  window.__homeListings = undefined;
  return request;
};

// Tests only: forget what was read.
export const resetInitialData = () => {
  data = undefined;
};
