import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { addMonths, format, startOfMonth } from "date-fns";
import { server } from "../../test/server";
import { renderWithRouter } from "../../test/utils";
import DateRangeCalendar from "./DateRangeCalendar";
import GuestsPanel from "./GuestsPanel";
import DestinationPanel from "./DestinationPanel";
import SearchBar from "./SearchBar";
import { EMPTY_SEARCH } from "../../lib/search";

const nextMonth = startOfMonth(addMonths(new Date(), 1));
const dayLabel = (day, month = nextMonth) => format(new Date(month.getFullYear(), month.getMonth(), day), "EEEE, MMMM d, yyyy");

describe("DateRangeCalendar", () => {
  const Harness = ({ months }) => {
    const [range, setRange] = useState({ checkIn: null, checkOut: null });
    return (
      <>
        <DateRangeCalendar months={months} checkIn={range.checkIn} checkOut={range.checkOut} onChange={setRange} />
        <output>{range.checkIn ? format(range.checkIn, "d") : "-"}/{range.checkOut ? format(range.checkOut, "d") : "-"}</output>
      </>
    );
  };

  it("picks a range, previews on hover and restarts on a third click", async () => {
    render(<Harness months={2} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: dayLabel(10, addMonths(nextMonth, 1)) }));
    await user.hover(screen.getByRole("button", { name: dayLabel(13, addMonths(nextMonth, 1)) }));
    await user.click(screen.getByRole("button", { name: dayLabel(13, addMonths(nextMonth, 1)) }));
    expect(screen.getByText("10/13")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: dayLabel(20, addMonths(nextMonth, 1)) }));
    expect(screen.getByText("20/-")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: dayLabel(5, addMonths(nextMonth, 1)) })); // before check-in: restart
    expect(screen.getByText("5/-")).toBeInTheDocument();
    await user.unhover(screen.getByRole("button", { name: dayLabel(5, addMonths(nextMonth, 1)) }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));
  });

  it("disables past days and the previous-month button on the current month", () => {
    render(<Harness months={1} />);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    const today = new Date();
    if (today.getDate() > 1) {
      expect(screen.getByRole("button", { name: format(new Date(today.getFullYear(), today.getMonth(), 1), "EEEE, MMMM d, yyyy") })).toBeDisabled();
    }
  });
});

describe("GuestsPanel", () => {
  it("steps counts within the rules", async () => {
    const Harness = () => {
      const [search, setSearch] = useState(EMPTY_SEARCH);
      return <GuestsPanel search={search} onChange={setSearch} />;
    };
    render(<Harness />);
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Decrease adults" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Increase pets" }));
    expect(screen.getByLabelText("1 adults")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease adults" })).toBeDisabled(); // pets need an adult
    await user.click(screen.getByRole("button", { name: "Decrease pets" }));
    await user.click(screen.getByRole("button", { name: "Decrease adults" }));
    expect(screen.getByLabelText("0 adults")).toBeInTheDocument();
  });
});

describe("DestinationPanel", () => {
  it("suggests, filters and explains empty results", async () => {
    const onPick = vi.fn();
    const destinations = [{ name: "Nairobi", count: 5 }, { name: "Kilifi", count: 1 }];
    const { rerender } = render(<DestinationPanel destinations={destinations} query="" onPick={onPick} />);
    expect(screen.getByText("Suggested destinations")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Kilifi/ }));
    expect(onPick).toHaveBeenCalledWith("Kilifi");
    rerender(<DestinationPanel destinations={destinations} query="nai" onPick={onPick} />);
    expect(screen.getByText("Destinations")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    rerender(<DestinationPanel destinations={destinations} query=" mars " onPick={onPick} />);
    expect(screen.getByText(/No stays match “mars” yet/)).toBeInTheDocument();
    rerender(<DestinationPanel destinations={[]} query="" onPick={onPick} />);
    expect(screen.getByText("Loading destinations…")).toBeInTheDocument();
  });
});

describe("SearchBar (desktop)", () => {
  beforeEach(() => {
    window.__mediaQueries.desktop = true;
    server.use(http.get("*/api/places/destinations", () => HttpResponse.json([{ name: "Kilifi", count: 4 }, { name: "Nairobi", count: 5 }])));
  });

  it("runs a full Where / When / Who search", async () => {
    const { router } = renderWithRouter(<SearchBar />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Anywhere" }));
    const where = screen.getByLabelText("Where");
    await waitFor(() => expect(where).toHaveFocus());
    expect(document.querySelector("body > div.fixed")).not.toBeNull(); // page dimmer
    await user.click(await within(screen.getByRole("search")).findByRole("option", { name: /Kilifi/ }));
    expect(where).toHaveValue("Kilifi");
    await user.click(screen.getByRole("button", { name: dayLabel(10) }));
    await user.click(screen.getByRole("button", { name: dayLabel(13) }));
    const search = screen.getByRole("search");
    expect(within(search).getByText(format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 10), "MMM d"))).toBeInTheDocument();
    await user.click(within(search).getByText("Who"));
    await user.click(within(screen.getByRole("search")).getByRole("button", { name: "Increase adults" }));
    await user.click(within(screen.getByRole("search")).getByRole("button", { name: "Increase infants" }));
    await user.click(within(search).getByRole("button", { name: "Search" }));
    const params = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(params)).toEqual({
      location: "Kilifi",
      checkin: format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 10), "yyyy-MM-dd"),
      checkout: format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 13), "yyyy-MM-dd"),
      adults: "1",
      infants: "1",
    });
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  it("shows the applied search in the pill and clears sections", async () => {
    const { router } = renderWithRouter(<SearchBar />, { path: "/?location=Nairobi&checkin=2030-01-10&checkout=2030-01-13&adults=2" });
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Nairobi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jan 10 – 13" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 guests" }));
    await user.click(screen.getByRole("button", { name: "Clear guests" }));
    await user.click(within(screen.getByRole("search")).getByText("Check in"));
    await user.click(screen.getByRole("button", { name: "Clear check-in and checkout dates" }));
    await user.click(within(screen.getByRole("search")).getByText("Check out")); // no check-in: goes to check-in
    await user.click(screen.getByLabelText("Where"));
    await user.click(screen.getByRole("button", { name: "Clear destination" }));
    await user.type(screen.getByLabelText("Where"), "Kwale{Enter}");
    expect(router.state.location.search).toBe("?location=Kwale");
  });

  it("clears only check-out, uses keyboard section activation, and closes on Escape or outside click", async () => {
    renderWithRouter(<SearchBar />, { path: "/?checkin=2030-01-10&checkout=2030-01-13" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Jan 10 – 13" }));
    const search = screen.getByRole("search");
    const checkOutSection = within(search).getByText("Check out").closest("[role=button]");
    checkOutSection.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Clear check-out date" }));
    expect(within(search).getAllByText("Add dates")).toHaveLength(1);
    await user.click(within(search).getByRole("button", { name: "Clear dates" })); // link under the calendar
    expect(within(search).getAllByText("Add dates")).toHaveLength(2);
    const who = within(search).getByText("Who").closest("[role=button]");
    fireEvent.keyDown(who, { key: "a" }); // ignored
    fireEvent.keyDown(who, { key: " " });
    expect(within(screen.getByRole("search")).getByRole("button", { name: "Increase adults" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add guests" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  it("searches everything when nothing is set", async () => {
    const { router } = renderWithRouter(<SearchBar />, { path: "/?page=3" });
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "Search" }));
    expect(router.state.location.search).toBe("");
  });
});

describe("SearchBar (phone)", () => {
  beforeEach(() => {
    window.__mediaQueries.desktop = false;
    server.use(http.get("*/api/places/destinations", () => HttpResponse.json([{ name: "Nairobi", count: 5 }])));
  });

  it("uses the full-screen sheet", async () => {
    const { router } = renderWithRouter(<SearchBar />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Where to\?/ }));
    const sheet = screen.getByRole("dialog", { name: "Search" });
    fireEvent.mouseDown(document.body); // outside clicks don't close the phone sheet
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Search destinations"), "nai");
    await user.click(await within(sheet).findByRole("option", { name: /Nairobi/ }));
    await user.click(within(sheet).getByRole("button", { name: "Next month" }));
    await user.click(within(sheet).getByRole("button", { name: dayLabel(3) }));
    await user.click(within(sheet).getByRole("button", { name: dayLabel(6) }));
    await user.click(within(sheet).getByRole("button", { name: /Who/ }));
    await user.click(within(sheet).getByRole("button", { name: "Increase adults" }));
    await user.click(within(sheet).getByRole("button", { name: /When/ }));
    await user.click(within(sheet).getByRole("button", { name: /Where/ }));
    await user.click(within(sheet).getByRole("button", { name: "Search" }));
    expect(new URLSearchParams(router.state.location.search).get("location")).toBe("Nairobi");
    expect(new URLSearchParams(router.state.location.search).get("adults")).toBe("1");
  });

  it("clears all, submits with Enter and closes", async () => {
    const { router } = renderWithRouter(<SearchBar />, { path: "/?location=Nairobi&adults=2" });
    const user = userEvent.setup();
    expect(screen.getByText("Any week · 2 guests")).toBeInTheDocument();
    const pill = screen.getByRole("button", { name: /Nairobi\s*Any week · 2 guests/ });
    await user.click(pill);
    const sheet = screen.getByRole("dialog", { name: "Search" });
    await user.click(within(sheet).getByRole("button", { name: "Clear all" }));
    expect(within(sheet).getByLabelText("Search destinations")).toHaveValue("");
    await user.click(within(sheet).getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    await user.click(pill);
    await user.type(within(screen.getByRole("dialog", { name: "Search" })).getByLabelText("Search destinations"), "{Enter}");
    expect(router.state.location.search).toBe("?location=Nairobi&adults=2");
  });
});
