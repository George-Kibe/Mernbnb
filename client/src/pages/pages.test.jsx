import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { HOST, USER, makeBooking, makePlace, makeToken, renderApp } from "../test/utils";
import ErrorPage from "./ErrorPage";

const page = (places, { total = places.length, page: p = 1, totalPages = Math.ceil(total / 12) } = {}) => ({ places, page: p, limit: 12, total, totalPages });
const noDestinations = () => server.use(http.get("*/api/places/destinations", () => HttpResponse.json([])));

describe("IndexPage", () => {
  it("lists places with photo carousels and prices", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(page([makePlace(), makePlace({ _id: "p2", title: "City Loft", address: "Kilimani, Nairobi", price: 12500 })]))));
    renderApp("/");
    expect(await screen.findByText("City Loft")).toBeInTheDocument();
    expect(screen.getByText("Kshs. 12,500")).toBeInTheDocument();
    expect(screen.getByText("1 – 2 of 2 places to stay")).toBeInTheDocument();
  });

  it("searches with filters, shows a heading and carries the trip to listings", async () => {
    noDestinations();
    let query;
    server.use(http.get("*/api/places", ({ request }) => {
      query = Object.fromEntries(new URL(request.url).searchParams);
      return HttpResponse.json(page([makePlace()]));
    }));
    renderApp("/?location=Naivasha&checkin=2030-01-10&checkout=2030-01-13&adults=2&children=1");
    expect(await screen.findByText("1 stay in Naivasha")).toBeInTheDocument();
    expect(query).toMatchObject({ location: "Naivasha", checkin: "2030-01-10", checkout: "2030-01-13", guests: "3", page: "1", limit: "12" });
    expect(screen.getByRole("link", { name: /Lakeside Cabin/ })).toHaveAttribute("href", "/place/64b0000000000000000000aa?checkin=2030-01-10&checkout=2030-01-13&adults=2&children=1");
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/");
  });

  it("shows a 'no exact matches' state for empty searches", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(page([]))));
    renderApp("/?location=Mars");
    expect(await screen.findByText("No exact matches")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remove all filters" })).toHaveAttribute("href", "/");
  });

  it("paginates, keeping the search, and fixes out-of-range pages", async () => {
    noDestinations();
    server.use(http.get("*/api/places", ({ request }) => {
      const p = Number(new URL(request.url).searchParams.get("page"));
      return HttpResponse.json(page([makePlace({ _id: `p${p}`, title: `Place on page ${p}` })], { total: 20, page: p, totalPages: 2 }));
    }));
    const { router } = renderApp("/?location=Kenya&page=9");
    expect(await screen.findByText("Place on page 2")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?location=Kenya&page=2");
    await userEvent.click(screen.getByRole("button", { name: "Page 1" }));
    expect(await screen.findByText("Place on page 1")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?location=Kenya");
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it("reports load errors and unexpected responses", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json({ error: "Database unavailable. Try again later." }, { status: 503 })));
    renderApp("/");
    expect(await screen.findByText("Database unavailable. Try again later.")).toBeInTheDocument();
    expect(screen.getByText("No places to stay yet.")).toBeInTheDocument();
  });

  it("rejects a malformed response", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json({ nope: true })));
    renderApp("/");
    expect(await screen.findByText("Could not load places.")).toBeInTheDocument();
  });
});

describe("LoginPage and RegisterPage", () => {
  it("logs in and goes home", async () => {
    noDestinations();
    server.use(
      http.post("*/api/users/login", async ({ request }) => {
        const body = await request.json();
        return body.password === "right password"
          ? HttpResponse.json({ user: USER, token: makeToken(USER) })
          : HttpResponse.json({ error: "Incorrect email or password." }, { status: 401 });
      }),
      http.get("*/api/places", () => HttpResponse.json(page([]))),
    );
    const { router } = renderApp("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "amina@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "right password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("Welcome back, Amina!")).toBeInTheDocument();
  });

  it("never redirects off-site after login", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(page([]))));
    localStorage.setItem("token", makeToken(USER));
    const router = createMemoryRouter((await import("../App")).routes, { initialEntries: [{ pathname: "/login", state: { from: "//evil.example" } }] });
    const { UserContextProvider } = await import("../UserContext");
    render(<UserContextProvider><RouterProvider router={router} /></UserContextProvider>);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("registers, signs in automatically and validates the password", async () => {
    noDestinations();
    server.use(
      http.post("*/api/users/register", () => HttpResponse.json({ user: USER }, { status: 201 })),
      http.post("*/api/users/login", () => HttpResponse.json({ user: USER, token: makeToken(USER) })),
      http.get("*/api/places", () => HttpResponse.json(page([]))),
    );
    const { router } = renderApp("/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Amina");
    await user.type(screen.getByLabelText("Email"), "amina@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 8 characters");
    await user.type(screen.getByLabelText("Password"), " enough now");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(localStorage.getItem("token")).toBeTruthy();
  });

  it("shows registration errors and redirects signed-in users", async () => {
    noDestinations();
    server.use(
      http.post("*/api/users/register", () => HttpResponse.json({ error: "An account with this email already exists." }, { status: 409 })),
      http.get("*/api/places", () => HttpResponse.json(page([]))),
    );
    renderApp("/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Amina");
    await user.type(screen.getByLabelText("Email"), "amina@example.com");
    await user.type(screen.getByLabelText("Password"), "long enough");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  });

  it("sends signed-in users away from register", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(page([]))));
    const { router } = renderApp("/register", { user: USER });
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("PlacePage and booking", () => {
  const place = makePlace();
  const withPlace = (overrides = {}) => server.use(
    http.get("*/api/places/:id", ({ params }) => (params.id === "destinations" ? HttpResponse.json([]) : HttpResponse.json({ ...place, ...overrides }))),
  );

  it("shows the listing", async () => {
    withPlace();
    renderApp(`/place/${place._id}`);
    expect(await screen.findByRole("heading", { name: "Lakeside Cabin" })).toBeInTheDocument();
    expect(screen.getByText("✓ Wifi")).toBeInTheDocument();
    expect(screen.getByText("Check-in after 14:00")).toBeInTheDocument();
    expect(screen.getByText("No parties.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Naivasha, Nakuru" })).toHaveAttribute("href", "https://maps.google.com/?q=Naivasha%2C%20Nakuru");
    await userEvent.click(screen.getAllByRole("button", { name: /Lakeside Cabin — photo 1/ })[0]);
    expect(screen.getByRole("dialog", { name: "Photos of Lakeside Cabin" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close photo tour" }));
  });

  it("hides empty sections", async () => {
    withPlace({ perks: [], extraInfo: "" });
    renderApp(`/place/${place._id}`);
    await screen.findByRole("heading", { name: "Lakeside Cabin" });
    expect(screen.queryByText("What this place offers")).not.toBeInTheDocument();
  });

  it("handles missing places and errors", async () => {
    server.use(http.get("*/api/places/:id", ({ params }) => (params.id === "destinations" ? HttpResponse.json([]) : HttpResponse.json({ error: "gone" }, { status: params.id === "missing" ? 404 : 500 }))));
    renderApp("/place/missing");
    expect(await screen.findByText("This place doesn’t exist or is no longer listed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers a retry for other errors", async () => {
    server.use(http.get("*/api/places/:id", ({ params }) => (params.id === "destinations" ? HttpResponse.json([]) : HttpResponse.json({ error: "Server hiccup" }, { status: 500 }))));
    renderApp("/place/other");
    expect(await screen.findByText("Server hiccup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("sends anonymous guests to log in first", async () => {
    withPlace();
    const { router } = renderApp(`/place/${place._id}?checkin=2030-01-10&checkout=2030-01-13&adults=9`);
    await userEvent.click(await screen.findByRole("button", { name: "Log in to reserve" }));
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toMatchObject({ from: `/place/${place._id}?checkin=2030-01-10&checkout=2030-01-13&adults=9` });
  });

  it("prefills the trip, shows the price breakdown and books", async () => {
    withPlace();
    let body;
    server.use(http.post("*/api/bookings", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeBooking({ _id: "b1" }), { status: 201 });
    }), http.get("*/api/bookings/b1", () => HttpResponse.json(makeBooking({ _id: "b1" }))));
    const { router } = renderApp(`/place/${place._id}?checkin=2030-01-10&checkout=2030-01-13&adults=2`, { user: USER });
    expect(await screen.findByLabelText("Check-in date")).toHaveValue("2030-01-10");
    expect(screen.getByLabelText("Guests")).toHaveValue("2");
    expect(screen.getByText("Kshs. 5,000 × 3 nights")).toBeInTheDocument();
    expect(screen.getAllByText("Kshs. 15,000")).toHaveLength(2);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Guests"), "3");
    await user.type(screen.getByLabelText("Phone number"), "+254700000000");
    await user.click(screen.getByRole("button", { name: "Reserve" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile/bookings/b1"));
    expect(body).toEqual({ placeId: place._id, checkIn: "2030-01-10", checkOut: "2030-01-13", guests: 3, name: "Amina", phoneNumber: "+254700000000" });
  });

  it("validates dates and details, and shows server errors", async () => {
    withPlace();
    server.use(http.post("*/api/bookings", () => HttpResponse.json({ error: "Those dates are no longer available. Please pick different dates." }, { status: 409 })));
    renderApp(`/place/${place._id}`, { user: USER });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reserve" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose your check-in and checkout dates.");
    await user.type(screen.getByLabelText("Check-in date"), "2030-01-13");
    await user.type(screen.getByLabelText("Checkout date"), "2030-01-10");
    expect(screen.getByText("Checkout must be after check-in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reserve" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Checkout date"));
    await user.type(screen.getByLabelText("Checkout date"), "2030-01-14");
    expect(screen.getByText("Kshs. 5,000 × 1 night")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Full name"));
    await user.click(screen.getByRole("button", { name: "Reserve" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add your name and phone number.");
    await user.type(screen.getByLabelText("Full name"), "Amina");
    await user.type(screen.getByLabelText("Phone number"), "0700000000");
    await user.click(screen.getByRole("button", { name: "Reserve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
  });

  it("shows hosts an edit link instead of the booking form", async () => {
    withPlace();
    renderApp(`/place/${place._id}`, { user: HOST });
    expect(await screen.findByText("This is your listing.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit listing" })).toHaveAttribute("href", `/profile/places/${place._id}`);
  });
});

describe("profile pages", () => {
  it("shows the account and logs out", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(page([]))));
    const { router } = renderApp("/profile", { user: USER });
    expect(await screen.findByRole("heading", { name: "Amina" })).toBeInTheDocument();
    expect(screen.getByText("amina@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("lists trips, with empty and error states", async () => {
    noDestinations();
    let mode = "error";
    server.use(http.get("*/api/me/bookings", () => (mode === "error" ? HttpResponse.json({ error: "Oops" }, { status: 500 }) : HttpResponse.json(mode === "empty" ? [] : [makeBooking()]))));
    const { unmount } = renderApp("/profile/bookings", { user: USER });
    expect(await screen.findByText("Oops")).toBeInTheDocument();
    mode = "list";
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Lakeside Cabin/ })).toHaveAttribute("href", "/profile/bookings/64b0000000000000000000bb");
    unmount();
    mode = "empty";
    renderApp("/profile/bookings", { user: USER });
    expect(await screen.findByText("No trips booked… yet!")).toBeInTheDocument();
  });

  it("shows one booking, or explains why not", async () => {
    noDestinations();
    server.use(http.get("*/api/bookings/:id", ({ params }) => {
      if (params.id === "missing") return HttpResponse.json({ error: "Booking not found." }, { status: 404 });
      if (params.id === "broken") return HttpResponse.json({ error: "Server hiccup" }, { status: 500 });
      return HttpResponse.json(makeBooking());
    }));
    const first = renderApp("/profile/bookings/ok", { user: USER });
    expect(await screen.findByRole("heading", { name: "Your booking" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the listing" })).toHaveAttribute("href", "/place/64b0000000000000000000aa");
    first.unmount();
    const second = renderApp("/profile/bookings/missing", { user: USER });
    expect(await screen.findByText("This booking doesn’t exist or isn’t yours.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    second.unmount();
    renderApp("/profile/bookings/broken", { user: USER });
    expect(await screen.findByText("Server hiccup")).toBeInTheDocument();
  });

  it("lists my places, with empty and error states", async () => {
    noDestinations();
    let mode = "list";
    server.use(http.get("*/api/me/places", () => (mode === "error" ? HttpResponse.json({ error: "Nope" }, { status: 500 }) : HttpResponse.json(mode === "empty" ? [] : [makePlace(), makePlace({ _id: "p2", photos: [], title: "No photos" })]))));
    const first = renderApp("/profile/places", { user: HOST });
    expect(await screen.findByRole("heading", { name: "Your listings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lakeside Cabin/ })).toHaveAttribute("href", "/profile/places/64b0000000000000000000aa");
    expect(screen.getByRole("link", { name: /Add new place/ })).toHaveAttribute("href", "/profile/places/new");
    first.unmount();
    mode = "empty";
    const second = renderApp("/profile/places", { user: HOST });
    expect(await screen.findByText("You don’t have any listings yet")).toBeInTheDocument();
    second.unmount();
    mode = "error";
    renderApp("/profile/places", { user: HOST });
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });
});

describe("PlaceFormPage", () => {
  it("validates, then creates a listing", async () => {
    noDestinations();
    let body;
    server.use(
      http.post("*/api/uploads/by-link", () => HttpResponse.json({ key: "k", url: "https://cdn.test/k.jpg" }, { status: 201 })),
      http.post("*/api/places", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ _id: "new" }, { status: 201 });
      }),
      http.get("*/api/me/places", () => HttpResponse.json([])),
    );
    const { router } = renderApp("/profile/places/new", { user: HOST });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create listing" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Add a title.")).toBeInTheDocument();
    expect(within(alert).getByText("Add at least one photo.")).toBeInTheDocument();
    expect(within(alert).getByText("Set a nightly price in whole shillings.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Beach house");
    await user.type(screen.getByLabelText("Address"), "Diani Beach, Kwale");
    await user.type(screen.getByLabelText("Or add a photo from a link"), "https://example.com/a.jpg{Enter}");
    await screen.findByAltText("Cover photo");
    await user.type(screen.getByLabelText("Description"), "Steps from the sand.");
    await user.click(screen.getByRole("checkbox", { name: /Swimming Pool/ }));
    await user.clear(screen.getByLabelText("Maximum guests"));
    await user.type(screen.getByLabelText("Maximum guests"), "6");
    await user.type(screen.getByLabelText("Price per night (Kshs.)"), "18000");
    await user.click(screen.getByRole("button", { name: "Create listing" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile/places"));
    expect(body).toEqual({
      title: "Beach house", address: "Diani Beach, Kwale", photos: ["https://cdn.test/k.jpg"], description: "Steps from the sand.",
      perks: ["Swimming Pool"], extraInfo: "", checkIn: "14:00", checkOut: "11:00", maxGuests: 6, price: 18000,
    });
  });

  it("edits my listing and shows server validation details", async () => {
    noDestinations();
    let attempt = 0;
    server.use(
      http.get("*/api/places/:id", () => HttpResponse.json(makePlace())),
      http.put("*/api/places/:id", () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json({ error: "Invalid", details: [{ field: "title", message: "Title is too long." }] }, { status: 400 })
          : HttpResponse.json(makePlace());
      }),
      http.get("*/api/me/places", () => HttpResponse.json([])),
    );
    const { router } = renderApp("/profile/places/64b0000000000000000000aa", { user: HOST });
    expect(await screen.findByLabelText("Title")).toHaveValue("Lakeside Cabin");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Title is too long.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile/places"));
  });

  it("refuses to edit someone else's listing, and handles errors", async () => {
    noDestinations();
    server.use(http.get("*/api/places/:id", ({ params }) => {
      if (params.id === "missing") return HttpResponse.json({ error: "x" }, { status: 404 });
      if (params.id === "broken") return HttpResponse.json({ error: "Server hiccup" }, { status: 500 });
      return HttpResponse.json(makePlace());
    }));
    const a = renderApp("/profile/places/64b0000000000000000000aa", { user: USER });
    expect(await screen.findByText("You can only edit your own listings.")).toBeInTheDocument();
    a.unmount();
    const b = renderApp("/profile/places/missing", { user: USER });
    expect(await screen.findByText("This listing doesn’t exist.")).toBeInTheDocument();
    b.unmount();
    renderApp("/profile/places/broken", { user: USER });
    expect(await screen.findByText("Server hiccup")).toBeInTheDocument();
  });

  it("shows a generic save error", async () => {
    noDestinations();
    server.use(
      http.get("*/api/places/:id", () => HttpResponse.json(makePlace({ price: undefined }))),
      http.put("*/api/places/:id", () => HttpResponse.json({ error: "Too many requests." }, { status: 429 })),
    );
    renderApp("/profile/places/64b0000000000000000000aa", { user: HOST });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Price per night (Kshs.)"), "700");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Too many requests.")).toBeInTheDocument();
  });

  it("won't save while photos are uploading", async () => {
    noDestinations();
    let release;
    server.use(http.post("*/api/uploads/by-link", () => new Promise((resolve) => { release = () => resolve(HttpResponse.json({ key: "k", url: "https://cdn.test/k.jpg" }, { status: 201 })); })));
    renderApp("/profile/places/new", { user: HOST });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Or add a photo from a link"), "https://example.com/a.jpg{Enter}");
    await screen.findByRole("button", { name: "Adding…" });
    await user.click(screen.getByRole("button", { name: "Create listing" }));
    expect(await screen.findByText("Wait for your photos to finish uploading.")).toBeInTheDocument();
    release();
  });
});

describe("errors and 404", () => {
  it("shows a friendly 404 for unknown routes", async () => {
    noDestinations();
    renderApp("/no/such/page");
    expect(await screen.findByRole("heading", { name: "We can’t find that page" })).toBeInTheDocument();
  });

  it("shows the error page when a route crashes or 404s", async () => {
    const Boom = () => { throw new Error("kaboom"); };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const crash = createMemoryRouter([{ path: "/", element: <Boom />, errorElement: <ErrorPage /> }]);
    const a = render(<RouterProvider router={crash} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    a.unmount();
    const missing = createMemoryRouter([{ path: "/", loader: () => { throw new Response("", { status: 404 }); }, element: <div />, errorElement: <ErrorPage /> }]);
    render(<RouterProvider router={missing} />);
    expect(await screen.findByText("404")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  });

  it("boots the app from main.jsx", async () => {
    noDestinations();
    server.use(http.get("*/api/places", () => HttpResponse.json(page([]))));
    document.body.innerHTML = '<div id="root"></div>';
    await import("../main.jsx");
    expect(await screen.findByText("No places to stay yet.")).toBeInTheDocument();
  });
});
