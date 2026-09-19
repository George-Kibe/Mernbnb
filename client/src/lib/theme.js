import { useSyncExternalStore } from "react";

// Theme preference: "light", "dark" or "system" (follow the OS).
// Stored per browser; index.html applies it before first paint so there's
// no flash of the wrong theme.
const STORAGE_KEY = "theme";
export const THEMES = ["light", "dark", "system"];

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)");

const readPreference = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : "system";
  } catch {
    return "system"; // storage blocked (private mode, etc.)
  }
};

let preference = readPreference();
const listeners = new Set();

const apply = () => {
  const dark = preference === "dark" || (preference === "system" && systemDark().matches);
  document.documentElement.classList.toggle("dark", dark);
};

export const setTheme = (next) => {
  if (!THEMES.includes(next)) return;
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not persisted, but still applied for this visit.
  }
  apply();
  listeners.forEach((listener) => listener());
};

// Follow OS changes while in "system" mode.
systemDark().addEventListener("change", () => {
  if (preference === "system") apply();
});
apply();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// [preference, setTheme]
export const useTheme = () => [useSyncExternalStore(subscribe, () => preference), setTheme];
