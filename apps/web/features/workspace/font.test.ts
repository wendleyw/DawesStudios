import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FONT_CHANGE_EVENT,
  FONT_STORAGE_KEY,
  applyFontPreference,
  currentFontPreference,
  fontScript,
  nextFontPreference,
  parseFontPreference,
  saveFontPreference,
} from "./font";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.font;
  vi.restoreAllMocks();
});

describe("font preference", () => {
  it("reads missing and unknown values as geist", () => {
    expect(parseFontPreference(null)).toBe("geist");
    expect(parseFontPreference("comic")).toBe("geist");
    expect(parseFontPreference("editorial")).toBe("editorial");
  });

  it("alternates geist and editorial", () => {
    expect(nextFontPreference("geist")).toBe("editorial");
    expect(nextFontPreference("editorial")).toBe("geist");
  });

  it("pins editorial on the root and removes the pin for geist", () => {
    applyFontPreference("editorial");
    expect(document.documentElement.dataset.font).toBe("editorial");
    expect(currentFontPreference()).toBe("editorial");
    applyFontPreference("geist");
    expect(document.documentElement).not.toHaveAttribute("data-font");
  });

  it("saves, applies and announces a choice", () => {
    const listener = vi.fn();
    window.addEventListener(FONT_CHANGE_EVENT, listener);
    saveFontPreference("editorial");
    expect(window.localStorage.getItem(FONT_STORAGE_KEY)).toBe("editorial");
    saveFontPreference("geist");
    expect(window.localStorage.getItem(FONT_STORAGE_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute("data-font");
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(FONT_CHANGE_EVENT, listener);
  });

  it("still applies a choice when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => saveFontPreference("editorial")).not.toThrow();
    expect(currentFontPreference()).toBe("editorial");
  });

  it("applies only a known stored choice from the head script and follows other tabs", () => {
    window.localStorage.setItem(FONT_STORAGE_KEY, "</script><script>alert(1)</script>");
    new Function(fontScript)();
    expect(document.documentElement).not.toHaveAttribute("data-font");
    window.localStorage.setItem(FONT_STORAGE_KEY, "editorial");
    new Function(fontScript)();
    expect(document.documentElement.dataset.font).toBe("editorial");
    window.dispatchEvent(new StorageEvent("storage", { key: FONT_STORAGE_KEY, newValue: null }));
    expect(document.documentElement).not.toHaveAttribute("data-font");
  });
});
