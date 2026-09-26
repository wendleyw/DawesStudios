/**
 * The type pairing: `geist` is the product default (Geist and Geist Mono); `editorial` sets
 * headings and headline figures in Fraunces, text and controls in Inter, and data (counts,
 * balances, timecodes) and code in JetBrains Mono. The choice is kept in this
 * browser only. `app/layout.tsx` runs `fontScript` in `<head>`, so a saved choice is on
 * `<html data-font>` before the first paint; the `--font-*` tokens in `app/globals.css` read it.
 * Adding a pairing means one entry here, one `next/font` load and one token block.
 */
export type FontPreference = "geist" | "editorial";

export const FONT_STORAGE_KEY = "dawes-font";
/** Fired on `window` after this tab changes the font, so every reader re-renders. */
export const FONT_CHANGE_EVENT = "dawes-font-change";

const order: readonly FontPreference[] = ["geist", "editorial"];

export function parseFontPreference(value: unknown): FontPreference {
  return order.find((preference) => preference === value) ?? "geist";
}

/** The sidebar switch's order: Geist, Editorial, then Geist again. */
export function nextFontPreference(current: FontPreference): FontPreference {
  return order[(order.indexOf(current) + 1) % order.length];
}

export function currentFontPreference(root: HTMLElement = document.documentElement) {
  return parseFontPreference(root.dataset.font);
}

export function applyFontPreference(
  preference: FontPreference,
  root: HTMLElement = document.documentElement,
) {
  if (preference === "geist") delete root.dataset.font;
  else root.dataset.font = preference;
}

export function saveFontPreference(preference: FontPreference) {
  try {
    if (preference === "geist") window.localStorage.removeItem(FONT_STORAGE_KEY);
    else window.localStorage.setItem(FONT_STORAGE_KEY, preference);
  } catch {
    // Blocked storage (a private window, disabled site data) still gets the font for this page.
  }
  applyFontPreference(preference);
  window.dispatchEvent(new Event(FONT_CHANGE_EVENT));
}

/**
 * `parseFontPreference` and `applyFontPreference` in plain script, run before any bundle. It also
 * follows a change made in another tab on every page, including those without the sidebar switch.
 */
export const fontScript = `try{var f=document.documentElement,b=function(t){if(t==="editorial")f.dataset.font=t;else delete f.dataset.font};b(localStorage.getItem("${FONT_STORAGE_KEY}"));addEventListener("storage",function(e){if(e.key==="${FONT_STORAGE_KEY}"||e.key===null)b(e.newValue)})}catch(e){}`;
