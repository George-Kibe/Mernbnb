// Metadata, structured data (schema.org JSON-LD) and no-JavaScript fallback
// content for the pages the server renders.
const { SITE_NAME, escapeHtml, truncate, renderHead } = require("./html");
const { slugify } = require("../lib/destinations");

const TITLE_SUFFIX = ` | ${SITE_NAME}`;
const DESCRIPTION_LENGTH = 160;
const MAX_IMAGES = 10;

const formatPrice = (amount) => `Kshs. ${Number(amount).toLocaleString("en-KE")}`;
const addressParts = (address) => String(address ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const inKenya = (name) => (/kenya/i.test(name) ? name : `${name}, Kenya`);

const breadcrumbList = (items) => ({
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, url }, i) => ({ "@type": "ListItem", position: i + 1, name, item: url })),
});

// Home › region › town › listing, from the listing's address
// ("Diani Beach, Kwale" -> Kwale › Diani Beach). Exported for tests.
const placeBreadcrumbs = (place, siteUrl, canonical) => [
    { name: "Home", url: `${siteUrl}/` },
    ...addressParts(place.address)
        .reverse()
        .filter((part) => slugify(part))
        .map((part) => ({ name: part, url: `${siteUrl}/stays/${slugify(part)}` })),
    { name: place.title, url: canonical },
];

// A listing page. `photoLink` turns a stored photo into a stable public URL.
const placePage = ({ place, siteUrl, photoLink }) => {
    const id = String(place._id);
    const canonical = `${siteUrl}/place/${id}`;
    const parts = addressParts(place.address);
    const town = parts[0] ?? "Kenya";
    const images = (place.photos ?? []).slice(0, MAX_IMAGES).map(photoLink);
    const guests = `${place.maxGuests} ${place.maxGuests === 1 ? "guest" : "guests"}`;

    const title = `${place.title}${place.title.toLowerCase().includes(town.toLowerCase()) ? "" : ` · ${town}`}${TITLE_SUFFIX}`;
    const description = truncate(
        `Stay in ${place.address} for up to ${guests} from ${formatPrice(place.price)} per night. ${place.description ?? ""}`,
        DESCRIPTION_LENGTH
    );

    const listing = {
        "@type": "LodgingBusiness",
        "@id": `${canonical}#listing`,
        name: place.title,
        description: truncate(place.description, 5000) || undefined,
        url: canonical,
        image: images.length ? images : undefined,
        address: {
            "@type": "PostalAddress",
            addressLocality: town,
            addressRegion: parts.length > 1 ? parts.at(-1) : undefined,
            addressCountry: "KE",
        },
        priceRange: `${formatPrice(place.price)} per night`,
        currenciesAccepted: "KES",
        maximumAttendeeCapacity: place.maxGuests,
        checkinTime: place.checkIn || undefined,
        checkoutTime: place.checkOut || undefined,
        petsAllowed: (place.perks ?? []).includes("Pets Allowed"),
        amenityFeature: (place.perks ?? []).map((perk) => ({ "@type": "LocationFeatureSpecification", name: perk, value: true })),
    };

    return {
        head: renderHead({
            title,
            description,
            canonical,
            image: images[0],
            imageAlt: images[0] && `${place.title}, ${place.address}`,
            jsonLd: { "@context": "https://schema.org", "@graph": [listing, breadcrumbList(placeBreadcrumbs(place, siteUrl, canonical))] },
        }),
        noscript: [
            `<h1>${escapeHtml(place.title)}</h1>`,
            `<p>${escapeHtml(place.address)} · ${escapeHtml(guests)} · ${escapeHtml(formatPrice(place.price))} per night</p>`,
            `<p>${escapeHtml(place.description ?? "")}</p>`,
            `<p><a href="/">Browse more stays</a></p>`,
        ].join(""),
    };
};

// A /stays/:slug landing page with one page of its listings.
const destinationPage = ({ destination, listings, siteUrl, photoLink }) => {
    const { name, slug, count, minPrice } = destination;
    const { places, total, page, limit } = listings;
    const base = `${siteUrl}/stays/${slug}`;
    const canonical = page > 1 ? `${base}?page=${page}` : base;
    const heading = `Vacation rentals in ${name}`;
    const title = `${heading}${page > 1 ? ` · Page ${page}` : ""}${TITLE_SUFFIX}`;
    const stays = `${count} holiday ${count === 1 ? "home" : "homes"}`;
    const description = truncate(
        `Book ${stays} and vacation rentals in ${inKenya(name)}${minPrice ? `, from ${formatPrice(minPrice)} per night` : ""}. Compare photos, amenities and prices on ${SITE_NAME}.`,
        DESCRIPTION_LENGTH
    );
    const cover = places.find((p) => p.photos?.length)?.photos[0];

    return {
        head: renderHead({
            title,
            description,
            canonical,
            image: cover && photoLink(cover),
            imageAlt: cover && heading,
            jsonLd: {
                "@context": "https://schema.org",
                "@graph": [
                    {
                        "@type": "CollectionPage",
                        "@id": canonical,
                        url: canonical,
                        name: heading,
                        description,
                        isPartOf: { "@id": `${siteUrl}/#website` },
                        mainEntity: {
                            "@type": "ItemList",
                            numberOfItems: total,
                            itemListElement: places.map((place, i) => ({
                                "@type": "ListItem",
                                position: (page - 1) * limit + i + 1,
                                url: `${siteUrl}/place/${place._id}`,
                                name: place.title,
                            })),
                        },
                    },
                    breadcrumbList([{ name: "Home", url: `${siteUrl}/` }, { name, url: base }]),
                ],
            },
        }),
        noscript: [
            `<h1>${escapeHtml(heading)}</h1>`,
            `<ul>${places
                .map((p) => `<li><a href="/place/${p._id}">${escapeHtml(p.title)}</a>, ${escapeHtml(p.address)}: ${escapeHtml(formatPrice(p.price))} per night</li>`)
                .join("")}</ul>`,
        ].join(""),
    };
};

// Unknown pages, and pages that can't be rendered right now.
const fallbackPage = ({ title = `Page not found${TITLE_SUFFIX}`, description = "The page you’re looking for doesn’t exist on AirBuenas." } = {}) => ({
    head: renderHead({ title, description, noindex: true }),
});

module.exports = { placePage, destinationPage, fallbackPage, placeBreadcrumbs, formatPrice };
