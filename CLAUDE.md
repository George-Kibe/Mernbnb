# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

AirBuenas: an Airbnb-style rental marketplace. Two independent npm packages, no workspace tooling:

- `api/`: Express 5 + Mongoose 9 REST API, **CommonJS** (`require`). All routes are in `api/index.js`; models are in `api/models/`.
- `client/`: React 19 SPA built with Vite 8, **ES modules**, plain JSX (no TypeScript). Styling is Tailwind CSS 4.

It deploys to Vercel via `vercel.json`: the client builds to `client/dist`, and `/api/*` is rewritten to `api/index.js`.

## Commands

Run each from its own package directory. There is no root `package.json`.

```bash
# api/ (port 5000, hard-coded)
npm install
npm start                    # nodemon index.js; needs MONGO_URL in api/.env

# client/ (port 5173)
npm install
npm run dev                  # needs VITE_API_BASE_URL, e.g. http://localhost:5000/api
npm run build                # use this as the "does it compile" check
npm run preview
```

There are **no tests and no linter** yet. `npm run build` in `client/` is the only automated check. Node ≥ 22.22 is required (React Router 8); the API alone needs ≥ 20.19 (Mongoose 9).

## Architecture notes

- **Routing (client):** `src/App.jsx` uses `createBrowserRouter`. Both `/profile/:subpage?` and `/profile/:subpage/:actionOrId` render `ProfilePage.jsx`, which switches on `subpage` (`profile` | `places` | `bookings`) and renders `PlacesPage`, `BookingsPage`, or `BookingPage`. `PlacesPage` handles both the list (`MyPlacesPage`) and the create/edit form (`actionOrId === "new"` or a place id).
- **Auth (client):** login stores the JWT in `localStorage`. `UserContext.jsx` decodes it client-side with `jwtDecode` into `{ name, email, id, time }`. Nothing verifies it, and it has no expiry. Right after login, `setUser` briefly holds the raw `userDoc` (which has `_id`, not `id`) until the context effect re-decodes the token.
- **Auth (server):** the JWT is signed on login but **never verified**. Routes trust owner/user IDs passed in the URL or body.
- **API calls:** `axios.defaults.baseURL` is set once in `App.jsx`; pages call relative paths like `axios.get("/places")`.
- **Toasts, header, footer:** every page renders its own `<Toaster>`, `<Header>`, and `<Footer>`. `Layout.jsx` exists but is unused. Subpages receive `toast` as a prop from `ProfilePage`.
- **DB connection:** each handler calls `mongoose.connect(process.env.MONGO_URL)` without awaiting it (a serverless-era pattern). Mongoose buffers queries until the connection opens.
- **Images:** multer writes to `/tmp`, then `uploadToS3` puts the file in the `mernbnb-images-bucket` bucket (`eu-west-1`) and returns the public S3 URL, which is stored in `Place.photos`. `api/uploads/` holds legacy local files only.

## Conventions and gotchas (read before editing)

These were established during the September 2026 dependency upgrade:

- **Import routing from `react-router`, never `react-router-dom`.** v8 removed the `-dom` package.
- **Redirect after changing auth state with `<Navigate>`, not `navigate()`.** React Router 7+ wraps `navigate()` in `startTransition`, so a `setUser(...)` renders first and trips the page's "already logged in" / "must log in" guard. `LoginPage` and `ProfilePage` use a `loggedIn` / `loggedOut` state flag that renders `<Navigate>`. Follow that pattern.
- **Tailwind 4 is CSS-first.** There is no `tailwind.config.*` and no PostCSS config. The theme lives in `client/src/index.css` under `@theme` (`--color-primary: #f53850`), and the plugin is `@tailwindcss/vite` in `vite.config.js`.
- **Put any custom CSS in `@layer base` or `@layer components`.** Unlayered CSS beats every Tailwind utility in v4, so an unlayered `button { ... }` rule would override every `bg-*` class on buttons.
- **Tailwind v3 → v4 renames apply**: `shadow` → `shadow-sm`, `bg-opacity-50` → `bg-black/50`, and so on. A compat block in `index.css` keeps the v3 default border color (`gray-200`) and pointer cursor on buttons.
- `jwt-decode` v4 has a named export: `import { jwtDecode } from "jwt-decode"`.
- **Express 5**: async handler rejections are forwarded to the error handler automatically. Path syntax is stricter: use `/*splat` rather than `*`, and `{/:param}` rather than `/:param?`. `req.body` is `undefined` when no body parser matched.
- `dotenv` 17+ logs a banner unless called with `{ quiet: true }` (already set).
- Keep the API in CommonJS unless you convert the whole package. bcryptjs 3 still ships a CJS build.
- Currency is shown as `Kshs.` The app targets Kenya.

## Verifying changes

With no test suite, verify end to end:

1. `cd client && npm run build` must succeed with **no** `lightningcss` warnings. A warning like "Unknown at rule @apply/@theme" means Tailwind isn't running.
2. For API changes, run the API against a throwaway MongoDB (`mongodb-memory-server` in a scratch dir works well when Docker isn't available) and exercise the routes with `fetch`/`curl`. Note that zsh does not word-split `$VAR`, so quote curl header arguments explicitly.
3. For UI changes, drive the dev server with headless Chrome (`/usr/bin/google-chrome` with `puppeteer-core`). Check the flows register → login → browse → book → bookings → edit place → logout, and watch the browser console for React warnings.

## Backlog (prioritized)

Line numbers refer to the code as of the dependency upgrade.

### P0: Security

1. **Hard-coded JWT secret**: `api/index.js:20`. Move it to `JWT_SECRET` in `.env` and add it to `.env.example`.
2. **No server-side authorization.** Add middleware that verifies the JWT (from an `Authorization: Bearer` header or an httpOnly cookie) and derives the user ID from it. Today:
   - `PUT /api/places/:placeId/:ownerId` trusts the `ownerId` in the URL, so anyone can edit any place.
   - `POST /api/places` and `POST /api/bookings` trust `owner` from the body.
   - `GET /api/bookings/:ownerId` and `GET /api/booking/:id` expose anyone's bookings.
   - The booking `price` is computed client-side and stored as sent.
3. **Password hashes leak**: register returns the full user document (`:82`) and login returns `userDoc` (`:100`). Strip `password`, e.g. with `select: false` on the schema.
4. **SSRF / open proxy**: `/api/upload-by-link` (`:124`) fetches any URL the client sends, for any HTTP method (`app.use`). Restrict it to POST, allow only http(s), block private IPs, and validate the content type and size.
5. `cors()` is fully open (`:25`); the login cookie (`:100`) has no `httpOnly`, `secure`, or `sameSite`. The register error path returns the raw Mongo error (`:84`).
6. The JWT has no expiry, and the client never checks one.

### P1: Correctness and reliability

7. **Implicit globals** shared across concurrent requests: `placeDoc =` (`:249`) and `bookingDocs =` (`:313`, `:331`). Add `const`.
8. **Connect once**: replace the per-request `mongoose.connect` calls with a single cached connection that is awaited. A missing or unset `MONGO_URL` currently crashes the process with an unhandled rejection.
9. The `Booking` schema uses `require: true` (typo, `api/models/Booking.js`), so nothing is validated. It should be `required`. Add validation to `Place` and `User` too.
10. `uploadToS3` returns the error object on failure (`:60`), and callers store it as if it were a URL. Throw instead. Temp files in `/tmp` are never deleted.
11. Bad IDs return 422 or 500 instead of 404; there is no `ObjectId` validation and no central error handler.
12. `toast.error()` is called during render (`LoginPage.jsx:42`, `ProfilePage.jsx:48`, `PlacePage.jsx:30`), which triggers React's "Cannot update a component while rendering" warning. Move these calls into effects or event handlers.
13. `useEffect` hooks have missing dependencies (`BookingsPage`, `BookingPage`, `MyPlacesPage`, `PlacesPage`). There is no loading or error UI on several pages. `BookingsPage` never clears `loading` on error.
14. Booking form: `numberOfGuests` is a string, not checked against `maxGuests`, and past dates aren't blocked. Double-booking isn't prevented.
15. `ImageComponent` crashes if `place.photos` is undefined.

### P2: Code quality and UX

16. Use `Layout.jsx` as a parent route with `<Outlet>`, with a single `<Toaster>`, instead of repeating Header/Footer/Toaster on every page.
17. Split `api/index.js` into routers (`users`, `places`, `bookings`, `uploads`) plus config for the port, bucket, and region.
18. Remove dead code: `App.css`, `assets/react.svg`, commented-out local-upload route, stray `console.log`s, and `api/uploads/` if it's no longer needed.
19. Typos and branding: "Accomondations", "Loggin In", "Genrating", "Insersion". The `<title>` says "AirBnb Clone" while the brand is AirBuenas. The footer year is hard-coded to 2023, and its social links are `#`.
20. Header search pills (Anywhere / Any Week / Add Guests) are static. Implement search and filtering.
21. Serverless fit: `api/index.js` calls `app.listen` and doesn't export `app`. Confirm how Vercel invokes it and export the app for serverless use.

### P3: Tooling

22. Add ESLint (with `eslint-plugin-react-hooks`) and Prettier.
23. Add API tests (Vitest or `node:test` + supertest + mongodb-memory-server) and UI tests (Vitest + Testing Library, or Playwright for E2E).
24. Add GitHub Actions CI: install, lint, test, and build both packages.
25. Consider migrating to TypeScript, starting with the models and API types.
