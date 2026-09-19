# Production readiness audit

**Scope:** `api/` (Express 5 + MongoDB) and `client/` (React 19 + Vite), plus the Vercel deployment. **Date:** September 2026.

## Summary

The app was not production-ready. Anyone could edit any listing, read anyone's bookings, forge login tokens (the signing secret was in the public repo), and fetch internal URLs through the server. Shared links to listings returned 404, and there were no tests, rate limits or logs.

Everything that can be fixed in code has been fixed and covered by tests (API 197 tests, client 141 tests, coverage above 95% on every metric, enforced in CI). Things that still need a person with account access are listed under [Action required](#action-required). A follow-up [SEO pass](#seo) (September 2026) made listing and destination pages indexable and shareable.

## Findings

Severity: **Critical** means it's exploitable now with serious impact; **High** means likely harm or broken core features; **Medium** means a real risk or defect; **Low** is hygiene.

### Security

| # | Severity | Finding | Resolution |
| - | -------- | ------- | ---------- |
| S1 | Critical | **The JWT signing secret was hard-coded** and committed to a public repo, so anyone could mint a token for any user. | Removed. `JWT_SECRET` (≥ 32 chars) is required in production; the API refuses to start without it. Tokens are pinned to HS256 and expire after 7 days. |
| S2 | Critical | **No server-side authorization.** Owner and user IDs came from URLs and bodies: anyone could edit any listing (`PUT /places/:placeId/:ownerId`), create listings or bookings as someone else, and read anyone's bookings anonymously (confirmed on the live site). | Every write and every private read requires a verified token, and the user ID comes from the token. Ownership is checked on edits (`403`). Bookings are visible only to their guest and host (`404` otherwise). New `/me/places` and `/me/bookings` routes. |
| S3 | Critical | **AWS access keys committed** to the public repo in 2023. AWS has quarantined the IAM user, which still allows uploads. | Code can't fix a leaked key; see *Action required*. |
| S4 | High | **Password hashes returned** by register and login. | `select: false` plus a `toJSON` transform; tests assert hashes never leave the server. |
| S5 | High | **SSRF / open proxy:** upload-by-link fetched any URL, on any method. | POST only. http(s) on ports 80/443; private, loopback, link-local and metadata IPs blocked at connect time (DNS-rebinding safe); every redirect re-checked; 10 MB cap; type sniffed from bytes, and SVG rejected. |
| S6 | High | **No rate limiting:** 30 rapid requests were all served on production. | `express-rate-limit`: a global limit per IP; failed logins and registrations per IP, against brute force; listings, bookings and uploads per user. JSON `429` with standard `RateLimit` headers. |
| S7 | High | **Booking price trusted from the client**, and no double-booking check. | The server computes nights × nightly price, validates dates (no past check-ins, ≤ 90 nights, capacity) and rejects overlapping bookings (`409`). |
| S8 | Medium | **CORS open to every origin**; `X-Powered-By: Express` exposed; no security headers. | CORS allowlist (`CORS_ORIGINS`); helmet on the API. Vercel serves CSP (no inline scripts), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`. |
| S9 | Medium | **Unused `token` cookie** set without `httpOnly` / `secure` / `sameSite`. | Removed with `cookie-parser`; auth is Bearer-only, so there's no CSRF surface. |
| S10 | Medium | **User enumeration:** login said "Not Found" for unknown emails. | Unknown email and wrong password get the same `401`. |
| S11 | Medium | **No input validation** (Booking schema typo `require:` meant nothing was enforced). | zod validation on every body and query; Mongoose schemas with required fields, limits, enums and time formats. Impossible dates such as Feb 31 are rejected (a bug found by the new tests). |
| S12 | Low | **No request body limit.** | 100 KB JSON limit (`413`). |

### Reliability and correctness

| # | Severity | Finding | Resolution |
| - | -------- | ------- | ---------- |
| R1 | High | **Deep links 404 on Vercel** (`/place/:id`, `/profile`, `/login`); shared listing links didn't work. | App fallback rewrite in `vercel.json`. |
| R2 | High | **Implicit globals** (`placeDoc =`, `bookingDocs =`) shared between concurrent requests. | Gone with the route rewrite. |
| R3 | Medium | **Errors returned as HTML pages or raw Mongo errors.** | Central handler: JSON `{ error, details?, requestId }`, with no stack traces or internals. |
| R4 | Medium | **Invalid IDs caused 422/500s.** | ObjectId validation; unknown IDs → `404`. |
| R5 | Medium | **No health check or graceful shutdown.** | `GET /api/health` (`503` when the DB is down); SIGTERM/SIGINT drain connections. |
| R6 | Medium | **Client: `toast()` called during render, effects with missing dependencies, no loading, error or empty states, raw React Router crash screen.** | Shared layout with one toaster; `useFetch` with derived loading and retry; error boundary page; 404 page; empty states. ESLint's React Hooks rules pass. |
| R7 | Medium | **Expired sessions never noticed** by the client. | Expired or malformed tokens discarded on load; an API `401` logs out with a message; login and logout sync across tabs. |
| R8 | Low | **Booking dates shown a day early** for users west of UTC. | Dates formatted by UTC calendar day. |
| R9 | Low | **Dead code:** legacy `uploads/` images, `App.css`, `react.svg`, commented routes. | Removed. |

### Operability

| # | Severity | Finding | Resolution |
| - | -------- | ------- | ---------- |
| O1 | High | **No logging** beyond `console.log`. | winston JSON logs. One line per request: method, path, status, duration, user and, for 4xx/5xx, the reason, with a request ID (echoed as `X-Request-Id`); 4xx at `warn`, 5xx at `error` with stack traces. Events for startup settings, database connections, sign-ups and logins (masked emails), failed and tampered sessions, listing and booking changes, blocked access, uploads and refused links, rate limits and CORS rejections. Credentials, tokens, secrets, phone numbers and request bodies are never logged. See the README's *Logs* section. |
| O2 | High | **No tests or CI.** | 338 tests, coverage gates at 95% on lines, statements, functions and branches. GitHub Actions runs lint, tests, build and `npm audit` on every push and PR. |
| O3 | Medium | **Configuration unvalidated;** secrets optional. | zod-validated config; production fails fast with a clear message. |
| O4 | Medium | **Vercel would create one function per `.js` file** under `api/` (Hobby plan limit: 12). The ESLint and Vitest configs (`.mjs`) were deployed as functions too. | Code moved to `_src/`, `_scripts/` and `_tests/`, which Vercel ignores; `.vercelignore` drops the configs. One function remains (checked with `vercel build`). |
| O5 | Low | **Non-reproducible builds** (`npm install`). | `npm ci` in the Vercel build and in CI. |

## Verification

**Automated tests:**

| Package | Tests | Statements | Branches | Functions | Lines |
| ------- | ----- | ---------- | -------- | --------- | ----- |
| API | 197 | 99.4% | 98.8% | 98.8% | 99.6% |
| Client | 141 | 99.4% | 97.0% | 99.0% | 99.8% |

**End to end:** a browser run against the API in production mode, with an in-memory MongoDB and an emulated S3, passed these checks:
- sign-up with automatic login;
- creating a listing with a direct-to-S3 photo upload;
- a server-priced booking, and double-booking rejected;
- the protected-route redirect;
- a tampered token forced to log out;
- the 6th failed login rate-limited;
- structured logs containing no secrets.

**Other checks:** ESLint is clean in both packages, and `npm audit` reports 0 vulnerabilities in both.

## Action required

1. ~~**Set `JWT_SECRET` in Vercel**~~ Done on 19 September 2026 (Production and Preview). The deploy before it went down with a `ConfigError` until the secret was set. If you ever rotate it, use 32+ random characters:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. **Rotate the AWS keys** (S3): delete every key ever committed, create a new one, and update `api/.env` and Vercel. Then detach `AWSCompromisedKeyQuarantineV2` and check CloudTrail. Until then, photo previews stay broken and the leaked key can still upload.
3. **Deploy the API and client together.** The API contract changed (auth headers, `/me/*` routes, booking body), so an old client won't work with the new API or vice versa.
4. Re-run `npm run s3:cors` if you serve the app from any other domain.

## SEO

**Before:** every URL returned the same HTML: the title "AirBuenas", one generic description, no canonical link, no share tags, no structured data, and 9 characters of visible text until the app loaded. `/robots.txt` and `/sitemap.xml` returned the app's HTML, and missing listings returned `200` (soft 404s). Lighthouse on the live site: SEO 92, with `robots.txt` invalid.

| # | Finding | Resolution |
| - | ------- | ---------- |
| SEO1 | Identical `<head>` on every page; link previews showed nothing about the listing. | The API renders listing (`/place/:id`) and destination (`/stays/:slug`) pages: unique title and description, canonical link, Open Graph and Twitter tags with a stable photo URL, and JSON-LD (`LodgingBusiness`, `BreadcrumbList`, `CollectionPage`/`ItemList`). The home page has static defaults, `WebSite`/`Organization` data and a 1200×630 share image. The app updates the head on navigation using the same formulas. |
| SEO2 | No `robots.txt` or sitemap. | Generated from the database: `sitemap.xml` (home, destinations, listings with image entries), and `robots.txt` pointing to it. |
| SEO3 | Soft 404s. | Unknown listings, destinations and paths return `404` with `noindex`; the app still shows its 404 screen. |
| SEO4 | No landing pages to rank for "vacation rentals in <place>". | `/stays/:slug` destination pages with an H1, stay count and prices, linked from the footer and listing breadcrumbs. The home page gets an H1 and an intro. |
| SEO5 | Search results, login and account pages were indexable. | `noindex` on search results, login, sign-up, account pages and errors; `/profile` disallowed in `robots.txt`. |
| SEO6 | Slow largest paint: full-size photos everywhere, two photos per card, and listing pages that fetched their data only after the JavaScript ran. | Responsive `srcset`s; only the first photo per card until someone engages; the main image preloaded and prioritized; listing data embedded in the HTML; home listings requested early (`public/home-prefetch.js`); the signed-in area code-split. |

**Result** (Lighthouse, mobile, same machine and data):

| Page | Performance | SEO | LCP | CLS | Page weight |
| ---- | ----------- | --- | --- | --- | ----------- |
| Home, before → after | 80 → 90 | 92 → 100 | 5.0 s → 3.4 s | 0 → 0 | 2.16 MB → 0.81 MB |
| Listing, before → after | 61 → 95 | 92 → 100 | 4.5 s → 2.7 s | 0.56 → 0 | 694 KB → 443 KB |

**What code can't do** (see the README's *SEO → After deploying*): verify the site in Google Search Console and submit the sitemap; use a custom domain, and redirect `kibe-mernbnb.vercel.app` to it; earn links from Kenyan travel sites, blogs and directories; create a Google Business Profile if there's a physical office; and add real reviews and more listings with unique, detailed descriptions. Ranking depends mostly on those, and no site can be guaranteed the first position.

## Remaining risks and recommendations

In rough priority order:

1. **Rate limits are per instance.** The in-memory store stops a single abusive client on one instance, but serverless scale-out multiplies the limits. For real DDoS protection, enable Vercel's firewall or attack mode and move `express-rate-limit` to a shared store (for example Redis or Upstash); it's a one-line store option.
2. **Tokens live in `localStorage`,** so an XSS bug could steal them. The CSP forbids inline and third-party scripts, which reduces this. The stronger fix is `httpOnly` `SameSite` cookies with CSRF protection.
3. **Two simultaneous bookings for the same dates** can both pass the overlap check (a race). Use a MongoDB transaction, or a per-place lock, if volume grows.
4. **Orphaned S3 objects:** photos uploaded but never saved, or later removed, stay in the bucket. Add an S3 lifecycle rule and delete removed keys on update.
5. **Missing account features:** email verification, password reset, account deletion and listing deletion.
6. **Monitoring:** logs go to Vercel's log viewer. Add log drains, error tracking (Sentry or similar) and an uptime check on `/api/health`.
7. **Backups:** confirm MongoDB Atlas backups are enabled.
8. **CSP allows `'unsafe-inline'` styles,** needed by the toast library and inline style attributes. That's low risk, but could be tightened.
9. **Pagination uses `skip`,** which slows at very high page numbers. Consider cursor pagination if listings grow into the tens of thousands.
10. **E2E tests aren't in CI yet.** The browser flow above was run manually; consider Playwright in CI.
11. **Listing photos on S3 can't be indexed while the AWS key is quarantined** (see *Action required*): `/api/photos/*` redirects to signed URLs that S3 currently refuses. The demo listings (Unsplash) are unaffected.
12. **Reviews and ratings** would unlock star ratings in search results (`AggregateRating`), which usually lift click-through; the app has no reviews yet.
