import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  currentThemePreference,
  nextThemePreference,
  parseThemePreference,
  saveThemePreference,
  themeScript,
} from "./theme";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme preference", () => {
  it("reads missing and unknown values as system", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it("cycles system, light, dark and back to system", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("pins light or dark on the root and removes the pin for system", () => {
    applyThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(currentThemePreference()).toBe("dark");
    applyThemePreference("system");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(currentThemePreference()).toBe("system");
  });

  it("saves, applies and announces a choice", () => {
    const listener = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, listener);
    saveThemePreference("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    saveThemePreference("system");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
  });

  it("still applies a choice when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => saveThemePreference("dark")).not.toThrow();
    expect(currentThemePreference()).toBe("dark");
  });

  it("applies only a known stored choice from the head script", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(themeScript)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, "</script><script>alert(1)</script>");
    new Function(themeScript)();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });
});
