"use client";

import { Type } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  FONT_CHANGE_EVENT,
  FONT_STORAGE_KEY,
  applyFontPreference,
  currentFontPreference,
  nextFontPreference,
  parseFontPreference,
  saveFontPreference,
  type FontPreference,
} from "./font";

const labels: Record<FontPreference, string> = { geist: "Geist", editorial: "Editorial" };

function subscribe(onChange: () => void) {
  // Another tab's choice arrives as a storage event; apply it here too, then re-read.
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key !== FONT_STORAGE_KEY && event.key !== null) return;
    applyFontPreference(parseFontPreference(event.newValue));
    onChange();
  };
  window.addEventListener(FONT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(FONT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

/**
 * One sidebar row showing the type pairing in force; each click moves to the next one. The server
 * cannot know the stored choice, so it renders Geist and the real one appears after hydration.
 */
export function FontToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    currentFontPreference,
    (): FontPreference => "geist",
  );
  return (
    <button
      type="button"
      className="nav-item"
      onClick={() => saveFontPreference(nextFontPreference(preference))}
    >
      <Type size={17} />
      <span>Font: {labels[preference]}</span>
    </button>
  );
}
