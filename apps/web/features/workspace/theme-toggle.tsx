"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  currentThemePreference,
  nextThemePreference,
  parseThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "./theme";

const labels: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };
const icons = { system: Monitor, light: Sun, dark: Moon } as const;

function subscribe(onChange: () => void) {
  // Another tab's choice arrives as a storage event; apply it here too, then re-read.
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyThemePreference(parseThemePreference(event.newValue));
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

/**
 * One sidebar row showing the theme in force; each click moves to the next choice. The server
 * cannot know the stored choice, so it renders System and the real one appears after hydration.
 */
export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    currentThemePreference,
    (): ThemePreference => "system",
  );
  const Icon = icons[preference];
  return (
    <button
      type="button"
      className="nav-item"
      onClick={() => saveThemePreference(nextThemePreference(preference))}
    >
      <Icon size={17} />
      <span>Theme: {labels[preference]}</span>
    </button>
  );
}
