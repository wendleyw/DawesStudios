import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FONT_STORAGE_KEY } from "./font";
import { FontToggle } from "./font-toggle";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.font;
});

describe("FontToggle", () => {
  it("shows the pairing in force and alternates Geist and Editorial", async () => {
    const user = userEvent.setup();
    render(<FontToggle />);
    const toggle = screen.getByRole("button", { name: "Font: Geist" });
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName("Font: Editorial");
    expect(document.documentElement.dataset.font).toBe("editorial");
    expect(window.localStorage.getItem(FONT_STORAGE_KEY)).toBe("editorial");
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName("Font: Geist");
    expect(document.documentElement).not.toHaveAttribute("data-font");
  });

  it("follows a change made in another tab", () => {
    render(<FontToggle />);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: FONT_STORAGE_KEY, newValue: "editorial" }),
      );
    });
    expect(screen.getByRole("button", { name: "Font: Editorial" })).toBeInTheDocument();
  });
});
