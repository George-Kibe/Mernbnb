import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  document.documentElement.className = "";
  document.body.style.overflow = "";
});
afterAll(() => server.close());

// Browser APIs jsdom doesn't implement.
const mediaListeners = new Set();
window.__mediaQueries = { dark: false, hover: true, desktop: true };
window.matchMedia = vi.fn((query) => ({
  get matches() {
    if (query.includes("prefers-color-scheme: dark")) return window.__mediaQueries.dark;
    if (query.includes("hover")) return window.__mediaQueries.hover;
    if (query.includes("min-width")) return window.__mediaQueries.desktop;
    return false;
  },
  media: query,
  addEventListener: (type, cb) => mediaListeners.add(cb),
  removeEventListener: (type, cb) => mediaListeners.delete(cb),
}));
window.__fireMediaChange = () => mediaListeners.forEach((cb) => cb());
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
let blobId = 0;
URL.createObjectURL = vi.fn(() => `blob:http://localhost/${++blobId}`);
URL.revokeObjectURL = vi.fn();
