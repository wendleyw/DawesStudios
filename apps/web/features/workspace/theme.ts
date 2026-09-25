/**
 * The colour theme: `system` follows the operating system, `light` and `dark` pin one. The choice
 * is kept in this browser only. `app/layout.tsx` runs `themeScript` in `<head>`, so a saved choice
 * is on `<html data-theme>` before the first paint. That attribute is the single source of truth
 * for the page: `color-scheme` in `app/globals.css` reads it, and so does the sidebar switch.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "dawes-theme";
/** Fired on `window` after this tab changes the theme, so every reader re-renders. */
export const THEME_CHANGE_EVENT = "dawes-theme-change";

const order: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseThemePreference(value: unknown): ThemePreference {
  return order.find((preference) => preference === value) ?? "system";
}

/** The sidebar switch's order: System, Light, Dark, then System again. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  return order[(order.indexOf(current) + 1) % order.length];
}

export function currentThemePreference(root: HTMLElement = document.documentElement) {
  return parseThemePreference(root.dataset.theme);
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
) {
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Blocked storage (a private window, disabled site data) still gets the theme for this page.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** `parseThemePreference` and `applyThemePreference` in plain script, run before any bundle. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
