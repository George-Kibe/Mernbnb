# AirBuenas (Mernbnb)

A full-stack vacation-rental marketplace inspired by Airbnb, built on the MERN stack. Hosts list places with photos, perks, and nightly prices. Guests search, pick dates, and book stays across Kenya.

[![CI](https://github.com/George-Kibe/Mernbnb/actions/workflows/ci.yml/badge.svg)](https://github.com/George-Kibe/Mernbnb/actions/workflows/ci.yml)

## Features

- **Accounts:** register and log in with email and password (bcrypt hashes, JWTs that expire after 7 days), with automatic logout when a session expires
- **Browsing:** listings on the home page, 12 per page, with Airbnb-style numbered pagination (`?page=2`) and swipeable photo carousels
- **Airbnb-style navbar:**
  - **Search:** destination suggestions, a two-month date-range calendar, and guest counters. Results are filtered by location, capacity, pets and availability for your dates. On phones it's a full-screen "Where to?" sheet.
  - **Account menu:** Trips, Manage listings, Create a new listing, Account, Log out.
- **Listing page:** Airbnb-style photo grid, "Show all photos" tour and full-screen viewer, plus a reservation card with a live price breakdown. The server computes the real price and rejects double bookings.
- **Hosting:** create and edit listings; drag and drop photos or add them from a link, reorder them and pick a cover photo. Photos go straight from the browser to S3 through presigned URLs.
- **Themes:** light, dark and system themes, and corporate-blue branding
- **Security:** production-grade API with authentication and ownership checks, input validation, rate limiting, security headers and structured logging

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19.3, Vite 8, React Router 8, Tailwind CSS 4, axios, date-fns 4, react-hot-toast |
| Backend  | Node.js, Express 5.2, Mongoose 9, zod, jsonwebtoken, bcryptjs, helmet, express-rate-limit, pino, AWS SDK v3 |
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
│   │   ├── logger.js         pino JSON logs + per-request logs with request IDs
│   │   ├── db.js             Cached MongoDB connection, 503 when unavailable
│   │   ├── middleware/       auth (JWT), validate (zod), rateLimit, errors
│   │   ├── routes/           users, places, bookings (+ /me), uploads
│   │   ├── models/           User, Place, Booking
│   │   └── lib/              s3 (presigning, photo URLs), fetchImage (SSRF-safe download)
│   ├── _scripts/             seed.js, configure-s3-cors.js
│   └── _tests/               API tests (Vitest + supertest + in-memory MongoDB)
├── client/                   React SPA (ES modules, Vite)
│   ├── public/               Favicons, theme-init.js (applies the theme before paint)
│   └── src/
│       ├── App.jsx           Route table (Layout, RequireAuth, error page)
│       ├── UserContext.jsx   Session from the JWT; expiry and cross-tab sync
│       ├── lib/              api client, useFetch, search, photos, theme, format
│       ├── components/       Header, Footer, search/, photos/, Pagination, …
│       ├── pages/            Home, Place, Login/Register, profile pages, listing editor
│       └── test/             Test setup (MSW), helpers
├── .github/workflows/ci.yml  Lint, test with coverage gates, build, audit
└── vercel.json               Build, /api routing, app fallback, security headers
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
| `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY` | AWS keys for photo storage |
| `S3_BUCKET`, `S3_REGION` | Default `mernbnb-images-bucket`, `eu-west-1` |
| `CORS_ORIGINS` | Extra origins allowed to call the API cross-origin (comma-separated). Not needed when the client calls `/api` on its own domain. |
| `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, … | Rate limits; see `.env.example` |
| `LOG_LEVEL` | `info` in production, `debug` in development |

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
| GET | `/users/me` 🔒 | `{ user }` |
| GET | `/places` | `?page&limit&location&guests&pets&checkin&checkout` → `{ places, page, limit, total, totalPages }`, newest first |
| GET | `/places/destinations` | Search suggestions `[{ name, count }]` |
| GET | `/places/:id` | One place |
| POST | `/places` 🔒 | Create a listing owned by you |
| PUT | `/places/:id` 🔒 | Update your listing (`403` if it isn't yours) |
| POST | `/bookings` 🔒 | `{ placeId, checkIn, checkOut, guests, name, phoneNumber }` (dates `YYYY-MM-DD`). The server prices it (nights × nightly price) and rejects overlapping dates. |
| GET | `/bookings/:id` 🔒 | A booking, visible to its guest and its host |
| GET | `/me/places` 🔒 | Your listings |
| GET | `/me/bookings` 🔒 | Your trips |
| POST | `/uploads/presign` 🔒 | `{ files: [{ type, size }] }` → presigned S3 PUT URLs (JPEG/PNG/WebP/AVIF/GIF, ≤ 10 MB, ≤ 20 per request) |
| POST | `/uploads/by-link` 🔒 | `{ link }`: the server downloads the image (private addresses blocked) → `{ key, url }` |

**Rate limits** (defaults, configurable):
- 300 requests per 15 minutes per IP;
- 10 failed logins or registrations per 15 minutes per IP;
- 30 new listings or bookings per hour per user;
- 60 upload requests per hour per user.

**Photos** are returned as signed S3 URLs. Send them back unchanged when updating a listing; the server stores the S3 keys.

## Deployment (Vercel)

`vercel.json` builds the client (`npm ci && npm run build`), routes `/api/*` to `api/index.js`, serves the app for every other path (so shared links like `/place/…` work), and adds security headers (CSP, `nosniff`, no framing, referrer policy) plus long-lived caching for hashed assets.

In the Vercel project settings, set:

- **`JWT_SECRET`** (32+ random characters) and **`MONGO_URL`**. The API won't start without them in production.
- `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET` / `S3_REGION` if they aren't the defaults.
- Node.js version **24.x**.
- Leave `VITE_API_BASE_URL` unset; the client calls `/api` on whichever domain serves it.

Also run `npm run s3:cors` with your production domain included.

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

### "Too many requests" / "Too many attempts"

Rate limits reset after the window, which is 15 minutes by default. They're per server instance; see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for scaling them across instances.

### Everyone was logged out after a deploy

`JWT_SECRET` changed, which invalidates all existing tokens. That's expected after rotating the secret.

## Production readiness

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the audit: what was found, what was fixed, and what still needs action.

## License

ISC
