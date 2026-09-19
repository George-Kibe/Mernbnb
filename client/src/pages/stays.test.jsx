import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { makePlace, renderApp } from "../test/utils";
import { SITE_URL } from "../lib/seo";
import { resetInitialData } from "../lib/initialData";

// Its own file: lib/destinations.js caches the destination list per page
// load, so every test here serves the same one.
const KWALE = { name: "Kwale", slug: "kwale", count: 3, minPrice: 9000 };
const DIANI = { name: "Diani Beach", slug: "diani-beach", count: 1 };
const destinations = () => http.get("*/api/places/destinations", () => HttpResponse.json([KWALE, DIANI]));
const listings = (places, { page = 1, total = places.length } = {}) => ({ places, page, limit: 12, total, totalPages: Math.ceil(total / 12) });
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");

// What the server puts in a destination page.
const serverData = (data) => {
  document.getElementById("initial-data")?.remove();
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "initial-data";
  script.textContent = JSON.stringify(data);
  document.body.appendChild(script);
  resetInitialData();
};

beforeEach(() => {
  document.getElementById("initial-data")?.remove();
  resetInitialData();
});

describe("destination pages", () => {
  const kwalePlaces = [makePlace({ _id: "k1", title: "Tiwi Cottage", address: "Tiwi, Kwale" }), makePlace({ _id: "k2", title: "Diani Villa", address: "Diani Beach, Kwale" })];

  it("renders the server's destination and results without fetching", async () => {
    serverData({ stays: { destination: KWALE, listings: listings(kwalePlaces) } });
    server.use(destinations()); // the footer's
    renderApp("/stays/kwale");
    expect(screen.getByRole("heading", { level: 1, name: "Vacation rentals in Kwale" })).toBeInTheDocument();
    expect(screen.getByText("3 stays · from Kshs. 9,000 a night")).toBeInTheDocument();
    expect(screen.getByText("Tiwi Cottage")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    await waitFor(() => expect(document.title).toBe("Vacation rentals in Kwale | AirBuenas"));
    expect(canonical()).toBe(`${SITE_URL}/stays/kwale`);
  });

  it("looks up the destination and its listings when the app navigates there", async () => {
    let query;
    server.use(
      destinations(),
      http.get("*/api/places", ({ request }) => {
        query = Object.fromEntries(new URL(request.url).searchParams);
        return HttpResponse.json(listings([kwalePlaces[1]]));
      }),
    );
    renderApp("/stays/diani-beach?adults=2");
    expect(screen.getByText("Loading stays…")).toBeInTheDocument();
    expect(await screen.findByText("Diani Villa")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("1 stay")).toBeInTheDocument();
    expect(query).toMatchObject({ location: "Diani Beach", guests: "2", page: "1" });
    expect(screen.getByRole("link", { name: /Diani Villa/ })).toHaveAttribute("href", "/place/k2?adults=2");
    expect(screen.queryByText("Clear search")).not.toBeInTheDocument();
  });

  it("refetches when filters are added to a server-rendered page", async () => {
    serverData({ stays: { destination: KWALE, listings: listings(kwalePlaces) } });
    server.use(
      destinations(),
      http.get("*/api/places", () => HttpResponse.json(listings([]))),
    );
    renderApp("/stays/kwale?pets=1");
    expect(await screen.findByText("No exact matches")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remove all filters" })).toHaveAttribute("href", "/stays/kwale");
  });

  it("shows the 404 page for unknown destinations", async () => {
    server.use(destinations());
    renderApp("/stays/atlantis");
    expect(await screen.findByRole("heading", { name: "We can’t find that page" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Page not found | AirBuenas"));
  });

  it("renders destination links in the footer", async () => {
    server.use(
      destinations(),
      http.get("*/api/places", () => HttpResponse.json(listings([]))),
    );
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Kwale/ })).toHaveAttribute("href", "/stays/kwale");
  });
});
