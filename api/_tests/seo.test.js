import { describe, it, expect, beforeAll, beforeEach, afterAll, inject, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const request = require("supertest");
const h = require("./helpers");
const { PAGE_HEADERS } = require("../_src/seo/router");
const { createShellLoader } = require("../_src/seo/shell");
const { escapeHtml, scriptJson, truncate, srcSetFor, renderHead, renderPage, isShell } = require("../_src/seo/html");
const { placePage, destinationPage, fallbackPage, placeBreadcrumbs } = require("../_src/seo/pages");

// A built client index.html, as far as the SEO router cares.
const SHELL = `<!DOCTYPE html>
<html lang="en-KE">
  <head>
    <!--seo:start-->
    <title>Home</title>
    <!--seo:end-->
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
const SITE = "https://stays.example";
const USER_ID = "0123456789abcdef01234567";
const KEY = `places/${USER_ID}/3f1c2b7e-9a41-4c1e-8f0a-2b6f8c1d9e00.jpg`;
const UNSPLASH = "https://images.unsplash.com/photo-1?w=1200&q=80&auto=format&fit=crop";

// Pulls page parts out of the HTML.
const title = (html) => html.match(/<title>(.*?)<\/title>/)?.[1];
const meta = (html, name) => html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1];
const canonical = (html) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json" id="structured-data">(.*?)<\/script>/s)[1]);
const initialData = (html) => JSON.parse(html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s)[1]);

let app;
let db;
const loadShell = vi.fn(async () => SHELL);
beforeAll(async () => {
    ({ app, db } = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), env: { SITE_URL: `${SITE}/` }, loadShell }));
    await db.connect();
});
beforeEach(() => h.clearDatabase());
afterAll(() => h.closeDatabase());

describe("robots.txt", () => {
    it("allows crawling, keeps account pages out and points to the sitemap", async () => {
        const res = await request(app).get("/robots.txt").expect(200);
        expect(res.headers["content-type"]).toMatch(/^text\/plain/);
        expect(res.headers["cache-control"]).toMatch(/s-maxage=3600/);
        expect(res.text).toContain("User-agent: *\nAllow: /\nDisallow: /profile\n");
        expect(res.text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
        // Listing pages render from /api/places, so it must stay crawlable.
        expect(res.text).not.toMatch(/Disallow: \/api\/?\n/);
        expect(res.text).not.toContain("/api/places");
    });
});

describe("sitemap.xml", () => {
    it("lists the home page, destinations and listings with their photos", async () => {
        const { user } = await h.createUser();
        const older = await h.createPlace(user, { address: "Diani Beach, Kwale", photos: [KEY, UNSPLASH] });
        const newer = await h.createPlace(user, { address: "Karen, Nairobi", photos: ["https://bkt.example/x.jpg?a=1&b=2"] });
        await h.Place.collection.updateOne({ _id: older._id }, { $set: { updatedAt: new Date("2020-01-01T00:00:00Z") } });

        const res = await request(app).get("/sitemap.xml").expect(200);
        expect(res.headers["content-type"]).toMatch(/^application\/xml/);
        expect(res.headers["cache-control"]).toMatch(/s-maxage=3600/);
        const xml = res.text;
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')).toBe(true);
        expect(xml).toContain(`<url><loc>${SITE}/</loc><lastmod>${newer.updatedAt.toISOString()}</lastmod></url>`);
        for (const slug of ["kwale", "diani-beach", "nairobi", "karen"]) expect(xml).toContain(`<url><loc>${SITE}/stays/${slug}</loc></url>`);
        expect(xml).toContain(
            `<url><loc>${SITE}/place/${older._id}</loc><lastmod>2020-01-01T00:00:00.000Z</lastmod>` +
                `<image:image><image:loc>${SITE}/api/photos/${KEY}</image:loc></image:image>` +
                `<image:image><image:loc>${escapeHtml(UNSPLASH)}</image:loc></image:image></url>`
        );
        expect(xml).toContain("x.jpg?a=1&amp;b=2");
        expect(xml.indexOf(`/place/${newer._id}`)).toBeLessThan(xml.indexOf(`/place/${older._id}`)); // recently updated first
        expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    });

    it("still lists the home page when there are no listings", async () => {
        const { text } = await request(app).get("/sitemap.xml").expect(200);
        expect(text).toContain(`<url><loc>${SITE}/</loc></url>`);
        expect(text.match(/<url>/g)).toHaveLength(1);
    });

    it("returns 503 when the database is down", async () => {
        const down = { connect: () => Promise.reject(new Error("down")), requireConnection: db.requireConnection };
        const res = await request(h.makeApp({ db: down, loadShell }).app).get("/sitemap.xml").expect(503);
        expect(res.headers["retry-after"]).toBe("300");
        expect(res.headers["cache-control"]).toBe("no-store");
    });
});

describe("GET /place/:id", () => {
    it("renders the listing's title, description, canonical link, share image and structured data", async () => {
        const { user } = await h.createUser();
        const place = await h.createPlace(user, {
            title: "Oceanfront villa",
            address: "Diani Beach, Kwale",
            photos: [KEY, UNSPLASH],
            description: "Wake up to the Indian Ocean.   Private pool,\nchef on request.",
            perks: ["Wifi", "Pets Allowed"],
            maxGuests: 6,
            price: 25000,
        });

        const res = await request(app).get(`/place/${place._id}?checkin=2030-01-01`).expect(200);
        const html = res.text;
        expect(res.headers["content-type"]).toMatch(/^text\/html/);
        expect(res.headers["cache-control"]).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=600");
        expect(title(html)).toBe("Oceanfront villa · Diani Beach | AirBuenas");
        expect(meta(html, "description")).toBe(
            "Stay in Diani Beach, Kwale for up to 6 guests from Kshs. 25,000 per night. Wake up to the Indian Ocean. Private pool, chef on request."
        );
        expect(meta(html, "robots")).toBe("index, follow, max-image-preview:large");
        expect(canonical(html)).toBe(`${SITE}/place/${place._id}`);
        expect(meta(html, "og:url")).toBe(`${SITE}/place/${place._id}`);
        expect(meta(html, "og:image")).toBe(`${SITE}/api/photos/${KEY}`); // stable, unlike signed URLs
        expect(meta(html, "twitter:card")).toBe("summary_large_image");
        expect(html).not.toContain("<title>Home</title>");
        expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>'); // the app still loads

        const [listing, breadcrumbs] = jsonLd(html)["@graph"];
        expect(listing).toMatchObject({
            "@type": "LodgingBusiness",
            name: "Oceanfront villa",
            url: `${SITE}/place/${place._id}`,
            image: [`${SITE}/api/photos/${KEY}`, UNSPLASH],
            address: { "@type": "PostalAddress", addressLocality: "Diani Beach", addressRegion: "Kwale", addressCountry: "KE" },
            priceRange: "Kshs. 25,000 per night",
            maximumAttendeeCapacity: 6,
            checkinTime: "14:00",
            checkoutTime: "11:00",
            petsAllowed: true,
        });
        expect(listing.amenityFeature.map((a) => a.name)).toEqual(["Wifi", "Pets Allowed"]);
        expect(breadcrumbs.itemListElement.map((i) => [i.position, i.name, i.item])).toEqual([
            [1, "Home", `${SITE}/`],
            [2, "Kwale", `${SITE}/stays/kwale`],
            [3, "Diani Beach", `${SITE}/stays/diani-beach`],
            [4, "Oceanfront villa", `${SITE}/place/${place._id}`],
        ]);

        // The app gets the place (with signed photo URLs) without fetching it.
        const { place: data } = initialData(html);
        expect(data).toMatchObject({ _id: String(place._id), title: "Oceanfront villa", price: 25000 });
        expect(data.photos[0]).toMatch(/^https:\/\/test-bucket\.s3\.eu-west-1\.amazonaws\.com\/places\/.+X-Amz-Signature=/);
        expect(data.photos[1]).toBe(UNSPLASH);
        expect(html).toContain(`<link rel="preload" as="image" href="${escapeHtml(data.photos[0])}" fetchpriority="high" />`);
        expect(html).toContain("<noscript><h1>Oceanfront villa</h1><p>Diani Beach, Kwale · 6 guests · Kshs. 25,000 per night</p>");
    });

    it("sends the same security headers as the rest of the site", async () => {
        const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "vercel.json"), "utf8"));
        const siteHeaders = Object.fromEntries(vercel.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value]));
        for (const [key, value] of Object.entries(PAGE_HEADERS)) expect(siteHeaders[key]).toBe(value);

        const { user } = await h.createUser();
        const place = await h.createPlace(user);
        const res = await request(app).get(`/place/${place._id}`).expect(200);
        for (const [key, value] of Object.entries(PAGE_HEADERS)) expect(res.headers[key.toLowerCase()]).toBe(value);
    });

    it("escapes listing text in HTML and in scripts", async () => {
        const { user } = await h.createUser();
        const nasty = `</script><script>alert("x")</script> & $& "quotes"`;
        const place = await h.createPlace(user, { title: nasty, description: nasty, address: `<b>Kilifi</b>` });
        const { text: html } = await request(app).get(`/place/${place._id}`).expect(200);
        expect(html).not.toContain('<script>alert("x")');
        expect(title(html)).toBe(`${escapeHtml(nasty)} · ${escapeHtml("<b>Kilifi</b>")} | AirBuenas`);
        expect(jsonLd(html)["@graph"][0].name).toBe(nasty);
        expect(initialData(html).place.title).toBe(nasty);
    });

    it("prefers the preload candidates the app picks for resizable photos", async () => {
        const { user } = await h.createUser();
        const place = await h.createPlace(user, { photos: [UNSPLASH] });
        const { text: html } = await request(app).get(`/place/${place._id}`).expect(200);
        expect(html).toContain(`imagesrcset="${escapeHtml(srcSetFor(UNSPLASH))}" imagesizes="(min-width: 768px) 50vw, 100vw"`);
    });

    it("returns a real 404 page for unknown and malformed ids", async () => {
        for (const id of ["000000000000000000000000", "not-an-id"]) {
            const res = await request(app).get(`/place/${id}`).expect(404);
            expect(title(res.text)).toBe("Page not found | AirBuenas");
            expect(meta(res.text, "robots")).toBe("noindex, follow");
            expect(canonical(res.text)).toBeUndefined();
            expect(res.headers["cache-control"]).toBe("public, max-age=0, s-maxage=60");
            expect(res.text).toContain('<div id="root"></div>'); // the app shows its own 404
        }
    });

    it("serves the app with a 503 when the database is down", async () => {
        const down = { connect: () => Promise.reject(new Error("down")), requireConnection: db.requireConnection };
        const res = await request(h.makeApp({ db: down, loadShell }).app).get(`/place/${USER_ID}`).expect(503);
        expect(res.headers["retry-after"]).toBe("60");
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(title(res.text)).toBe("AirBuenas");
        expect(meta(res.text, "robots")).toBe("noindex, follow");
        expect(res.text).toContain('<script type="module" src="/assets/index-abc.js"></script>');
    });

    it("returns a plain 503 page when the app's HTML can't be loaded", async () => {
        const broken = h.makeApp({ loadShell: () => Promise.reject(new Error("no shell")) });
        const res = await request(broken.app).get("/place/not-an-id").expect(503);
        expect(res.text).toContain("temporarily unavailable");
        expect(res.headers["content-security-policy"]).toBe(PAGE_HEADERS["Content-Security-Policy"]);
    });
});

describe("GET /stays/:slug", () => {
    const seed = async (count, address = "Diani Beach, Kwale") => {
        const { user } = await h.createUser();
        const places = [];
        for (let i = 0; i < count; i++) {
            places.push(await h.createPlace(user, { title: `Villa ${i}`, address, price: 9000 + i * 1000, photos: i === 0 ? [] : [UNSPLASH] }));
        }
        return places;
    };

    it("renders a destination landing page with its listings", async () => {
        await seed(3);
        await seed(1, "Karen, Nairobi");
        const res = await request(app).get("/stays/kwale").expect(200);
        const html = res.text;
        expect(title(html)).toBe("Vacation rentals in Kwale | AirBuenas");
        expect(meta(html, "description")).toBe(
            "Book 3 holiday homes and vacation rentals in Kwale, Kenya, from Kshs. 9,000 per night. Compare photos, amenities and prices on AirBuenas."
        );
        expect(canonical(html)).toBe(`${SITE}/stays/kwale`);
        expect(meta(html, "og:image")).toBe(escapeHtml(UNSPLASH)); // first listing with a photo
        expect(html).toContain(`imagesizes="(min-width: 1536px) 16vw`);

        const [collection, breadcrumbs] = jsonLd(html)["@graph"];
        expect(collection).toMatchObject({ "@type": "CollectionPage", name: "Vacation rentals in Kwale", mainEntity: { "@type": "ItemList", numberOfItems: 3 } });
        expect(collection.mainEntity.itemListElement.map((i) => [i.position, i.name])).toEqual([[1, "Villa 2"], [2, "Villa 1"], [3, "Villa 0"]]);
        expect(breadcrumbs.itemListElement.map((i) => i.item)).toEqual([`${SITE}/`, `${SITE}/stays/kwale`]);
        expect(html).toContain("<noscript><h1>Vacation rentals in Kwale</h1><ul><li><a href=\"/place/");

        const { stays } = initialData(html);
        expect(stays.destination).toEqual({ name: "Kwale", slug: "kwale", count: 3, minPrice: 9000 });
        expect(stays.listings).toMatchObject({ page: 1, limit: 12, total: 3, totalPages: 1 });
        expect(stays.listings.places.map((p) => p.title)).toEqual(["Villa 2", "Villa 1", "Villa 0"]);
    });

    it("gives later pages their own canonical link and positions", async () => {
        await seed(13);
        const { text: html } = await request(app).get("/stays/diani-beach?page=2&adults=2").expect(200);
        expect(title(html)).toBe("Vacation rentals in Diani Beach · Page 2 | AirBuenas");
        expect(canonical(html)).toBe(`${SITE}/stays/diani-beach?page=2`);
        expect(jsonLd(html)["@graph"][0].mainEntity.itemListElement).toEqual([
            { "@type": "ListItem", position: 13, url: expect.stringContaining("/place/"), name: "Villa 0" },
        ]);
        expect(meta(html, "og:image")).toBeUndefined(); // Villa 0 has no photos
        expect(html).not.toContain('rel="preload"');
        expect(initialData(html).stays.listings.page).toBe(2);
        await request(app).get("/stays/diani-beach?page=3").expect(404);
        await request(app).get("/stays/diani-beach?page=junk").expect(200);
    });

    it("redirects mixed-case links to the lowercase address", async () => {
        const res = await request(app).get("/stays/Diani-Beach?page=2").expect(301);
        expect(res.headers.location).toBe("/stays/diani-beach?page=2");
        expect((await request(app).get("/stays/KWALE").expect(301)).headers.location).toBe("/stays/kwale");
    });

    it("returns 404 for destinations without listings", async () => {
        await seed(1);
        const res = await request(app).get("/stays/mombasa").expect(404);
        expect(meta(res.text, "robots")).toBe("noindex, follow");
    });
});

describe("other pages", () => {
    it("returns HTML 404s for unknown paths, and JSON 404s for unknown API routes", async () => {
        const page = await request(app).get("/no/such/page").expect(404);
        expect(page.headers["content-type"]).toMatch(/^text\/html/);
        expect(title(page.text)).toBe("Page not found | AirBuenas");
        const api = await request(app).get("/api/nope").expect(404);
        expect(api.body.error).toBe("That endpoint doesn't exist.");
        await request(app).post("/place/abc").expect(404).expect("content-type", /json/);
    });

    it("rate limits page requests separately from the API", async () => {
        const limited = h.makeApp({ mongoUri: h.databaseUri(inject("mongoUri")), env: { PAGE_RATE_LIMIT_MAX: "2" }, loadShell });
        await request(limited.app).get("/robots.txt").expect(200);
        await request(limited.app).get("/robots.txt").expect(200);
        const res = await request(limited.app).get("/robots.txt").expect(429);
        expect(res.body.error).toMatch(/Too many requests/);
        await request(limited.app).get("/api/nope").expect(404); // the API has its own limit
    });
});

describe("GET /api/photos/*key", () => {
    it("redirects a listing photo to a fresh signed URL", async () => {
        const res = await request(app).get(`/api/photos/${KEY}`).expect(302);
        expect(res.headers.location).toMatch(new RegExp(`^https://test-bucket\\.s3\\.eu-west-1\\.amazonaws\\.com/${KEY}\\?.*X-Amz-Signature=`));
        expect(res.headers["cache-control"]).toBe("public, max-age=1800, s-maxage=1800");
    });

    it("404s anything that isn't a listing photo key", async () => {
        for (const key of ["places/abc/cover.jpg", `private/${USER_ID}/x.jpg`, `places/${USER_ID}/../../secret.jpg`, "places"]) {
            await request(app).get(`/api/photos/${key}`).expect(404);
        }
    });
});

describe("page shell", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "airbuenas-shell-"));
    const file = (name, content) => {
        const p = path.join(tmp, name);
        fs.writeFileSync(p, content);
        return p;
    };
    const response = (html, ok = true, status = 200) => ({ ok, status, text: async () => html });

    it("reads the first valid index.html on disk, once", async () => {
        const good = file("good.html", SHELL);
        const fetch = vi.fn();
        const load = createShellLoader({ files: [path.join(tmp, "missing.html"), file("plain.html", "<html></html>"), good], fetch });
        expect(await load("https://a.example")).toBe(SHELL);
        fs.unlinkSync(good);
        expect(await load("https://a.example")).toBe(SHELL);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("otherwise fetches it from the site and keeps it for a while", async () => {
        let time = 0;
        const fetch = vi.fn(async () => response(SHELL));
        const load = createShellLoader({ files: [], fetch, ttlMs: 1000, now: () => time });
        expect(await load("https://a.example")).toBe(SHELL);
        expect(fetch).toHaveBeenCalledWith("https://a.example/index.html", expect.objectContaining({ redirect: "error" }));
        await load("https://a.example");
        expect(fetch).toHaveBeenCalledTimes(1);
        await load("https://b.example"); // per origin
        time = 1001;
        await load("https://a.example");
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("rejects error responses and pages that aren't the app", async () => {
        await expect(createShellLoader({ files: [], fetch: async () => response("", false, 404) })("https://a.example")).rejects.toThrow("HTTP 404");
        await expect(createShellLoader({ files: [], fetch: async () => response("<html>parked</html>") })("https://a.example")).rejects.toThrow(/SEO markers/);
    });

    it("has defaults for production", () => {
        expect(typeof createShellLoader()).toBe("function");
    });
});

describe("html helpers", () => {
    it("truncates at a word boundary", () => {
        expect(truncate("  short   text ", 20)).toBe("short text");
        expect(truncate("one two three four five", 16)).toBe("one two three…");
        expect(truncate("sentence ends here. More", 21)).toBe("sentence ends here…");
        expect(truncate("x".repeat(30), 10)).toBe(`${"x".repeat(9)}…`);
        expect(truncate(undefined, 10)).toBe("");
    });

    it("keeps JSON inside script elements", () => {
        expect(scriptJson({ a: "</script><!--" })).toBe('{"a":"\\u003c/script>\\u003c!--"}');
        expect(JSON.parse(scriptJson({ a: "</script>" })).a).toBe("</script>");
    });

    it("builds srcsets only for resizable photos", () => {
        expect(srcSetFor(UNSPLASH)).toMatch(/^https:\/\/images\.unsplash\.com\/photo-1\?w=320&q=80&auto=format&fit=crop 320w, .* 1920w$/);
        expect(srcSetFor("https://bucket.s3.amazonaws.com/a.jpg")).toBeUndefined();
        expect(srcSetFor("not a url")).toBeUndefined();
    });

    it("renders only the tags it has values for", () => {
        const head = renderHead({ title: "T", description: "D", noindex: true, canonical: `${SITE}/x` });
        expect(head).toContain('<meta name="robots" content="noindex, follow" />');
        expect(head).not.toContain("canonical");
        expect(head).toContain(`<meta property="og:url" content="${SITE}/x" />`);
        expect(head).toContain('<meta name="twitter:card" content="summary" />');
        expect(head).not.toMatch(/og:image|ld\+json/);
    });

    it("fills in the shell without treating $ as a pattern", () => {
        expect(isShell(SHELL)).toBe(true);
        expect(isShell(null)).toBe(false);
        const html = renderPage(SHELL, { head: "<title>$& $1</title>", noscript: "$'" });
        expect(html).toContain("<title>$& $1</title>");
        expect(html).toContain("<noscript>$'</noscript>");
        expect(html).not.toContain("initial-data");
    });
});

describe("page metadata", () => {
    const photoLink = (p) => `${SITE}/p/${p}`;
    const base = { _id: USER_ID, title: "Lamu House", address: "Lamu", description: "", photos: [], perks: [], maxGuests: 1, price: 3000 };

    it("handles single-part addresses, one guest and no photos", () => {
        const { head } = placePage({ place: base, siteUrl: SITE, photoLink });
        expect(head).toContain("<title>Lamu House | AirBuenas</title>"); // the town is already in the title
        expect(head).toContain("for up to 1 guest from Kshs. 3,000 per night.");
        expect(head).toContain('twitter:card" content="summary"');
        const ld = JSON.parse(head.match(/ld\+json" id="structured-data">(.*)<\/script>/)[1])["@graph"][0];
        expect(ld.address.addressRegion).toBeUndefined();
        expect(ld.image).toBeUndefined();
        expect(ld.petsAllowed).toBe(false);
    });

    it("tolerates missing optional fields", () => {
        const { head } = placePage({ place: { _id: USER_ID, title: "Hut", address: "", maxGuests: 2, price: 1 }, siteUrl: SITE, photoLink });
        expect(head).toContain("<title>Hut · Kenya | AirBuenas</title>");
        expect(placeBreadcrumbs({ title: "Hut", address: "!!, Kwale" }, SITE, "c").map((c) => c.name)).toEqual(["Home", "Kwale", "Hut"]);
    });

    it("words destination descriptions naturally", () => {
        const listings = { places: [], total: 1, page: 1, limit: 12 };
        const { head } = destinationPage({ destination: { name: "Western Kenya", slug: "western-kenya", count: 1 }, listings, siteUrl: SITE, photoLink });
        expect(head).toContain("Book 1 holiday home and vacation rentals in Western Kenya. Compare");
        expect(head).not.toContain("og:image");
    });

    it("has a noindex fallback", () => {
        expect(fallbackPage().head).toContain("Page not found | AirBuenas");
        expect(fallbackPage({ title: "X", description: "Y" }).head).toContain("<title>X</title>");
    });
});
