import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { makeFile } from "../test/files";
import {
  EMPTY_SEARCH, apiFiltersFor, datesLabel, dayString, guestsLabel, hasSearch, readSearch, searchParamsFor, setGuestCount, totalGuests,
} from "./search";
import { formatDay, formatPrice, nightsBetween, utcDay } from "./format";
import { pageItems } from "./pagination";
import { SESSION_EXPIRED_EVENT, api, errorMessage, readToken } from "./api";
import { useFetch } from "./useFetch";
import { ACCEPTED_PHOTO_TYPES, addPhotoByLink, photoProblem, uploadPhotos } from "./photos";

describe("search", () => {
  const params = (query) => new URLSearchParams(query);

  it("reads a full search from the URL", () => {
    const s = readSearch(params("location=Kilifi&checkin=2030-01-10&checkout=2030-01-13&adults=2&children=1&infants=1&pets=1"));
    expect(s.location).toBe("Kilifi");
    expect(dayString(s.checkIn)).toBe("2030-01-10");
    expect(dayString(s.checkOut)).toBe("2030-01-13");
    expect(s).toMatchObject({ adults: 2, children: 1, infants: 1, pets: 1 });
  });

  it("drops invalid, reversed or partial dates and clamps counts", () => {
    expect(readSearch(params("checkin=2030-01-13&checkout=2030-01-10"))).toMatchObject({ checkIn: null, checkOut: null });
    expect(readSearch(params("checkin=nope&checkout=2030-01-10")).checkIn).toBeNull();
    expect(readSearch(params("checkin=2030-1-1&checkout=2030-01-10")).checkIn).toBeNull();
    expect(readSearch(params("adults=99&infants=-3&pets=abc"))).toMatchObject({ adults: 16, infants: 0, pets: 0 });
    expect(readSearch(params(`location=${"x".repeat(150)}`)).location).toHaveLength(100);
  });

  it("round-trips to URL params and API filters", () => {
    const s = readSearch(params("location= Kwale &checkin=2030-01-10&checkout=2030-01-13&adults=2&children=1&pets=2"));
    expect(searchParamsFor(s)).toEqual({ location: "Kwale", checkin: "2030-01-10", checkout: "2030-01-13", adults: "2", children: "1", pets: "2" });
    expect(apiFiltersFor(s)).toEqual({ location: "Kwale", checkin: "2030-01-10", checkout: "2030-01-13", guests: 3, pets: 1 });
    expect(apiFiltersFor(EMPTY_SEARCH)).toEqual({});
    expect(hasSearch(EMPTY_SEARCH)).toBe(false);
    expect(hasSearch(s)).toBe(true);
  });

  it("labels dates and guests like Airbnb", () => {
    const same = readSearch(params("checkin=2030-01-10&checkout=2030-01-13"));
    const cross = readSearch(params("checkin=2030-01-30&checkout=2030-02-02"));
    const years = readSearch(params("checkin=2030-12-30&checkout=2031-01-02"));
    expect(datesLabel(same)).toBe("Jan 10 – 13");
    expect(datesLabel(cross)).toBe("Jan 30 – Feb 2");
    expect(datesLabel(years)).toBe("Dec 30 – Jan 2");
    expect(datesLabel(EMPTY_SEARCH)).toBeNull();
    expect(guestsLabel(EMPTY_SEARCH)).toBeNull();
    expect(guestsLabel({ ...EMPTY_SEARCH, adults: 1 })).toBe("1 guest");
    expect(guestsLabel({ ...EMPTY_SEARCH, adults: 2, children: 1, infants: 2, pets: 1 })).toBe("3 guests, 2 infants, 1 pet");
    expect(totalGuests({ adults: 2, children: 3 })).toBe(5);
  });

  it("enforces guest rules", () => {
    const s = { ...EMPTY_SEARCH };
    const withChild = setGuestCount(s, "children", 1);
    expect(withChild).toMatchObject({ children: 1, adults: 1 }); // adds an adult
    expect(setGuestCount(withChild, "adults", 0)).toBe(withChild); // can't remove last adult
    expect(setGuestCount(s, "infants", 0)).toBe(s); // no change
    expect(setGuestCount({ ...s, adults: 16 }, "children", 1).children).toBe(0); // over the max
    expect(setGuestCount({ ...s, infants: 5 }, "infants", 6)).toMatchObject({ infants: 5 });
    expect(setGuestCount({ ...s, adults: 2 }, "adults", 1).adults).toBe(1);
  });
});

describe("format", () => {
  it("formats UTC-midnight dates as the same calendar day", () => {
    expect(utcDay("2030-01-10T00:00:00.000Z").getDate()).toBe(10);
    expect(formatDay("2030-01-10T00:00:00.000Z")).toBe("Thu, Jan 10, 2030");
    expect(formatDay("2030-01-10T00:00:00.000Z", "MMM d")).toBe("Jan 10");
    expect(nightsBetween("2030-01-10T00:00:00Z", "2030-01-13T00:00:00Z")).toBe(3);
    expect(formatPrice(12500)).toBe("Kshs. 12,500");
  });
});

describe("pageItems", () => {
  it.each([
    [1, 1, [1]],
    [4, 7, [1, 2, 3, 4, 5, 6, 7]],
    [2, 15, [1, 2, 3, 4, 5, "…", 15]],
    [8, 15, [1, "…", 7, 8, 9, "…", 15]],
    [13, 15, [1, "…", 11, 12, 13, 14, 15]],
  ])("page %i of %i", (page, total, expected) => {
    expect(pageItems(page, total)).toEqual(expected);
  });
});

describe("api", () => {
  it("sends the token and reports session expiry on 401", async () => {
    localStorage.setItem("token", "abc");
    let auth;
    server.use(http.get("*/api/secure", ({ request }) => {
      auth = request.headers.get("authorization");
      return HttpResponse.json({ error: "expired" }, { status: 401 });
    }));
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    await expect(api.get("/secure")).rejects.toBeTruthy();
    expect(auth).toBe("Bearer abc");
    expect(onExpired).toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  it("doesn't report expiry for anonymous 401s", async () => {
    server.use(http.get("*/api/secure", () => HttpResponse.json({}, { status: 401 })));
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    await expect(api.get("/secure")).rejects.toBeTruthy();
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  it("turns errors into readable messages", () => {
    expect(errorMessage({ response: { data: { error: "Nope" } } })).toBe("Nope");
    expect(errorMessage({ response: { data: "Legacy text" } })).toBe("Legacy text");
    expect(errorMessage({ code: "ECONNABORTED", request: {} })).toMatch(/too long/);
    expect(errorMessage({ request: {} })).toMatch(/Can't reach the server/);
    expect(errorMessage({ response: { data: {} } }, "Fallback")).toBe("Fallback");
    expect(errorMessage(undefined)).toMatch(/Something went wrong/);
  });

  it("reads the token safely", () => {
    expect(readToken()).toBeNull();
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readToken()).toBeNull();
    spy.mockRestore();
  });
});

describe("useFetch", () => {
  it("loads, exposes data and reloads", async () => {
    let calls = 0;
    server.use(http.get("*/api/things", ({ request }) => {
      calls += 1;
      return HttpResponse.json({ calls, q: new URL(request.url).searchParams.get("q") });
    }));
    const { result } = renderHook(() => useFetch("/things", { q: "x" }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ calls: 1, q: "x" }));
    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ calls: 2, q: "x" }));
  });

  it("exposes errors and does nothing without a URL", async () => {
    server.use(http.get("*/api/broken", () => HttpResponse.json({ error: "bad" }, { status: 500 })));
    const { result } = renderHook(() => useFetch("/broken"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
    const idle = renderHook(() => useFetch(null));
    expect(idle.result.current).toMatchObject({ loading: false, data: null, error: null });
  });

  it("ignores responses for an old URL", async () => {
    server.use(http.get("*/api/slow/:id", async ({ params }) => {
      if (params.id === "1") await new Promise((r) => setTimeout(r, 50));
      return HttpResponse.json({ id: params.id });
    }));
    const { result, rerender } = renderHook(({ url }) => useFetch(url), { initialProps: { url: "/slow/1" } });
    rerender({ url: "/slow/2" });
    await waitFor(() => expect(result.current.data).toEqual({ id: "2" }));
    await new Promise((r) => setTimeout(r, 80));
    expect(result.current.data).toEqual({ id: "2" });
  });
});

const S3_CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "*" };

describe("photos", () => {
  const file = (name, type) => makeFile(name, type, "x".repeat(10));

  it("validates files", () => {
    expect(ACCEPTED_PHOTO_TYPES).toContain("image/webp");
    expect(photoProblem(file("a.png", "image/png"))).toBeNull();
    expect(photoProblem(file("a.svg", "image/svg+xml"))).toMatch(/isn't a JPEG/);
    const big = file("big.jpg", "image/jpeg");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    expect(photoProblem(big)).toMatch(/larger than 10 MB/);
  });

  it("presigns, uploads straight to S3 without the API token, and reports per-file results", async () => {
    localStorage.setItem("token", "secret-token");
    const s3Auth = [];
    server.use(
      http.post("*/api/uploads/presign", async ({ request }) => {
        const { files } = await request.json();
        return HttpResponse.json(files.map((f, i) => ({ key: `k${i}`, uploadUrl: `https://s3.test/k${i}`, url: `https://cdn.test/k${i}` })), { status: 201 });
      }),
      // Like the real bucket's CORS rule, allow cross-origin PUTs.
      http.options("https://s3.test/:key", () => new HttpResponse(null, { status: 200, headers: S3_CORS })),
      http.put("https://s3.test/:key", ({ params, request }) => {
        s3Auth.push(request.headers.get("authorization"));
        return new HttpResponse(null, { status: params.key === "k1" ? 403 : 200, headers: S3_CORS });
      }),
    );
    const results = await uploadPhotos([file("a.jpg", "image/jpeg"), file("b.jpg", "image/jpeg")]);
    expect(results).toEqual([{ url: "https://cdn.test/k0" }, { error: "b.jpg failed to upload." }]);
    expect(s3Auth).toEqual([null, null]);
  });

  it("reports presign failures for the whole batch and splits large batches", async () => {
    let batches = 0;
    server.use(http.post("*/api/uploads/presign", () => {
      batches += 1;
      return HttpResponse.json({ error: "Photo uploads aren't set up" }, { status: 503 });
    }));
    const files = Array.from({ length: 21 }, (_, i) => file(`${i}.jpg`, "image/jpeg"));
    const results = await uploadPhotos(files);
    expect(batches).toBe(2);
    expect(results).toHaveLength(21);
    expect(results[0]).toEqual({ error: "Photo uploads aren't set up" });
  });

  it("adds a photo by link", async () => {
    server.use(http.post("*/api/uploads/by-link", () => HttpResponse.json({ key: "k", url: "https://cdn.test/k" }, { status: 201 })));
    expect(await addPhotoByLink("https://example.com/a.png")).toBe("https://cdn.test/k");
  });
});

describe("destinations", () => {
  beforeEach(() => vi.resetModules());

  it("fetches once and caches; retries after a failure", async () => {
    let calls = 0;
    server.use(http.get("*/api/places/destinations", () => {
      calls += 1;
      return calls === 1 ? HttpResponse.json({ error: "x" }, { status: 500 }) : HttpResponse.json([{ name: "Kilifi", count: 4 }]);
    }));
    const { loadDestinations } = await import("./destinations");
    expect(await loadDestinations()).toEqual([]);
    expect(await loadDestinations()).toEqual([{ name: "Kilifi", count: 4 }]);
    expect(await loadDestinations()).toEqual([{ name: "Kilifi", count: 4 }]);
    expect(calls).toBe(2);
  });

  it("treats a non-array response as empty", async () => {
    server.use(http.get("*/api/places/destinations", () => HttpResponse.json({ nope: true })));
    const { loadDestinations } = await import("./destinations");
    expect(await loadDestinations()).toEqual([]);
  });
});

describe("theme", () => {
  beforeEach(() => {
    vi.resetModules();
    window.__mediaQueries.dark = false;
  });

  it("follows the OS by default and applies explicit choices", async () => {
    window.__mediaQueries.dark = true;
    const { setTheme } = await import("./theme");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
    setTheme("bogus");
    expect(localStorage.getItem("theme")).toBe("light");
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("tracks OS changes only in system mode", async () => {
    const { setTheme } = await import("./theme");
    setTheme("system");
    window.__mediaQueries.dark = true;
    window.__fireMediaChange();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    setTheme("light");
    window.__fireMediaChange();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("uses a stored preference and survives blocked storage", async () => {
    localStorage.setItem("theme", "dark");
    const { useTheme } = await import("./theme");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
    act(() => result.current[1]("system"));
    expect(result.current[0]).toBe("system");

    vi.resetModules();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const mod = await import("./theme");
    const hook = renderHook(() => mod.useTheme());
    expect(hook.result.current[0]).toBe("system");
    act(() => mod.setTheme("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});
