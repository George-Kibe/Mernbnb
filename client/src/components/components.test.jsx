import { describe, it, expect, vi } from "vitest";
import React, { useContext } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { HOST, USER, makeBooking, makePlace, makeToken, renderApp, renderWithRouter, signIn } from "../test/utils";
import { Toaster } from "react-hot-toast";
import { UserContext, UserContextProvider, readSession } from "../UserContext";
import { SESSION_EXPIRED_EVENT } from "../lib/api";
import Pagination from "./Pagination";
import Perks from "./Perks";
import ImageComponent from "./ImageComponent";
import TripCard from "./TripCard";
import ThemeSwitcher from "./ThemeSwitcher";
import { EmptyState, ErrorState, LoadingState } from "./Status";

const emptyHome = () =>
  server.use(
    http.get("*/api/places", () => HttpResponse.json({ places: [], page: 1, limit: 12, total: 0, totalPages: 0 })),
    http.get("*/api/places/destinations", () => HttpResponse.json([{ name: "Nairobi", slug: "nairobi", count: 5, minPrice: 4000 }, { name: "Kilifi", slug: "kilifi", count: 1, minPrice: 9000 }])),
  );

describe("UserContext", () => {
  const Probe = () => {
    const { user, login, logout } = useContext(UserContext);
    return (
      <div>
        <span data-testid="user">{user ? user.name : "none"}</span>
        <button onClick={() => login(makeToken(HOST))}>login</button>
        <button onClick={logout}>logout</button>
      </div>
    );
  };

  it("reads, logs in and logs out", async () => {
    signIn(USER);
    render(<UserContextProvider><Probe /></UserContextProvider>);
    expect(screen.getByTestId("user")).toHaveTextContent("Amina");
    await userEvent.click(screen.getByText("login"));
    expect(screen.getByTestId("user")).toHaveTextContent("Host");
    await userEvent.click(screen.getByText("logout"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("discards expired and malformed tokens", () => {
    localStorage.setItem("token", makeToken(USER, { expiresInSeconds: -10 }));
    expect(readSession()).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
    localStorage.setItem("token", "garbage");
    expect(readSession()).toBeNull();
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readSession()).toBeNull();
    spy.mockRestore();
  });

  it("logs out when the API reports an expired session, once", async () => {
    signIn(USER);
    render(<UserContextProvider><Probe /></UserContextProvider>);
    act(() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    act(() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))); // already logged out: no-op
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("shows the server's reason for ending a session", async () => {
    signIn(USER);
    render(<><UserContextProvider><Probe /></UserContextProvider><Toaster /></>);
    act(() => window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason: "Your password was changed. Please log in again." } })));
    expect(await screen.findByText("Your password was changed. Please log in again.")).toBeInTheDocument();
  });

  it("falls back to a generic message when there is no reason", async () => {
    signIn(USER);
    render(<><UserContextProvider><Probe /></UserContextProvider><Toaster /></>);
    act(() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)));
    expect(await screen.findByText("Your session has expired. Please log in again.")).toBeInTheDocument();
  });

  it("follows logins and logouts in other tabs", () => {
    render(<UserContextProvider><Probe /></UserContextProvider>);
    act(() => {
      localStorage.setItem("token", makeToken(USER));
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));
    });
    expect(screen.getByTestId("user")).toHaveTextContent("Amina");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "theme" })));
    expect(screen.getByTestId("user")).toHaveTextContent("Amina");
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("has safe defaults outside a provider", () => {
    const Bare = () => {
      const ctx = useContext(UserContext);
      ctx.login();
      ctx.logout();
      return <span>{String(ctx.user)}</span>;
    };
    render(<Bare />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});

describe("Header and UserMenu", () => {
  it("shows logged-out menu items and closes on Escape / outside click", async () => {
    emptyHome();
    renderApp("/");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Sign up", "Log in", "AirBuenas your home"]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByRole("main"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows the signed-in menu, navigates and logs out from a protected page", async () => {
    emptyHome();
    server.use(http.get("*/api/me/places", () => HttpResponse.json([])));
    const { router } = renderApp("/profile/places", { user: USER });
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Account menu for Amina" });
    expect(within(button).getByText("A")).toBeInTheDocument();
    await user.click(button);
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Trips", "Manage listings", "Create a new listing", "Account", "Log out"]);
    await user.click(screen.getByRole("menuitem", { name: "Account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile")); // after the page loads
    await user.click(screen.getByRole("button", { name: "Account menu for Amina" }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(localStorage.getItem("token")).toBeNull();
    expect(await screen.findByRole("button", { name: "Main menu" })).toBeInTheDocument();
  });

  it("links 'AirBuenas your home' to the right place", async () => {
    emptyHome();
    renderApp("/");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "AirBuenas your home" })).toHaveAttribute("href", "/login");
  });
});

describe("Footer", () => {
  it("shows destination inspiration and logged-out links", async () => {
    emptyHome();
    renderApp("/");
    const nairobi = await screen.findByRole("link", { name: /Nairobi\s*5 stays/ });
    expect(nairobi).toHaveAttribute("href", "/stays/nairobi");
    expect(screen.getByRole("link", { name: /Kilifi\s*1 stay$/ })).toBeInTheDocument();
    const support = screen.getByRole("navigation", { name: "Support" });
    expect(within(support).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} AirBuenas`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AirBuenas on GitHub" })).toHaveAttribute("href", "https://github.com/George-Kibe/Mernbnb");
  });

  it("shows signed-in links", async () => {
    emptyHome();
    server.use(http.get("*/api/me/bookings", () => HttpResponse.json([])));
    renderApp("/profile/bookings", { user: USER });
    const hosting = await screen.findByRole("navigation", { name: "Hosting" });
    expect(within(hosting).getByRole("link", { name: "Manage your listings" })).toHaveAttribute("href", "/profile/places");
  });
});

describe("ThemeSwitcher", () => {
  it("switches between light, dark and system", async () => {
    render(<ThemeSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(screen.getByRole("radio", { name: "Dark theme" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Light theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("can hide labels", () => {
    render(<ThemeSwitcher showLabels={false} />);
    expect(screen.queryByText("Dark")).not.toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("renders nothing without results", () => {
    const { container } = render(<Pagination page={1} totalPages={0} total={0} pageSize={12} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the count for a single page", () => {
    render(<Pagination page={1} totalPages={1} total={3} pageSize={12} onPageChange={() => {}} />);
    expect(screen.getByText("1 – 3 of 3 places to stay")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("navigates with numbers and arrows, with gaps for long ranges", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={8} totalPages={15} total={180} pageSize={12} onPageChange={onPageChange} noun="homes" />);
    const user = userEvent.setup();
    expect(screen.getByText("85 – 96 of 180 homes")).toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Page 9" }));
    await user.click(screen.getByRole("button", { name: "Page 8" })); // current page: ignored
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange.mock.calls.map((c) => c[0])).toEqual([9, 7, 9]);
    expect(screen.getByRole("button", { name: "Page 8" })).toHaveAttribute("aria-current", "page");
  });
});

describe("Perks", () => {
  it("toggles perks", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Perks selected={["Wifi"]} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /Free Parking/ }));
    expect(onChange).toHaveBeenLastCalledWith(["Wifi", "Free Parking"]);
    await user.click(screen.getByRole("checkbox", { name: /Wifi/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<Perks selected={null} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: /Pets Allowed/ }));
    expect(onChange).toHaveBeenLastCalledWith(["Pets Allowed"]);
  });
});

describe("ImageComponent, TripCard and Status", () => {
  it("shows a photo or a placeholder", () => {
    const { rerender } = render(<ImageComponent place={makePlace()} className="x" />);
    expect(screen.getByRole("img", { name: "Lakeside Cabin" })).toHaveAttribute("src", "https://img.example/1.jpg");
    rerender(<ImageComponent place={makePlace({ photos: [], title: "" })} />);
    expect(screen.getByText("No photo")).toBeInTheDocument();
    rerender(<ImageComponent place={{ photos: ["https://img.example/x.jpg"] }} />);
    expect(screen.getByRole("img", { name: "Place photo" })).toBeInTheDocument();
  });

  it("summarizes a booking, with or without a link", () => {
    const { rerender } = renderWithRouter(<TripCard booking={makeBooking()} linkTo="/profile/bookings/1" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/profile/bookings/1");
    expect(screen.getByText("Thu, Jan 10, 2030")).toBeInTheDocument();
    expect(screen.getByText("Total (3 nights)")).toBeInTheDocument();
    expect(screen.getByText("Kshs. 15,000")).toBeInTheDocument();
    rerender(<TripCard booking={makeBooking({ guests: undefined, checkOut: "2030-01-11T00:00:00.000Z" })} />);
  });

  it("renders a one-night booking without a link", () => {
    render(<TripCard booking={makeBooking({ guests: undefined, checkOut: "2030-01-11T00:00:00.000Z" })} />);
    expect(screen.getByText("Total (1 night)")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders loading, error (with retry) and empty states", async () => {
    const onRetry = vi.fn();
    render(<><LoadingState /><ErrorState message="Broken" onRetry={onRetry} /><ErrorState message="No retry" /></>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
    renderWithRouter(<EmptyState title="Nothing" message="Here" action={{ to: "/x", label: "Go" }} />);
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/x");
    render(<EmptyState title="Bare" />);
    expect(screen.getByText("Bare")).toBeInTheDocument();
  });
});

describe("RequireAuth", () => {
  it("sends anonymous users to login, then back where they were", async () => {
    server.use(
      http.post("*/api/users/login", () => HttpResponse.json({ user: USER, token: makeToken(USER) })),
      http.get("*/api/me/bookings", () => HttpResponse.json([])),
      http.get("*/api/places/destinations", () => HttpResponse.json([])),
    );
    const { router } = renderApp("/profile/bookings?x=1");
    expect(await screen.findByText("Please log in to continue.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "amina@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile/bookings"));
    expect(router.state.location.search).toBe("?x=1");
  });
});
