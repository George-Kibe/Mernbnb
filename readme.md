# AirBuenas (Mernbnb)

A full-stack vacation-rental marketplace inspired by Airbnb, built on the MERN stack. Hosts list places with photos, perks, and nightly prices. Guests browse listings, pick dates, and book stays.

> **Status:** learning project that is being brought up to production quality. See [Roadmap](#roadmap) for known gaps. Most importantly, the API does not yet verify who is making a request.

## Features

- Register and log in with email and password (bcrypt-hashed, JWT issued on login)
- Browse all listings on the home page
- Listing page with a photo gallery, description, check-in/out times, and a Google Maps link
- Book a stay: choose dates and guest count, see the live price (nights × guests × nightly price)
- Profile area:
  - **My Bookings**: list and detail view of your reservations
  - **My Accommodations**: create and edit your listings, upload photos from your device or from a URL, mark a cover photo, pick perks
- Photos are stored in AWS S3

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19.3, Vite 8, React Router 8, Tailwind CSS 4, axios, date-fns 4, react-hot-toast |
| Backend  | Node.js, Express 5.2, Mongoose 9 (MongoDB), jsonwebtoken, bcryptjs 3, multer 2 |
| Storage  | MongoDB (e.g. Atlas) for data, AWS S3 for images |
| Hosting  | Vercel (static client build and the API as a function) |

## Project structure

```
.
├── api/                  Express API (CommonJS)
│   ├── index.js          App setup and every route
│   ├── models/           Mongoose models: User, Place, Booking
│   ├── uploads/          Legacy local uploads (no longer written to)
│   └── .env.example
├── client/               React SPA (ES modules, Vite)
│   ├── src/
│   │   ├── App.jsx       Router definition
│   │   ├── UserContext.jsx  Auth state (decoded JWT from localStorage)
│   │   ├── components/   Header, Footer, Perks, ImageComponent
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
- An AWS S3 bucket and access keys, if you want image uploads to work

### 1. Configure environment variables

```bash
cp api/.env.example api/.env
cp client/.env.example client/.env
```

`api/.env`

| Variable               | Description |
| ---------------------- | ----------- |
| `MONGO_URL`            | MongoDB connection string. **Required.** The API crashes on the first DB request without it. |
| `S3_ACCESS_KEY`        | AWS access key ID with `s3:PutObject` on the bucket |
| `S3_SECRET_ACCESS_KEY` | Matching AWS secret |

The bucket name (`mernbnb-images-bucket`) and region (`eu-west-1`) are currently hard-coded in `api/index.js`.

`client/.env`

| Variable            | Description |
| ------------------- | ----------- |
| `VITE_API_BASE_URL` | Base URL of the API, including `/api`, e.g. `http://localhost:5000/api` |

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
npm run dev
```

Other client scripts:

```bash
npm run build      # production build to client/dist
npm run preview    # serve the production build locally
```

## API reference

All routes are prefixed with `/api`. Request and response bodies are JSON unless noted.

| Method | Path                           | Purpose |
| ------ | ------------------------------ | ------- |
| POST   | `/users/register`              | Create an account `{ name, email, password }` |
| POST   | `/users/login`                 | Log in `{ email, password }` → `{ userDoc, token }` |
| GET    | `/users/profile`               | Echoes request cookies (placeholder) |
| POST   | `/upload`                      | `multipart/form-data`, field `photos` (up to 100) → array of S3 URLs |
| ANY    | `/upload-by-link`              | `{ link }`: server downloads the image and uploads it to S3 → S3 URL |
| POST   | `/places`                      | Create a place |
| GET    | `/places`                      | List all places |
| GET    | `/places/:ownerId`             | List places owned by a user |
| GET    | `/places/place/:id`            | Get one place |
| PUT    | `/places/:placeId/:ownerId`    | Update a place (only if `ownerId` matches the place's owner) |
| POST   | `/bookings`                    | Create a booking `{ bookingData: {...} }` |
| GET    | `/bookings/:ownerId`           | List a user's bookings (place populated) |
| GET    | `/booking/:id`                 | Get one booking (place populated) |

### Data model

- **User**: `name`, `email` (unique), `password` (bcrypt hash)
- **Place**: `owner` → User, `title`, `address`, `photos[]`, `description`, `perks[]`, `extraInfo`, `checkIn`, `checkOut`, `maxGuests`, `price`
- **Booking**: `place` → Place, `owner` → User, `checkIn`, `checkOut`, `name`, `phoneNumber`, `email`, `price`

All models have `createdAt` / `updatedAt` timestamps.

## Deployment (Vercel)

`vercel.json` builds the client (`client/dist`) and rewrites `/api/*` to `api/index.js`. Set these in the Vercel project settings:

- `MONGO_URL`, `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY` for the API
- `VITE_API_BASE_URL` for the client build, e.g. `https://<your-domain>/api`
- Node.js version **22.x or newer**

## Roadmap

The dependencies are current (September 2026: Express 5.2.1, React 19.3, Vite 8, Tailwind 4, Mongoose 9). The main areas still to improve:

1. **Security.** Verify the JWT on the server and take the user ID from it rather than from URLs and bodies. Move the JWT secret into an environment variable. Stop returning password hashes. Lock down CORS and the upload-by-link endpoint.
2. **Reliability.** Connect to MongoDB once instead of on every request. Fix a few undeclared variables and schema typos. Clean up temp files after uploads.
3. **Frontend quality.** A shared layout instead of a per-page Header/Footer/Toaster. Fix the effect dependencies. Loading and error states. Search and filtering.
4. **Tooling.** ESLint, automated tests (API and UI), and CI.

The detailed, prioritized list lives in [CLAUDE.md](CLAUDE.md).

## License

ISC
