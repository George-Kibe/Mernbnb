import { api } from "./api";

// Destination suggestions from GET /api/places/destinations, shared by the
// navbar search and the footer: fetched once per page load, retried on failure.
let request = null;

export const loadDestinations = () => {
  request ??= api
    .get("/places/destinations")
    .then(({ data }) => (Array.isArray(data) ? data : []))
    .catch(() => {
      request = null;
      return [];
    });
  return request;
};
