const express = require("express");
const Place = require("../models/Place");
const { listDestinations, findDestination } = require("../lib/destinations");
const { searchFilter, PAGE_SIZE } = require("../routes/places");
const { SITE_NAME, CARD_SIZES, COVER_SIZES, escapeHtml, renderPage } = require("./html");
const { placePage, destinationPage, fallbackPage } = require("./pages");

// The same values as the site-wide headers in vercel.json (a test keeps them
// in step), so server-rendered pages get the same protection as static ones.
const PAGE_HEADERS = {
    "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

// Vercel's CDN caches by s-maxage; browsers always revalidate. Keep page
// caching well under the hour that signed photo URLs are guaranteed to last.
const CACHE = {
    page: "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    missing: "public, max-age=0, s-maxage=60",
    sitemap: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    none: "no-store",
};
const MAX_SITEMAP_PLACES = 45_000; // a sitemap holds at most 50,000 URLs
const MAX_SITEMAP_IMAGES = 10;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

const UNAVAILABLE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" /><title>${SITE_NAME}</title></head><body><h1>${SITE_NAME} is temporarily unavailable</h1><p>Please <a href="">try again</a> in a minute.</p></body></html>`;

const originOf = (req) => `${req.protocol}://${req.get("host")}`;

// Server-rendered entry points for search engines and link previews:
// listing and destination pages get their own title, description, canonical
// link, share image and structured data in the HTML itself, missing pages
// return a real 404, and the sitemap and robots.txt are generated from the
// database. The app then starts in the browser as usual.
const createSeoRouter = ({ config, db, storage, limiters, loadShell }) => {
    const router = express.Router();
    const { siteUrl } = config;

    // A stored photo as a stable public URL (signed S3 URLs expire).
    const photoLink = (stored) => {
        const key = storage.toPhotoKey(stored);
        return /^https?:\/\//i.test(key) ? key : `${siteUrl}/api/photos/${key.split("/").map(encodeURIComponent).join("/")}`;
    };

    const missing = () => ({ status: 404, cache: CACHE.missing, ...fallbackPage() });

    // Wraps a page builder: build(req, res) returns { status, cache, head, ... }
    // or null when it already responded (e.g. a redirect).
    const htmlPage = (build) => async (req, res) => {
        let page;
        try {
            page = await build(req, res);
            if (!page) return;
        } catch (err) {
            // Usually the database. The app still loads and shows its own error.
            req.log.error("Could not render page; serving the app with a 503", { path: req.path, err });
            page = { status: 503, cache: CACHE.none, ...fallbackPage({ title: SITE_NAME, description: "Book unique stays across Kenya on AirBuenas." }) };
            res.set("Retry-After", "60");
        }

        let shell;
        try {
            shell = await loadShell(originOf(req));
        } catch (err) {
            req.log.error("Could not load the page template (client/dist/index.html)", { err });
            res.status(503).set(PAGE_HEADERS).set({ "Cache-Control": CACHE.none, "Retry-After": "60" }).type("html").send(UNAVAILABLE_HTML);
            return;
        }
        res.status(page.status).set(PAGE_HEADERS).set("Cache-Control", page.cache).type("html").send(renderPage(shell, page));
    };

    router.use(limiters.pages);

    router.get("/robots.txt", (req, res) => {
        res.type("text/plain").set("Cache-Control", CACHE.sitemap).send(
            [
                "User-agent: *",
                "Allow: /",
                // Account pages; the listing API stays crawlable because pages need it to render.
                "Disallow: /profile",
                "Disallow: /api/users/",
                "Disallow: /api/bookings/",
                "Disallow: /api/me/",
                "Disallow: /api/uploads/",
                "",
                `Sitemap: ${siteUrl}/sitemap.xml`,
                "",
            ].join("\n")
        );
    });

    router.get("/sitemap.xml", async (req, res) => {
        let places;
        let destinations;
        try {
            await db.connect();
            [places, destinations] = await Promise.all([
                Place.find({}, { photos: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(MAX_SITEMAP_PLACES).lean(),
                listDestinations(),
            ]);
        } catch (err) {
            req.log.error("Could not build the sitemap", { err });
            res.status(503).set({ "Cache-Control": CACHE.none, "Retry-After": "300" }).type("text/plain").send("Sitemap temporarily unavailable.");
            return;
        }

        const lastmod = (date) => (date ? `<lastmod>${new Date(date).toISOString()}</lastmod>` : "");
        const entry = (loc, extra = "") => `<url><loc>${escapeHtml(loc)}</loc>${extra}</url>`;
        req.log.debug("Sitemap generated", { places: places.length, destinations: destinations.length });
        const urls = [
            entry(`${siteUrl}/`, lastmod(places[0]?.updatedAt)),
            ...destinations.map((d) => entry(`${siteUrl}/stays/${d.slug}`)),
            ...places.map((p) =>
                entry(
                    `${siteUrl}/place/${p._id}`,
                    lastmod(p.updatedAt) +
                        (p.photos ?? [])
                            .slice(0, MAX_SITEMAP_IMAGES)
                            .map((photo) => `<image:image><image:loc>${escapeHtml(photoLink(photo))}</image:loc></image:image>`)
                            .join("")
                )
            ),
        ];
        res.type("application/xml").set("Cache-Control", CACHE.sitemap).send(
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
                urls.join("\n") +
                "\n</urlset>\n"
        );
    });

    router.get(
        "/place/:id",
        htmlPage(async (req) => {
            if (!OBJECT_ID.test(req.params.id)) return missing();
            await db.connect();
            const place = await Place.findById(req.params.id);
            if (!place) return missing();
            const shown = await storage.withPhotoUrls(place);
            return {
                status: 200,
                cache: CACHE.page,
                ...placePage({ place: place.toJSON(), siteUrl, photoLink }),
                preloadImage: { src: shown.photos[0], sizes: COVER_SIZES },
                initialData: { place: shown },
            };
        })
    );

    router.get(
        "/stays/:slug",
        htmlPage(async (req, res) => {
            const { slug } = req.params;
            if (slug !== slug.toLowerCase()) {
                const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
                res.redirect(301, `/stays/${encodeURIComponent(slug.toLowerCase())}${query}`);
                return null;
            }
            await db.connect();
            const destination = await findDestination(slug);
            if (!destination) return missing();

            const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
            const filter = await searchFilter({ location: destination.name });
            const [total, docs] = await Promise.all([
                Place.countDocuments(filter),
                Place.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
            ]);
            const totalPages = Math.ceil(total / PAGE_SIZE);
            if (page > totalPages) return missing();

            const listings = { page, limit: PAGE_SIZE, total, totalPages };
            const shown = await Promise.all(docs.map(storage.withPhotoUrls));
            return {
                status: 200,
                cache: CACHE.page,
                ...destinationPage({
                    destination,
                    listings: { ...listings, places: docs.map((d) => d.toJSON()) },
                    siteUrl,
                    photoLink,
                }),
                preloadImage: { src: shown[0]?.photos[0], sizes: CARD_SIZES },
                initialData: { stays: { destination, listings: { ...listings, places: shown } } },
            };
        })
    );

    // Everything else the CDN doesn't serve: a real 404 (the app shows its
    // "page not found" screen) instead of a soft 404.
    router.get("/*splat", htmlPage(async () => missing()));

    return router;
};

module.exports = { createSeoRouter, PAGE_HEADERS, CACHE };
