// Builds the <head> tags and body extras that the SEO router injects into the
// client's index.html. The client updates the same tags as users navigate
// (client/src/lib/seo.js), so keep the two in step.

const SITE_NAME = "AirBuenas";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

// JSON inside a <script> element: "<" is escaped so the data can't close the
// element ("</script>") or open a comment.
const scriptJson = (value) =>
    JSON.stringify(value).replace(/</g, "\\u003c");

// Whitespace collapsed and cut at a word boundary, for descriptions.
const truncate = (text, max) => {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
};

// Page metadata -> the tags between <!--seo:start--> and <!--seo:end-->.
// `canonical` is left out of noindex pages.
const renderHead = ({ title, description, canonical, image, imageAlt, type = "website", noindex = false, jsonLd }) => {
    const tags = [
        `<title>${escapeHtml(title)}</title>`,
        `<meta name="description" content="${escapeHtml(description)}" />`,
        `<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}" />`,
        !noindex && canonical && `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
        `<meta property="og:site_name" content="${SITE_NAME}" />`,
        `<meta property="og:locale" content="en_KE" />`,
        `<meta property="og:type" content="${escapeHtml(type)}" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        canonical && `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
        image && `<meta property="og:image" content="${escapeHtml(image)}" />`,
        image && imageAlt && `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />`,
        `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
        `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
        image && `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
        jsonLd && `<script type="application/ld+json" id="structured-data">${scriptJson(jsonLd)}</script>`,
    ];
    return tags.filter(Boolean).join("\n    ");
};

// Responsive image candidates, as the client builds them
// (client/src/lib/images.js): Unsplash photos resize on request.
const IMAGE_WIDTHS = [320, 480, 640, 800, 960, 1280, 1920];
const CARD_SIZES = "(min-width: 1536px) 16vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw";
const COVER_SIZES = "(min-width: 768px) 50vw, 100vw";
const srcSetFor = (src) => {
    let url;
    try {
        url = new URL(src);
    } catch {
        return undefined;
    }
    if (url.hostname !== "images.unsplash.com") return undefined;
    return IMAGE_WIDTHS.map((width) => {
        url.searchParams.set("w", String(width));
        return `${url} ${width}w`;
    }).join(", ");
};

// <link rel="preload"> for the page's largest image, so it downloads while
// the app's JavaScript loads. It must match the <img> the app renders
// (same src, srcset and sizes) or the browser downloads it twice.
const preloadTag = ({ src, sizes }) => {
    const srcset = srcSetFor(src);
    return srcset
        ? `<link rel="preload" as="image" imagesrcset="${escapeHtml(srcset)}" imagesizes="${escapeHtml(sizes)}" fetchpriority="high" />`
        : `<link rel="preload" as="image" href="${escapeHtml(src)}" fetchpriority="high" />`;
};

const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
const ROOT = '<div id="root"></div>';

// True for a built client index.html we know how to fill in.
const isShell = (html) => typeof html === "string" && SEO_BLOCK.test(html) && html.includes(ROOT);

// The shell with the page's head tags, plus an optional image preload
// ({ src, sizes }), fallback
// content for browsers without JavaScript, and data the app reads on startup
// (so it doesn't have to fetch what the server already loaded).
const renderPage = (shell, { head, preloadImage, noscript, initialData }) => {
    const headHtml = [
        head,
        preloadImage?.src && preloadTag(preloadImage),
    ].filter(Boolean).join("\n    ");
    const bodyHtml = [
        ROOT,
        noscript && `<noscript>${noscript}</noscript>`,
        initialData && `<script type="application/json" id="initial-data">${scriptJson(initialData)}</script>`,
    ].filter(Boolean).join("\n    ");
    // Replacer functions, so "$" in the content is never a substitution pattern.
    return shell
        .replace(SEO_BLOCK, () => `<!--seo:start-->\n    ${headHtml}\n    <!--seo:end-->`)
        .replace(ROOT, () => bodyHtml);
};

module.exports = { SITE_NAME, CARD_SIZES, COVER_SIZES, escapeHtml, scriptJson, truncate, srcSetFor, renderHead, renderPage, isShell };
