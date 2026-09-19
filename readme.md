# AirBuenas (Mernbnb)

A full-stack vacation-rental marketplace inspired by Airbnb, built on the MERN stack. Hosts list places with photos, perks, and nightly prices. Guests browse listings, pick dates, and book stays.

> **Status:** learning project that is being brought up to production quality. See [Roadmap](#roadmap) for known gaps. Most importantly, the API does not yet verify who is making a request.

## Features

- Register and log in with email and password (bcrypt-hashed, JWT issued on login)
- Browse listings on the home page, 12 per page, with Airbnb-style numbered pagination (`?page=2` in the URL)
- Airbnb-style navbar:
  - **Search:** destination suggestions, a two-month date-range calendar, and guest counters (adults, children, infants, pets). Results are filtered by location, capacity, pets, and availability for your dates. The listing page opens with your dates and guests filled in. On phones it's a full-screen "Where to?" sheet.
  - **Account menu:** Trips, Manage listings, Create a new listing, Account, Log out; Sign up / Log in when logged out. Plus an "AirBuenas your home" shortcut.
- Light, dark and system themes, remembered per browser, with no flash of the wrong theme on load. Corporate-blue branding throughout.
- Airbnb-style footer: destination inspiration links, support and hosting links, and the theme switcher
- Listing page with an Airbnb-style photo grid, a "Show all photos" tour and a full-screen viewer, plus description, check-in/out times, and a Google Maps link
- Home page listing cards with swipeable photo carousels
- Book a stay: choose dates and guest count, see the live price (nights × guests × nightly price)
- Profile area:
  - **My Bookings**: list and detail view of your reservations
  - **My Accommodations**: create and edit your listings. Drag and drop photos or add them from a link, reorder them, pick a cover photo, and choose perks.
- Photos go straight from the browser to AWS S3 through presigned URLs. The bucket can stay private because the API hands out signed view URLs.

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19.3, Vite 8, React Router 8, Tailwind CSS 4, axios, date-fns 4, react-hot-toast |
| Backend  | Node.js, Express 5.2, Mongoose 9 (MongoDB), jsonwebtoken, bcryptjs 3, AWS SDK v3 (S3 + presigner) |
| Storage  | MongoDB (e.g. Atlas) for data, AWS S3 for images |
| Hosting  | Vercel (static client build and the API as a function) |

## Project structure

```
.
├── api/                  Express API (CommonJS)
│   ├── index.js          App setup and every route
│   ├── lib/              auth (JWT check), s3 (presigning, photo URLs), fetchImage (safe download)
│   ├── scripts/          configure-s3-cors.js (npm run s3:cors)
│   ├── models/           Mongoose models: User, Place, Booking
│   ├── uploads/          Legacy local uploads (no longer written to)
│   └── .env.example
├── client/               React SPA (ES modules, Vite)
│   ├── src/
│   │   ├── App.jsx       Router definition
│   │   ├── UserContext.jsx  Auth state (decoded JWT from localStorage)
│   │   ├── components/   Header, Footer, Perks, ImageComponent, photos/ (uploader, grid, tour, lightbox, carousel)
│   │   ├── lib/photos.js Presigned uploads to S3
│   │   └── pages/        Index, Login, Register, Place, Profile, Places, Bookings, ...
│   ├── index.html
│   ├── vite.config.js    React and Tailwind Vite plugins
│   └── .env.example
└── vercel.json           Build and /api rewrite config
```

## Getting started

### Prerequisites

- **Node.js 22.22 or newer.** React Router 8 requires it; the API alone runs on 20.19+.
- A MongoDB connection string (local `mongod` or MongoDB Atlas)
- An AWS S3 bucket and an IAM user whose keys allow `s3:PutObject` and `s3:GetObject` on it (plus `s3:PutBucketCors` for the one-time CORS setup)

### 1. Configure environment variables

```bash
cp api/.env.example api/.env
```

`api/.env`

| Variable               | Description |
| ---------------------- | ----------- |
| `MONGO_URL`            | MongoDB connection string. **Required.** Without a reachable database, DB-backed routes return `503`. |
| `S3_ACCESS_KEY`        | AWS access key ID |
| `S3_SECRET_ACCESS_KEY` | Matching AWS secret |
| `S3_BUCKET`            | Bucket name. Default `mernbnb-images-bucket` |
| `S3_REGION`            | Bucket region. Default `eu-west-1` |
| `S3_ENDPOINT`          | Optional, for S3-compatible servers (MinIO, local emulators). Leave unset for AWS. |
| `JWT_SECRET`           | Secret for signing login tokens. Falls back to a built-in value for now; set it in production. |

Browsers upload photos directly to S3, so the bucket needs a CORS rule that allows `PUT` from the app's origins. Run this once per bucket:

```bash
cd api
npm run s3:cors                                   # localhost:5173 + the Vercel domains
CORS_ORIGINS="https://your.domain" npm run s3:cors  # or your own list
```

`client/.env` (optional)

| Variable            | Description |
| ------------------- | ----------- |
| `VITE_API_BASE_URL` | **Optional.** Defaults to `/api` on the same origin. In development, Vite proxies `/api` to `http://localhost:5000`. Set it only to use an API on another host. |

`.env` files are git-ignored. Never commit real credentials.

### 2. Install and run

In two terminals:

```bash
# Terminal 1: API on http://localhost:5000
cd api
npm install
npm start          # runs nodemon, restarts on changes

# Terminal 2: client on http://localhost:5173
cd client
npm install
npm run dev        # /api is proxied to the API on port 5000
```

### 3. Add demo listings (optional)

```bash
cd api
npm run seed            # 22 demo listings across Kenya, with Unsplash photos
npm run seed -- --clear # remove them (and any bookings made on them)
```

The listings belong to a demo host, `demo-host@airbuenas.test`. The first run creates that account and prints its password once. Running the seed again replaces only the demo listings, and it uses the database in `api/.env`.

Other client scripts:

```bash
npm run build      # production build to client/dist
npm run preview    # serve the production build locally
```

## API reference

All routes are prefixed with `/api`. Request and response bodies are JSON unless noted. 🔒 = requires `Authorization: Bearer <token>` from login.

Place photos are returned as signed S3 URLs, valid for at least an hour. Send them back unchanged when updating a place; the server stores the underlying S3 keys.

| Method | Path                           | Purpose |
| ------ | ------------------------------ | ------- |
| POST   | `/users/register`              | Create an account `{ name, email, password }` |
| POST   | `/users/login`                 | Log in `{ email, password }` → `{ userDoc, token }` |
| GET    | `/users/profile`               | Echoes request cookies (placeholder) |
| POST   | `/uploads/presign` 🔒          | `{ files: [{ type, size }] }` → `[{ key, uploadUrl, url }]`: presigned S3 PUT URLs (JPEG/PNG/WebP/AVIF/GIF, ≤ 10 MB, ≤ 20 per request) |
| POST   | `/uploads/by-link` 🔒          | `{ link }`: the server downloads the image (private addresses blocked) and stores it in S3 → `{ key, url }` |
| POST   | `/places`                      | Create a place |
| GET    | `/places?page=1&limit=12`      | One page of places, newest first → `{ places, page, limit, total, totalPages }` (`limit` 1–50, default 12). Optional filters: `location`, `guests`, `pets=1`, `checkin` + `checkout` (`YYYY-MM-DD`, hides places booked on those dates) |
| GET    | `/places/destinations`         | Search suggestions: `[{ name, count }]` built from listing addresses |
| GET    | `/places/:ownerId`             | List places owned by a user |
| GET    | `/places/place/:id`            | Get one place |
| PUT    | `/places/:placeId/:ownerId`    | Update a place (only if `ownerId` matches the place's owner) |
| POST   | `/bookings`                    | Create a booking `{ bookingData: {...} }` |
| GET    | `/bookings/:ownerId`           | List a user's bookings (place populated) |
| GET    | `/booking/:id`                 | Get one booking (place populated) |

### Data model

- **User**: `name`, `email` (unique), `password` (bcrypt hash)
- **Place**: `owner` → User, `title`, `address`, `photos[]` (S3 keys), `description`, `perks[]`, `extraInfo`, `checkIn`, `checkOut`, `maxGuests`, `price`
- **Booking**: `place` → Place, `owner` → User, `checkIn`, `checkOut`, `name`, `phoneNumber`, `email`, `price`

All models have `createdAt` / `updatedAt` timestamps.

## Deployment (Vercel)

`vercel.json` builds the client (`client/dist`) and rewrites `/api/*` to `api/index.js`. Set these in the Vercel project settings:

- `MONGO_URL`, `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY` (and `S3_BUCKET` / `S3_REGION` if not the defaults) for the API
- The bucket CORS rule from `npm run s3:cors`, including your production domain
- `VITE_API_BASE_URL` can be left unset: the client calls `/api` on its own domain, which works on every Vercel alias and preview URL
- Node.js version **22.x or newer**

## Roadmap

The dependencies are current (September 2026: Express 5.2.1, React 19.3, Vite 8, Tailwind 4, Mongoose 9). The main areas still to improve:

1. **Security.** Verify the JWT on the server and take the user ID from it rather than from URLs and bodies. Move the JWT secret into an environment variable. Stop returning password hashes. Lock down API CORS.
2. **Reliability.** Fix schema validation typos. Clean up orphaned S3 photos with a lifecycle rule.
3. **Frontend quality.** A shared layout instead of a per-page Header/Footer/Toaster. Fix the effect dependencies. Loading and error states. Search and filtering.
4. **Tooling.** ESLint, automated tests (API and UI), and CI.

The detailed, prioritized list lives in [CLAUDE.md](CLAUDE.md).

## License

ISC
