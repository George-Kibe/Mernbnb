import React from "react";
import { render } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { UserContextProvider } from "../UserContext";
import { routes } from "../App";

export const USER = { id: "64b000000000000000000001", name: "Amina", email: "amina@example.com" };
export const HOST = { id: "64b000000000000000000002", name: "Host", email: "host@example.com" };

const base64url = (value) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// An unsigned JWT the client can decode (the client never verifies tokens).
export const makeToken = (user = USER, { expiresInSeconds = 3600 } = {}) =>
  `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: user.id, id: user.id, name: user.name, email: user.email, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.signature`;

export const signIn = (user = USER) => localStorage.setItem("token", makeToken(user));

// Renders the real route table at `path`.
export const renderApp = (path = "/", { user } = {}) => {
  if (user) signIn(user);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <UserContextProvider>
      <RouterProvider router={router} />
    </UserContextProvider>
  );
  return { ...utils, router };
};

// Renders a component inside a router at `path` (optionally with a user).
export const renderWithRouter = (element, { path = "/", routePath = "*", user } = {}) => {
  if (user) signIn(user);
  const router = createMemoryRouter([{ path: routePath, element }, { path: "*", element: <div>Other route</div> }], { initialEntries: [path] });
  return { ...render(<UserContextProvider><RouterProvider router={router} /></UserContextProvider>), router };
};

// A place as returned by the API.
export const makePlace = (overrides = {}) => ({
  _id: "64b0000000000000000000aa",
  owner: HOST.id,
  title: "Lakeside Cabin",
  address: "Naivasha, Nakuru",
  photos: ["https://img.example/1.jpg", "https://img.example/2.jpg", "https://img.example/3.jpg"],
  description: "Quiet cabin on the lake.",
  perks: ["Wifi", "Pets Allowed"],
  extraInfo: "No parties.",
  checkIn: "14:00",
  checkOut: "11:00",
  maxGuests: 4,
  price: 5000,
  ...overrides,
});

export const makeBooking = (overrides = {}) => ({
  _id: "64b0000000000000000000bb",
  owner: USER.id,
  place: makePlace(),
  checkIn: "2030-01-10T00:00:00.000Z",
  checkOut: "2030-01-13T00:00:00.000Z",
  guests: 2,
  name: "Amina",
  phoneNumber: "+254700000000",
  price: 15000,
  ...overrides,
});

export { makeFile } from "./files";
