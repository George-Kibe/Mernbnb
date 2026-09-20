# AirBuenas (Mernbnb)

A full-stack vacation-rental marketplace inspired by Airbnb, built on the MERN stack. Hosts list places with photos, perks, and nightly prices. Guests search, pick dates, and book stays across Kenya.

[![CI](https://github.com/George-Kibe/Mernbnb/actions/workflows/ci.yml/badge.svg)](https://github.com/George-Kibe/Mernbnb/actions/workflows/ci.yml)

## Features

- **Accounts:** register and log in with email and password (bcrypt hashes, JWTs that expire after 7 days), with automatic logout when a session expires
- **Forgotten passwords:** a 6-digit code by email, then a new password and you're logged in. Codes are stored hashed, expire in 10 minutes, allow 5 guesses, and are limited to one a minute and 5 an hour per account
- **Browsing:** listings on the home page, 12 per page, with Airbnb-style numbered pagination (`?page=2`) and swipeable photo carousels
- **Airbnb-style navbar:**
  - **Search:** destination suggestions, a two-month date-range calendar, and guest counters. Results are filtered by location, capacity, pets and availability for your dates. On phones it's a full-screen "Where to?" sheet.
  - **Account menu:** Trips, Manage listings, Create a new listing, Account, Log out.
- **Listing page:** Airbnb-style photo grid, "Show all photos" tour and full-screen viewer, plus a reservation card with a live price breakdown. The server computes the real price and rejects double bookings.
- **Hosting:** create, edit and delete listings (a listing with upcoming bookings is kept until the stay is over, and its photos are removed from the bucket with it); drag and drop photos or add them from a link, reorder them and pick a cover photo. Photos go straight from the browser to S3 through presigned URLs.
- **Destination pages:** `/stays/diani-beach`, `/stays/nairobi`, … list the stays in each town or county, linked from the footer and from listing breadcrumbs
- **Themes:** light, dark and system themes, and corporate-blue branding
- **SEO:** each listing and destination page has its own server-rendered title, description, canonical link, share preview and schema.org structured data. The API generates `sitemap.xml` and `robots.txt`, and unknown pages return a real 404. See [SEO](#seo).
- **Security:** production-grade API with authentication and ownership checks, input validation, rate limiting, security headers and structured logging

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19.3, Vite 8, React Router 8, Tailwind CSS 4, axios, date-fns 4, react-hot-toast |
| Backend  | Node.js, Express 5.2, Mongoose 9, zod, jsonwebtoken, bcryptjs, helmet, express-rate-limit, winston, AWS SDK v3 |
| Storage  | MongoDB (e.g. Atlas) for data, AWS S3 for photos |
| Testing  | Vitest, Testing Library, MSW, supertest, mongodb-memory-server, aws-sdk-client-mock (95% coverage enforced) |
| Hosting  | Vercel (static client and the API as one serverless function); CI on GitHub Actions |

## Project structure

```
.
├── api/                      Express API (CommonJS)
│   ├── index.js              Entry: builds the app; the Vercel function, or a server via `npm start`
│   ├── _src/                 App code (underscore folders are not deployed as separate functions)
│   │   ├── app.js            Middleware order and routers
│   │   ├── config.js         Validated environment (fails fast in production)
│   │   ├── logger.js         winston: JSON logs, request lines with request IDs, redaction
│   │   ├── db.js             Cached MongoDB connection, 503 when unavailable
│   │   ├── middleware/       auth (JWT), validate (zod), rateLimit, errors
│   │   ├── routes/           users, places, bookings (+ /me), uploads, photos
│   │   ├── seo/              Server-rendered <head> for listing/destination pages, sitemap, robots.txt
│   │   ├── models/           User, Place, Booking
│   │   └── lib/              s3 (presigning, photo URLs), fetchImage (SSRF-safe download), destinations
│   ├── _scripts/             seed.js, configure-s3-cors.js
│   └── _tests/               API tests (Vitest + supertest + in-memory MongoDB)
├── client/                   React SPA (ES modules, Vite)
│   ├── public/               Icons, share image, manifest, theme-init.js (theme before paint),
│   │                         home-prefetch.js (starts loading the home page's listings early)
│   └── src/
│       ├── App.jsx           Route table (Layout, RequireAuth, error page)
│       ├── UserContext.jsx   Session from the JWT; expiry and cross-tab sync
│       ├── lib/              api client, useFetch, search, photos, theme, format, seo, images
│       ├── components/       Header, Footer, search/, photos/, Pagination, …
│       ├── pages/            Home, Stays (destinations), Place, Login/Register, profile pages, listing editor
│       └── test/             Test setup (MSW), helpers
├── .github/workflows/ci.yml  Lint, test with coverage gates, build, audit
├── vercel.json               Build, routing (static app, /api, server-rendered pages), security headers
└── .vercelignore             Keeps tooling configs under api/ from becoming functions
```

## Getting started

### Prerequisites

- **Node.js 22.22 or newer.** React Router 8 requires it; the API alone runs on 20.19+.
- A MongoDB connection string (local `mongod` or MongoDB Atlas)
- For photo uploads: an S3 bucket and an IAM user allowed `s3:PutObject` and `s3:GetObject` on it (plus `s3:PutBucketCors` for the one-time CORS setup)

### 1. Configure the API

```bash
cp api/.env.example api/.env
```

`api/.env.example` documents every setting. The important ones:

| Variable | Description |
| -------- | ----------- |
| `MONGO_URL` | MongoDB connection string. **Required in production.** |
| `JWT_SECRET` | At least 32 random characters. **Required in production** (the API refuses to start without it). Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Email for password reset codes; any SMTP provider. Without `SMTP_HOST`, development prints emails to the log and production turns password reset off. |
| `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY` | AWS keys for photo storage |
| `S3_BUCKET`, `S3_REGION` | Default `mernbnb-images-bucket`, `eu-west-1` |
| `CORS_ORIGINS` | Extra origins allowed to call the API cross-origin (comma-separated). Not needed when the client calls `/api` on its own domain. |
| `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, … | Rate limits; see `.env.example` |
| `RATE_LIMIT_STORE` | `mongo` in production (limits shared by every instance), `memory` in development |
| `LOG_LEVEL` | `info` in production, `debug` in development (`error`, `warn`, `info`, `http`, `verbose`, `debug`, `silent`) |

Browsers upload photos directly to S3, so the bucket needs a CORS rule. Run this once per bucket:

```bash
cd api
npm run s3:cors                                     # localhost:5173 + the Vercel domains
CORS_ORIGINS="https://your.domain" npm run s3:cors  # or your own list
```

The client needs no configuration. It calls `/api` on its own origin, and Vite proxies that to `localhost:5000` in development.

### 2. Install and run

```bash
# Terminal 1: API on http://localhost:5000
cd api && npm install && npm run dev      # nodemon; `npm start` runs plain node

# Terminal 2: client on http://localhost:5173
cd client && npm install && npm run dev
```

### 3. Add demo listings (optional)

```bash
cd api
npm run seed            # 22 demo listings across Kenya, with Unsplash photos
npm run seed -- --clear # remove them (and bookings made on them)
```

They belong to the demo host `demo-host@airbuenas.test`; the first run prints its password once. The seed writes to the database in `api/.env`.

### Quality checks

Run these in each of `api/` and `client/`:

```bash
npm run lint       # ESLint
npm test           # tests
npm run coverage   # tests + coverage report; fails below 95%
npm run build      # client only: production build to client/dist
```

API tests use an in-memory MongoDB and a mocked S3 and never read `api/.env`. Client tests mock the API with MSW. Nothing touches real services.

## API reference

All routes are under `/api`. Bodies are JSON. 🔒 means the route needs `Authorization: Bearer <token>` from login.

**Errors** are always `{ error, details?, requestId }`. `details` lists field problems for `400`s, and `requestId` matches the `X-Request-Id` response header and the server logs.

**Status codes:**

| Code | Meaning |
| ---- | ------- |
| `400` | Invalid input |
| `401` | Not logged in, or the session expired |
| `403` | Not your resource |
| `404` | Not found |
| `409` | Conflict (duplicate email, dates already booked) |
| `413` | Request body too large |
| `422` | The image link couldn't be used |
| `429` | Rate limited (see the `RateLimit` headers) |
| `503` | Database or storage unavailable |

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/health` | `{ status, database, uptime }`; `503` when the database is down |
| POST | `/users/register` | `{ name, email, password (≥ 8) }` → `201 { user }` |
| POST | `/users/login` | `{ email, password }` → `{ user, token }` |
| POST | `/users/password/forgot` | `{ email }` → `202 { message, resendAfterSeconds }`, and a 6-digit code by email. The answer is the same whether or not the account exists. |
| POST | `/users/password/verify` | `{ email, code }` → `{ resetToken }` (valid 15 minutes, once). 5 guesses per code. |
| POST | `/users/password/reset` | `{ resetToken, password }` → `{ user, token }`: the password is changed and you're logged in |
| GET | `/users/me` 🔒 | `{ user }` |
| GET | `/places` | `?page&limit&location&guests&pets&checkin&checkout` → `{ places, page, limit, total, totalPages }`, newest first |
| GET | `/places/destinations` | Destinations `[{ name, slug, count, minPrice }]`, for search suggestions and `/stays/:slug` pages |
| GET | `/places/:id` | One place |
| POST | `/places` 🔒 | Create a listing owned by you |
| PUT | `/places/:id` 🔒 | Update your listing (`403` if it isn't yours). Photos you dropped are deleted from the bucket. |
| DELETE | `/places/:id` 🔒 | Delete your listing and its photos → `204`. `409` while it has current or upcoming bookings. |
| POST | `/bookings` 🔒 | `{ placeId, checkIn, checkOut, guests, name, phoneNumber }` (dates `YYYY-MM-DD`). The server prices it (nights × nightly price) and rejects overlapping dates. |
| GET | `/bookings/:id` 🔒 | A booking, visible to its guest and its host |
| GET | `/me/places` 🔒 | Your listings |
| GET | `/me/bookings` 🔒 | Your trips |
| POST | `/uploads/presign` 🔒 | `{ files: [{ type, size }] }` → presigned S3 PUT URLs (JPEG/PNG/WebP/AVIF/GIF, ≤ 10 MB, ≤ 20 per request) |
| POST | `/uploads/by-link` 🔒 | `{ link }`: the server downloads the image (private addresses blocked) → `{ key, url }` |
| GET | `/photos/<key>` | `302` to a fresh signed URL for a listing photo: a stable, public address for search engines and share previews |

The API also serves these pages, outside `/api` (see [SEO](#seo)):

| Path | Purpose |
| ---- | ------- |
| `/place/:id` | The app, with the listing's title, description, canonical link, share image, structured data and data already filled in. `404` for unknown listings. |
| `/stays/:slug` | The same for a destination page (`?page=2`, …). `301` to the lowercase slug; `404` for unknown destinations. |
| `/sitemap.xml` | The home page, every destination and every listing (with photos) |
| `/robots.txt` | Crawl rules and the sitemap's address |
| any other unknown path | The app's "page not found" screen with a real `404` status |

**Rate limits** (defaults, configurable). In production the counts live in MongoDB, so every serverless instance shares them; if the database is unreachable, requests are allowed rather than failed:
- 300 requests per 15 minutes per IP;
- 10 failed logins or registrations per 15 minutes per IP;
- 30 new listings or bookings per hour per user;
- 60 upload requests per hour per user;
- 10 password reset requests per 15 minutes per IP;
- 600 server-rendered pages (and sitemap, `robots.txt`, photo links) per 15 minutes per IP.

**Photos** are returned as signed S3 URLs. Send them back unchanged when updating a listing; the server stores the S3 keys.

## Deployment (Vercel)

`vercel.json` builds the client (`npm ci && npm run build`) and routes requests:
- static files (the home page, `/assets/*`, icons) are served directly;
- `/login`, `/register` and `/profile/*` get the app's `index.html`;
- `/api/*` and everything else go to the API function (`api/index.js`), which server-renders listing and destination pages, generates the sitemap and `robots.txt`, and returns `404`s. It bundles `client/dist/index.html` as its page template (`includeFiles`).

It also adds security headers (CSP, `nosniff`, no framing, referrer policy) and long-lived caching for hashed assets. Server-rendered pages are cached by Vercel's CDN for 5 minutes (`s-maxage`).

In the Vercel project settings, set:

- **`JWT_SECRET`** (32+ random characters) and **`MONGO_URL`**. The API won't start without them in production.
- `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET` / `S3_REGION` if they aren't the defaults.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`, or password reset by email stays off (the endpoint answers `503`).
- Node.js version **24.x**.
- Leave `VITE_API_BASE_URL` unset; the client calls `/api` on whichever domain serves it.
- On a custom domain, set **`SITE_URL`** (API) and **`VITE_SITE_URL`** (client build) to it, e.g. `https://airbuenas.co.ke`. Both default to `https://mernbnb.vercel.app`; canonical links, the sitemap and share previews use them.

Also run `npm run s3:cors` with your production domain included.

## SEO

Search engines and link previews (WhatsApp, Facebook, X, Slack) get real content without running JavaScript:

- **Server-rendered `<head>`:** `/place/:id` and `/stays/:slug` go through the API (`api/_src/seo`), which fills in the marked block in `client/index.html` (`<!--seo:start-->` … `<!--seo:end-->`). Each page gets its own title, meta description, canonical link, Open Graph and Twitter tags, and JSON-LD: `LodgingBusiness` plus `BreadcrumbList` for listings, `CollectionPage` with an `ItemList` for destinations. The page's data goes along too, so the app renders without a second request.
- **In the app:** `src/lib/seo.js` keeps the head in step as people navigate, using the same formulas as the API. Search results, account pages and errors are `noindex`; pages 2+ have their own canonical link.
- **Crawling:** `sitemap.xml` lists the home page, every destination and every listing with its photos. `robots.txt` keeps crawlers out of `/profile` and the private API but leaves `/api/places` open, because pages need it to render. Unknown pages return a real `404` instead of a "soft 404".
- **Speed (Core Web Vitals):** photos come in responsive sizes (`srcset`), the main image loads first (`fetchpriority`, and a server-side preload on listing pages), card photos after the first load only when someone swipes or hovers, the home page's listings start loading before the app's JavaScript, and the signed-in area loads on demand.
- **Share image:** `client/public/og-image.png` (1200×630) for pages without their own photo.

### After deploying

1. **Google Search Console:** add the site (a domain property if you have a custom domain), verify it, submit `https://<your domain>/sitemap.xml`, and use URL Inspection on a listing to check that Google sees the rendered page.
2. **Bing Webmaster Tools:** import the site from Search Console.
3. **Check** a listing in the [Rich Results Test](https://search.google.com/test/rich-results) and a share preview in the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/).
4. **One address per page:** `kibe-mernbnb.vercel.app` serves the same site. The canonical links point to `SITE_URL`, but for a clean signal redirect the other domains to it (Vercel → Project → Settings → Domains → Redirect).

## Logs

The API logs with [winston](https://github.com/winstonjs/winston): one JSON object per line in production (Vercel → Project → Logs, or `vercel logs <deployment>`), and readable, coloured lines in development.

**Every request** gets one line, e.g. `POST /api/users/login 401 in 74.3 ms`, with the method, URL, status, duration, IP, user agent, the user's ID when logged in, and for `4xx`/`5xx` the reason (`"error": "Incorrect email or password."`). Each line carries a `requestId`, which is also in the `X-Request-Id` response header and in every error response. Search the logs for it to see everything that happened in that request. Health checks aren't logged.

**Events**, tagged with the same `requestId`:

| Area | Logged |
| ---- | ------ |
| Startup | `API starting` with the settings in effect (never secrets), once per start or Vercel cold start |
| Database | Connecting, connected (with the time it took), connection failed, disconnected, reconnected |
| Accounts | Account created, logged in (user ID); login failed (masked email such as `a***@example.com`, and whether the account exists); registration refused |
| Sessions | Session expired (info); invalid or tampered token (warn); session ended by a password change; token for a deleted account |
| Password reset | Code sent, refused (unknown email, too soon, hourly limit reached), wrong code with attempts left, code accepted, password changed; email failures. Codes are never logged. |
| Listings | Created; updated, with the fields that changed; deleted; photos deleted from the bucket; blocked edits or deletes of someone else's listing |
| Bookings | Created (dates, nights, guests, total); refused because the dates are taken; withdrawn when two guests booked the same dates at once; blocked access to someone else's booking |
| Photos | Upload URLs issued (count, bytes); photo added from a link (host); refused links, including private addresses (possible SSRF attempts); missing S3 credentials, with the fix |
| Abuse | Rate limit reached (which limit, IP or user); a cross-origin request from a site not in `CORS_ORIGINS`; the rate limit store being unreachable |
| Search | Searches that found nothing (at `info`: demand you can't serve yet); all searches at `debug` |
| Pages | Where the page template came from; page, template and sitemap failures |
| Errors | Every `5xx` with its stack trace; unhandled rejections and exceptions |

Never logged: passwords, tokens, cookies, `Authorization` headers, secrets or keys (redacted at any depth, by field name), full email addresses, phone numbers, or request bodies.

**Useful searches:** `"level":"error"`; `Login failed` repeated for one masked email (credential stuffing); `Rate limit reached` for one IP; `Image link refused`; `Search found no stays` (where to recruit hosts).

## Troubleshooting

### Photos upload but show as broken or "Not visible to guests"

S3 accepts uploads but refuses to serve them. Open a photo URL and read the XML error:

- **`AccessDenied … explicit deny … AWSCompromisedKeyQuarantineV2`**: AWS found your access key in public (for example, committed to a public repo) and quarantined the IAM user. Treat the key as stolen:
  1. IAM → Users → the S3 user → **Security credentials**: deactivate and **delete** every key that was ever exposed, then create a new one.
  2. Put the new key in `api/.env` and in Vercel, then redeploy.
  3. Check CloudTrail and the bucket for activity you don't recognise.
  4. Detach the `AWSCompromisedKeyQuarantineV2` policy from the user.
  5. Make sure the user's policy allows `s3:PutObject` **and** `s3:GetObject` on `arn:aws:s3:::<bucket>/*`.
- **`AccessDenied` without that policy**: the IAM user lacks `s3:GetObject`.
- **`PermanentRedirect`**: `S3_REGION` doesn't match the bucket's region.

If uploads fail with *"Photo uploads aren't set up on this server yet"*, the API has no S3 credentials.

### Password reset emails don't arrive

- **"Password reset by email isn't available right now"**: the API has no `SMTP_HOST`. Set the `SMTP_*` variables and `MAIL_FROM`, then redeploy.
- **Nothing arrives, no error**: look for `Could not send the password reset email` in the logs, which carries the provider's message. Common causes are a wrong password (for Gmail, use an app password, not the account password), port 465 without `SMTP_SECURE=true`, or a `MAIL_FROM` address the provider hasn't verified.
- **In development without SMTP**, the email (code included) is printed to the API log instead of being sent.

### "Too many requests" / "Too many attempts"

Rate limits reset after the window, which is 15 minutes by default. They're per server instance; see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for scaling them across instances.

### "Your password was changed. Please log in again."

Sessions opened before a password reset are refused on purpose, so a stolen token doesn't survive the reset. Log in again with the new password.

### Everyone was logged out after a deploy

`JWT_SECRET` changed, which invalidates all existing tokens. That's expected after rotating the secret.

## Production readiness

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the audit: what was found, what was fixed, and what still needs action.

## License

ISC
