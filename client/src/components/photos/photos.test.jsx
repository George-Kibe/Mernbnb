import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeFile } from "../../test/files";
import PhotoCarousel from "./PhotoCarousel";
import PhotoGrid from "./PhotoGrid";
import PhotoTour from "./PhotoTour";
import Lightbox from "./Lightbox";
import UploadedPhoto from "./UploadedPhoto";
import PhotoUploader from "./PhotoUploader";

const photos = (n) => Array.from({ length: n }, (_, i) => `https://img.example/${i + 1}.jpg`);
const S3_CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "*" };

// jsdom never loads images; this stand-in succeeds unless the URL says "broken".
class FakeImage {
  set src(value) {
    this._src = value;
    if (!value) return;
    queueMicrotask(() => (value.includes("broken") ? this.onerror?.() : this.onload?.()));
  }
  get src() { return this._src; }
}
let RealImage;
beforeEach(() => { RealImage = window.Image; window.Image = FakeImage; });
afterEach(() => { window.Image = RealImage; });

describe("PhotoCarousel", () => {
  it("pages with arrows and swipes, with a sliding window of dots", async () => {
    render(<a href="/place"><PhotoCarousel photos={photos(8)} alt="Cabin" /></a>);
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "Previous photo" })).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next photo" });
    const click = fireEvent.click(next); // arrow clicks don't follow the card link
    expect(click).toBe(false);
    for (let i = 0; i < 6; i++) await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    const track = screen.getAllByRole("img")[0].closest(".flex");
    const carousel = track.parentElement;
    fireEvent.touchStart(carousel, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 100 }] }); // swipe left: next
    fireEvent.touchStart(carousel, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 300 }] }); // swipe right: previous
    fireEvent.touchStart(carousel, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 110 }] }); // too small: ignored
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 110 }] }); // no start: ignored
    expect(track.style.transform).toBe("translateX(-600%)");
  });

  it("shows a placeholder without photos and no dots for one photo", () => {
    const { rerender } = render(<PhotoCarousel photos={[]} alt="x" />);
    expect(screen.getByText("No photos yet")).toBeInTheDocument();
    rerender(<PhotoCarousel photos={photos(1)} alt="x" />);
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
  });
});

describe("PhotoGrid", () => {
  it.each([1, 2, 3, 4, 5, 8])("lays out %i photo(s) and opens the tour", async (n) => {
    const onOpen = vi.fn();
    render(<PhotoGrid photos={photos(n)} title="Cabin" onOpen={onOpen} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Cabin — photo 1" })[0]);
    expect(onOpen).toHaveBeenCalledWith(0);
    expect(screen.queryAllByRole("button", { name: "Show all photos" })).toHaveLength(n > 1 ? 1 : 0);
  });

  it("tracks the phone strip position and handles no photos", () => {
    const { container, rerender } = render(<PhotoGrid photos={photos(3)} title="Cabin" onOpen={() => {}} />);
    const strip = container.querySelector(".snap-x");
    Object.defineProperty(strip, "clientWidth", { value: 300 });
    strip.scrollLeft = 600;
    fireEvent.scroll(strip);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    rerender(<PhotoGrid photos={[]} title="Cabin" onOpen={() => {}} />);
    expect(screen.getByText("No photos yet")).toBeInTheDocument();
  });

  it("uses the default empty list", () => {
    render(<PhotoGrid title="Cabin" onOpen={() => {}} />);
    expect(screen.getByText("No photos yet")).toBeInTheDocument();
  });
});

describe("PhotoTour and Lightbox", () => {
  it("opens the lightbox, pages with keys and closes layer by layer", async () => {
    const onClose = vi.fn();
    render(<PhotoTour photos={photos(5)} title="Cabin" startIndex={2} onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cabin — photo 2" }));
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    await user.keyboard("x");
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    await user.keyboard("{Escape}"); // closes only the lightbox
    expect(screen.queryByText("4 / 5")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("swipes in the lightbox and closes with the button", async () => {
    const onClose = vi.fn();
    render(<Lightbox photos={photos(3)} startIndex={0} title="Cabin" onClose={onClose} />);
    const stage = screen.getByAltText("Cabin — photo 1").parentElement;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.touchStart(stage, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 300 }] });
    fireEvent.touchStart(stage, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 120 }] });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("restores page scroll when the tour closes", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<PhotoTour photos={photos(2)} title="Cabin" onClose={() => {}} />);
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("UploadedPhoto", () => {
  it("shimmers, then shows the image", () => {
    render(<div className="relative"><UploadedPhoto url="https://img.example/a.jpg" alt="Photo" /></div>);
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
    fireEvent.load(screen.getByAltText("Photo"));
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("explains a photo that can't load", () => {
    render(<UploadedPhoto url="https://img.example/a.jpg" alt="Photo" />);
    fireEvent.error(screen.getByAltText("Photo"));
    expect(screen.getByText("Couldn’t load photo")).toBeInTheDocument();
  });

  it("probes the stored copy when showing a local preview", async () => {
    const onRemoteStatus = vi.fn();
    const { rerender } = render(<UploadedPhoto url="https://img.example/broken.jpg" preview="blob:local" alt="Photo" onRemoteStatus={onRemoteStatus} />);
    await waitFor(() => expect(onRemoteStatus).toHaveBeenCalledWith("https://img.example/broken.jpg", false));
    rerender(<UploadedPhoto url="https://img.example/ok.jpg" preview="blob:local" alt="Photo" onRemoteStatus={onRemoteStatus} />);
    await waitFor(() => expect(onRemoteStatus).toHaveBeenCalledWith("https://img.example/ok.jpg", true));
  });
});

describe("PhotoUploader", () => {
  const Harness = ({ initial = [], onUploadingChange }) => {
    const [list, setList] = useState(initial);
    return (
      <>
        <PhotoUploader photos={list} onChange={setList} toast={toast} onUploadingChange={onUploadingChange} />
        <output data-testid="list">{JSON.stringify(list)}</output>
      </>
    );
  };
  const toast = { error: vi.fn() };
  const list = () => JSON.parse(screen.getByTestId("list").textContent);
  const presignAndPut = ({ failKey } = {}) =>
    server.use(
      http.post("*/api/uploads/presign", async ({ request }) => {
        const { files } = await request.json();
        return HttpResponse.json(files.map((f, i) => ({ key: `k${i}`, uploadUrl: `https://s3.test/k${i}`, url: `https://cdn.test/k${i}-${f.size}.jpg` })), { status: 201 });
      }),
      http.options("https://s3.test/:key", () => new HttpResponse(null, { status: 200, headers: S3_CORS })),
      http.put("https://s3.test/:key", ({ params }) => new HttpResponse(null, { status: params.key === failKey ? 500 : 200, headers: S3_CORS })),
    );

  beforeEach(() => toast.error.mockReset());

  it("uploads picked files, shows local previews and reports rejected files", async () => {
    presignAndPut({ failKey: "k1" });
    const onUploadingChange = vi.fn();
    render(<Harness onUploadingChange={onUploadingChange} />);
    expect(screen.getByText("Drag your photos here")).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, [makeFile("a.jpg", "image/jpeg", "aaa"), makeFile("b.jpg", "image/jpeg", "bbbb"), makeFile("notes.txt", "text/plain")], { applyAccept: false });
    await waitFor(() => expect(list()).toHaveLength(1));
    expect(list()[0]).toMatch(/^https:\/\/cdn\.test\/k0-/);
    expect(toast.error).toHaveBeenCalledWith("notes.txt isn't a JPEG, PNG, WebP, AVIF or GIF image.");
    expect(toast.error).toHaveBeenCalledWith("b.jpg failed to upload.");
    expect(screen.getByAltText("Cover photo")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(onUploadingChange).toHaveBeenCalledWith(true);
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
  });

  it("ignores a pick with only invalid files and supports drag-and-drop of files", async () => {
    presignAndPut();
    render(<Harness />);
    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, [makeFile("x.txt", "text/plain")], { applyAccept: false });
    expect(list()).toEqual([]);
    const zone = screen.getByText("Drag your photos here").closest("div").parentElement;
    fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
    fireEvent.dragOver(zone, { dataTransfer: { types: ["text/plain"] } });
    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    fireEvent.drop(zone, { dataTransfer: { types: ["text/plain"], files: [] } });
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [makeFile("d.jpg", "image/jpeg", "dd")] } });
    await waitFor(() => expect(list()).toHaveLength(1));
  });

  it("reorders, makes a cover and deletes via the photo menu and drag", async () => {
    render(<Harness initial={photos(4)} />);
    const user = userEvent.setup();
    const menu = async (tile, label) => {
      await user.click(screen.getAllByRole("button", { name: "Photo options" })[tile]);
      await user.click(screen.getByRole("menuitem", { name: label }));
    };
    await menu(2, "Make cover photo");
    expect(list()[0]).toBe("https://img.example/3.jpg");
    await menu(0, "Move forward");
    expect(list().slice(0, 2)).toEqual(["https://img.example/1.jpg", "https://img.example/3.jpg"]);
    await menu(1, "Move backward");
    expect(list()[0]).toBe("https://img.example/3.jpg");
    await menu(3, "Delete");
    expect(list()).toHaveLength(3);

    const tiles = () => document.querySelectorAll('[draggable="true"]');
    fireEvent.dragStart(tiles()[2], { dataTransfer: { effectAllowed: "" } });
    fireEvent.dragOver(tiles()[0], { dataTransfer: {} });
    fireEvent.drop(tiles()[0], { dataTransfer: {} });
    fireEvent.dragEnd(tiles()[2]);
    expect(list()[0]).toBe("https://img.example/2.jpg");
    fireEvent.dragOver(tiles()[0], { dataTransfer: {} }); // no drag in progress
    fireEvent.drop(tiles()[0], { dataTransfer: { types: [] } });
    fireEvent.dragStart(tiles()[1], { dataTransfer: {} });
    fireEvent.drop(tiles()[1], { dataTransfer: {} }); // dropped on itself: no change
    expect(list()[0]).toBe("https://img.example/2.jpg");
  });

  it("closes the menu on Escape and outside clicks", async () => {
    render(<Harness initial={photos(2)} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Photo options" })[0]);
    await user.keyboard("a");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Photo options" })[1]);
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Photo options" })[1]);
    await user.click(screen.getAllByRole("button", { name: "Photo options" })[1]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("adds photos by link and reports failures", async () => {
    let fail = true;
    server.use(http.post("*/api/uploads/by-link", () => (fail
      ? HttpResponse.json({ error: "That link points to a private address." }, { status: 422 })
      : HttpResponse.json({ key: "k", url: "https://cdn.test/linked.jpg" }, { status: 201 }))));
    render(<Harness initial={photos(1)} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText("Or add a photo from a link");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(input, "http://127.0.0.1/x.png");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That link points to a private address."));
    fail = false;
    await user.clear(input);
    await user.type(input, "https://example.com/ok.jpg{Enter}");
    await waitFor(() => expect(list()).toContain("https://cdn.test/linked.jpg"));
    expect(input).toHaveValue("");
    await user.type(input, "a");
    await user.keyboard("{Shift>}{Shift/}");
  });

  it("warns when stored photos aren't viewable, and clears the warning on delete", async () => {
    presignAndPut();
    const probeFails = class extends FakeImage {
      set src(v) { this._src = v; if (v) queueMicrotask(() => this.onerror?.()); }
    };
    window.Image = probeFails;
    render(<Harness />);
    await userEvent.upload(document.querySelector('input[type="file"]'), [makeFile("a.jpg", "image/jpeg", "a")]);
    expect(await screen.findByText(/can’t be shown to guests yet/)).toBeInTheDocument();
    expect(screen.getByText("Not visible to guests")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Photo options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.queryByText(/can’t be shown to guests yet/)).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("nudges hosts toward five photos and treats a missing list as empty", async () => {
    const { rerender } = render(<PhotoUploader photos={photos(2)} onChange={() => {}} toast={toast} />);
    expect(screen.getByText(/Add 3 more to help guests/)).toBeInTheDocument();
    rerender(<PhotoUploader photos={photos(5)} onChange={() => {}} toast={toast} />);
    expect(screen.getByText("Ta-da! How does this look?")).toBeInTheDocument();
    rerender(<PhotoUploader photos={null} onChange={() => {}} toast={toast} />);
    expect(screen.getByText("Drag your photos here")).toBeInTheDocument();
  });

  it("opens the file picker from every entry point and revokes previews on unmount", async () => {
    presignAndPut();
    const { unmount } = render(<Harness initial={photos(1)} />);
    const input = document.querySelector('input[type="file"]');
    const click = vi.spyOn(input, "click");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add photos" }));
    await user.click(screen.getByRole("button", { name: "Add more" }));
    expect(click).toHaveBeenCalledTimes(2);
    await userEvent.upload(input, [makeFile("a.jpg", "image/jpeg", "a")]);
    await waitFor(() => expect(list()).toHaveLength(2));
    act(() => unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("uses the empty-state picker button and shows progress while uploading", async () => {
    let finish;
    server.use(
      http.post("*/api/uploads/presign", () => new Promise((resolve) => { finish = () => resolve(HttpResponse.json([{ key: "k0", uploadUrl: "https://s3.test/k0", url: "https://cdn.test/k0.jpg" }], { status: 201 })); })),
      http.options("https://s3.test/:key", () => new HttpResponse(null, { status: 200, headers: S3_CORS })),
      http.put("https://s3.test/:key", () => new HttpResponse(null, { status: 200, headers: S3_CORS })),
    );
    render(<Harness />);
    const input = document.querySelector('input[type="file"]');
    const click = vi.spyOn(input, "click");
    await userEvent.click(screen.getByRole("button", { name: "Upload from your device" }));
    expect(click).toHaveBeenCalled();
    await userEvent.upload(input, [makeFile("a.jpg", "image/jpeg", "a")]);
    expect(await screen.findByText(/Uploading… 0%/)).toBeInTheDocument();
    finish();
    await waitFor(() => expect(list()).toHaveLength(1));
    within(document.body);
  });
});
