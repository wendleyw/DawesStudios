// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriveIcon } from "./drive-icon";

describe("DriveIcon", () => {
  it("renders a decorative, sizable glyph", () => {
    const { container } = render(<DriveIcon size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
    expect(container.querySelectorAll("polygon")).toHaveLength(3);
  });

  it("defaults to size 16", () => {
    const { container } = render(<DriveIcon />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "16");
  });
});
