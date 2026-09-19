const Place = require("../models/Place");

// "Diani Beach" -> "diani-beach". The client has the same function
// (client/src/lib/seo.js); keep them in sync.
const slugify = (text) =>
    String(text)
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

// Every comma-separated address part with its number of stays and lowest
// nightly price, most stays first: "Diani Beach, Kwale" counts towards
// "Diani Beach" and "Kwale".
const listDestinations = async () => {
    const groups = await Place.aggregate([{ $group: { _id: "$address", count: { $sum: 1 }, minPrice: { $min: "$price" } } }]);
    const totals = new Map();
    for (const { _id: address, count, minPrice } of groups) {
        if (typeof address !== "string") continue;
        for (const part of new Set(address.split(",").map((s) => s.trim()).filter(Boolean))) {
            const total = totals.get(part) ?? { count: 0, minPrice };
            totals.set(part, { count: total.count + count, minPrice: Math.min(total.minPrice, minPrice) });
        }
    }
    return [...totals]
        .map(([name, { count, minPrice }]) => ({ name, slug: slugify(name), count, minPrice }))
        .filter((d) => d.slug)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

// The destination for a /stays/:slug page, or null.
const findDestination = async (slug) => (await listDestinations()).find((d) => d.slug === slug) ?? null;

module.exports = { slugify, listDestinations, findDestination };
