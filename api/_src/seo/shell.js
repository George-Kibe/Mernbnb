const fs = require("fs");
const path = require("path");
const { isShell } = require("./html");

// Where the built client's index.html can be: the repository layout (local
// `npm start`, or Vercel when vercel.json's includeFiles bundles it).
const SHELL_FILES = [
    path.join(process.cwd(), "client", "dist", "index.html"),
    path.join(__dirname, "..", "..", "..", "client", "dist", "index.html"),
];
const FETCH_TIMEOUT_MS = 3000;

// Loads the client's index.html, the template for server-rendered pages.
// It is read from disk when bundled with the function; otherwise it is
// fetched from the site itself (`origin`), where the CDN serves it, and kept
// for `ttlMs`. Rejects when neither works.
const createShellLoader = ({ files = SHELL_FILES, fetch = globalThis.fetch, logger, ttlMs = 5 * 60 * 1000, now = Date.now } = {}) => {
    let fromDisk;
    const fetched = new Map(); // origin -> { html, at }

    const readDisk = () => {
        for (const file of files) {
            try {
                const html = fs.readFileSync(file, "utf8");
                if (isShell(html)) {
                    logger?.info("Page template loaded from disk", { file });
                    return html;
                }
            } catch {
                // Try the next location.
            }
        }
        return null;
    };

    return async (origin) => {
        if (fromDisk === undefined) fromDisk = readDisk(); // looked for once
        if (fromDisk) return fromDisk;

        const cached = fetched.get(origin);
        if (cached && now() - cached.at < ttlMs) return cached.html;

        const res = await fetch(`${origin}/index.html`, {
            headers: { accept: "text/html" },
            redirect: "error",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Fetching the page shell failed with HTTP ${res.status}`);
        const html = await res.text();
        if (!isShell(html)) throw new Error("The page shell is missing its SEO markers");
        logger?.info("Page template fetched from the site", { origin });
        fetched.set(origin, { html, at: now() });
        return html;
    };
};

module.exports = { createShellLoader, SHELL_FILES };
