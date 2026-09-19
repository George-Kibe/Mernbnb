import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { makePlace, renderApp, USER } from "../test/utils";
import { applySeo, destinationSeo, homeSeo, placeSeo, privateSeo, SITE_URL, slugify, truncate, useSeo } from "../lib/seo";
import { resetInitialData, takeInitialData } from "../lib/initialData";
import { CARD_SIZES, srcSetFor } from "../lib/images";
import PhotoCarousel from "../components/photos/PhotoCarousel";
import PhotoGrid from "../components/photos/PhotoGrid";
import { PAGE_SIZE } from "../components/PlaceListings";
import prefetchScript from "../../public/home-prefetch.js?raw";

const UNSPLASH = "https://images.unsplash.com/photo-1?w=1200&q=80&auto=format&fit=crop";
const KWALE = { name: "Kwale", slug: "kwale", count: 3, minPrice: 9000 };
const listings = (places, { page = 1, total = places.length } = {}) => ({ places, page, limit: 12, total, totalPages: Math.ceil(total / 12) });

const head = {
  meta: (key) => document.head.querySelector(`meta[name="${key}"], meta[property="${key}"]`)?.getAttribute("content"),
  canonical: () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  jsonLd: () => document.getElementById("structured-data"),
};

// What the server puts in a listing or destination page.
const serverData = (data) => {
  document.getElementById("initial-data")?.remove();
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "initial-data";
  script.textContent = JSON.stringify(data);
  document.body.appendChild(script);
  resetInitialData();
};

const addJsonLd = () => {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "structured-data";
  script.textContent = "{}";
  document.head.appendChild(script);
};

beforeEach(() => {
  document.getElementById("initial-data")?.remove();
  resetInitialData();
});

describe("seo builders (the API uses the same formulas)", () => {
  it("slugifies and truncates like the API", () => {
    expect(slugify("Mũrang'a")).toBe("murang-a");
    expect(slugify("  Diani Beach ")).toBe("diani-beach");
    expect(truncate("  short   text ", 20)).toBe("short text");
    expect(truncate("one two three four five", 16)).toBe("one two three…");
    expect(truncate("x".repeat(30), 10)).toBe(`${"x".repeat(9)}…`);
    expect(truncate(undefined, 10)).toBe("");
  });

  it("describes a listing exactly like the server-rendered page", () => {
    const place = makePlace({
      title: "Oceanfront villa",
      address: "Diani Beach, Kwale",
      description: "Wake up to the Indian Ocean.   Private pool,\nchef on request.",
      maxGuests: 6,
      price: 25000,
    });
    expect(placeSeo(place)).toEqual({
      title: "Oceanfront villa · Diani Beach | AirBuenas",
      description: "Stay in Diani Beach, Kwale for up to 6 guests from Kshs. 25,000 per night. Wake up to the Indian Ocean. Private pool, chef on request.",
      path: `/place/${place._id}`,
    });
    expect(placeSeo(makePlace({ title: "Lamu House", address: "Lamu", maxGuests: 1, description: undefined })).title).toBe("Lamu House | AirBuenas");
    expect(placeSeo(makePlace({ title: "Hut", address: "", maxGuests: 1 })).description).toMatch(/^Stay in for up to 1 guest /);
    expect(placeSeo(makePlace({ title: "Hut", address: "" })).title).toBe("Hut · Kenya | AirBuenas");
  });

  it("describes destination and home pages", () => {
    expect(destinationSeo(KWALE)).toEqual({
      title: "Vacation rentals in Kwale | AirBuenas",
      description: "Book 3 holiday homes and vacation rentals in Kwale, Kenya, from Kshs. 9,000 per night. Compare photos, amenities and prices on AirBuenas.",
      path: "/stays/kwale",
    });
    expect(destinationSeo({ name: "Western Kenya", slug: "western-kenya", count: 1 }, 2)).toMatchObject({
      title: "Vacation rentals in Western Kenya · Page 2 | AirBuenas",
      description: "Book 1 holiday home and vacation rentals in Western Kenya. Compare photos, amenities and prices on AirBuenas.",
      path: "/stays/western-kenya?page=2",
    });
    expect(homeSeo()).toMatchObject({ title: "Holiday homes & vacation rentals in Kenya | AirBuenas", path: "/" });
    expect(homeSeo({ page: 3 })).toMatchObject({ title: "Holiday homes & vacation rentals in Kenya · Page 3 | AirBuenas", path: "/?page=3" });
    expect(homeSeo({ searching: true, location: "Kilifi" })).toEqual({ title: "Stays in Kilifi | AirBuenas", noindex: true });
    expect(homeSeo({ searching: true })).toEqual({ title: "Search results | AirBuenas", noindex: true });
    expect(privateSeo("Log in")).toEqual({ title: "Log in | AirBuenas", noindex: true });
  });
});

describe("applySeo", () => {
  it("creates or updates the head tags, and drops the canonical link on noindex pages", () => {
    addJsonLd();
    applySeo({ title: "One", description: "First", path: "/stays/kwale" });
    expect(document.title).toBe("One");
    expect(head.meta("description")).toBe("First");
    expect(head.meta("robots")).toBe("index, follow, max-image-preview:large");
    expect(head.canonical()).toBe(`${SITE_URL}/stays/kwale`);
    expect(head.meta("og:url")).toBe(`${SITE_URL}/stays/kwale`);
    expect(head.meta("og:title")).toBe("One");
    expect(head.meta("twitter:description")).toBe("First");
    expect(head.jsonLd()).not.toBeNull(); // still the page the HTML was served for

    applySeo({ title: "Two", path: "/stays/kwale?page=2" });
    expect(head.meta("description")).toMatch(/^Book beach villas/); // default
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(head.canonical()).toBe(`${SITE_URL}/stays/kwale?page=2`);

    applySeo({ title: "Private", noindex: true, path: "/profile" });
    expect(head.meta("robots")).toBe("noindex, follow");
    expect(head.canonical()).toBeUndefined();
    expect(head.meta("og:url")).toBeUndefined();
    expect(head.jsonLd()).toBeNull();

    applySeo({ title: "No path" });
    expect(head.canonical()).toBeUndefined();
  });

  it("removes structured data once the app shows another page", () => {
    addJsonLd();
    window.history.pushState({}, "", "/somewhere-else");
    applySeo({ title: "Elsewhere", path: "/somewhere-else" });
    expect(head.jsonLd()).toBeNull();
    window.history.pushState({}, "", "/");
  });

  it("leaves the head alone while a page is loading", () => {
    document.title = "From the server";
    const Probe = () => { useSeo(null); return null; };
    render(<Probe />);
    expect(document.title).toBe("From the server");
  });
});

describe("initial data", () => {
  it("hands the server's data to the first page that asks for it", () => {
    serverData({ place: { _id: "a" } });
    expect(takeInitialData("place", (p) => p._id === "b")).toBeUndefined(); // not this page
    expect(takeInitialData("place", (p) => p._id === "a")).toEqual({ _id: "a" });
    expect(takeInitialData("place")).toBeUndefined(); // used up
    expect(takeInitialData("stays")).toBeUndefined();
  });

  it("ignores missing or broken data", () => {
    expect(takeInitialData("place")).toBeUndefined();
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "initial-data";
    script.textContent = "{not json";
    document.body.appendChild(script);
    resetInitialData();
    expect(takeInitialData("place")).toBeUndefined();
  });
});

describe("responsive images", () => {
  it("offers resized candidates for Unsplash photos only", () => {
    expect(srcSetFor(UNSPLASH).split(", ")).toHaveLength(7);
    expect(srcSetFor(UNSPLASH)).toContain("https://images.unsplash.com/photo-1?w=640&q=80&auto=format&fit=crop 640w");
    expect(srcSetFor("https://bucket.s3.amazonaws.com/a.jpg")).toBeUndefined();
    expect(srcSetFor("blob:nope")).toBeUndefined();
    expect(srcSetFor("")).toBeUndefined();
  });

  it("loads a card's next photo only once someone shows interest", () => {
    const { container } = render(<PhotoCarousel photos={[UNSPLASH, "https://img.example/2.jpg"]} alt="Villa" priority="high" />);
    const imgs = () => container.querySelectorAll("img");
    expect(imgs()).toHaveLength(1);
    expect(imgs()[0]).toHaveAttribute("loading", "eager");
    expect(imgs()[0]).toHaveAttribute("fetchpriority", "high");
    expect(imgs()[0]).toHaveAttribute("sizes", CARD_SIZES);
    expect(imgs()[0].getAttribute("srcset")).toContain("320w");
    fireEvent.pointerEnter(container.firstChild);
    expect(imgs()).toHaveLength(2);
    expect(imgs()[1]).toHaveAttribute("loading", "lazy");
    expect(imgs()[1]).not.toHaveAttribute("srcset");
  });

  it("loads the covers of the first cards right away, the first one ahead of the rest", () => {
    const { container } = render(<PhotoCarousel photos={[UNSPLASH]} alt="Villa" priority="eager" />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
    expect(container.querySelector("img")).not.toHaveAttribute("fetchpriority");
  });

  it("loads a listing's cover photo first", () => {
    const { container } = render(<PhotoGrid photos={[UNSPLASH, "https://img.example/2.jpg"]} title="Villa" onOpen={() => {}} />);
    const covers = [...container.querySelectorAll('img[alt="Villa — photo 1"]')];
    expect(covers).toHaveLength(2); // desktop grid + phone strip, same image
    for (const img of covers) {
      expect(img).toHaveAttribute("fetchpriority", "high");
      expect(img).toHaveAttribute("sizes", "(min-width: 768px) 50vw, 100vw");
      expect(img.getAttribute("srcset")).toBe(srcSetFor(UNSPLASH));
    }
    for (const img of container.querySelectorAll('img[alt="Villa — photo 2"]')) expect(img).toHaveAttribute("loading", "lazy");
  });
});

describe("pages", () => {
  const noDestinations = () => server.use(http.get("*/api/places/destinations", () => HttpResponse.json([])));

  it("gives the home page a heading, title and canonical link", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(listings([makePlace()], { page: 2, total: 13 }))));
    renderApp("/?page=2");
    expect(screen.getByRole("heading", { level: 1, name: "Holiday homes & vacation rentals in Kenya" })).toBeInTheDocument();
    await screen.findByText("Lakeside Cabin");
    expect(document.title).toBe("Holiday homes & vacation rentals in Kenya · Page 2 | AirBuenas");
    expect(head.canonical()).toBe(`${SITE_URL}/?page=2`);
  });

  it("uses the listings public/home-prefetch.js started loading", async () => {
    noDestinations();
    window.__homeListings = Promise.resolve(listings([makePlace({ title: "Prefetched Villa" })]));
    renderApp("/"); // no /api/places handler: a second request would fail the test
    expect(await screen.findByText("Prefetched Villa")).toBeInTheDocument();
    expect(window.__homeListings).toBeUndefined();
    expect(prefetchScript).toContain(`fetch('/api/places?page=1&limit=${PAGE_SIZE}'`);
  });

  it("fetches the listings itself when the early request failed", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(listings([makePlace({ title: "Fetched Villa" })]))));
    window.__homeListings = Promise.resolve(null);
    renderApp("/");
    expect(await screen.findByText("Fetched Villa")).toBeInTheDocument();
  });

  it("keeps search results out of the index", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(listings([makePlace()]))));
    renderApp("/?location=Naivasha");
    expect(await screen.findByRole("heading", { level: 1, name: "1 stay in Naivasha" })).toBeInTheDocument();
    expect(document.title).toBe("Stays in Naivasha | AirBuenas");
    expect(head.meta("robots")).toBe("noindex, follow");
    expect(head.canonical()).toBeUndefined();
  });

  it("shows a server-rendered listing without fetching it, with breadcrumbs", async () => {
    noDestinations();
    const place = makePlace({ address: "Diani Beach, Kwale" });
    serverData({ place });
    renderApp(`/place/${place._id}`); // no /api/places/:id handler: a fetch would fail the test
    expect(screen.getByRole("heading", { level: 1, name: "Lakeside Cabin" })).toBeInTheDocument();
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(crumbs.getByRole("link", { name: "Kwale" })).toHaveAttribute("href", "/stays/kwale");
    expect(crumbs.getByRole("link", { name: "Diani Beach" })).toHaveAttribute("href", "/stays/diani-beach");
    await waitFor(() => expect(document.title).toBe("Lakeside Cabin · Diani Beach | AirBuenas"));
    expect(head.canonical()).toBe(`${SITE_URL}/place/${place._id}`);
  });

  it("fetches a listing when the server data is for another one", async () => {
    noDestinations();
    serverData({ place: makePlace({ _id: "other" }) });
    server.use(http.get("*/api/places/:id", () => HttpResponse.json(makePlace({ address: "" }))));
    renderApp(`/place/${makePlace()._id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Lakeside Cabin" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument(); // no address, no trail
  });

  it("marks missing listings noindex", async () => {
    noDestinations();
    server.use(http.get("*/api/places/:id", () => HttpResponse.json({ error: "gone" }, { status: 404 })));
    renderApp("/place/missing");
    expect(await screen.findByText(/doesn’t exist/)).toBeInTheDocument();
    expect(document.title).toBe("Place not found | AirBuenas");
    expect(head.meta("robots")).toBe("noindex, follow");
  });

  it("titles account pages and keeps them out of the index", async () => {
    noDestinations();
    renderApp("/login");
    await waitFor(() => expect(document.title).toBe("Log in | AirBuenas"));
    expect(head.meta("robots")).toBe("noindex, follow");
  });

  it("titles the sign-up page and profile area", async () => {
    noDestinations();
    const { unmount } = renderApp("/register");
    await waitFor(() => expect(document.title).toBe("Sign up | AirBuenas"));
    unmount();
    server.use(http.get("*/api/users/me", () => HttpResponse.json({ user: USER })));
    renderApp("/profile", { user: USER });
    await waitFor(() => expect(document.title).toBe("Your account | AirBuenas"));
  });
});
