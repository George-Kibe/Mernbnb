import { it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderApp } from "../test/utils";

// Own file: the destinations list is cached per page load (module state).
it("hides destination inspiration when it can't load", async () => {
  server.use(
    http.get("*/api/places", () => HttpResponse.json({ places: [], page: 1, limit: 12, total: 0, totalPages: 0 })),
    http.get("*/api/places/destinations", () => HttpResponse.json({ error: "down" }, { status: 500 })),
  );
  renderApp("/");
  await screen.findByText("No places to stay yet.");
  expect(screen.queryByText("Inspiration for future getaways")).not.toBeInTheDocument();
});
