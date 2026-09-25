import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const background = vi.hoisted(() => vi.fn());
vi.mock("@xyflow/react", () => ({
  BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
  Background: (props: Record<string, unknown>) => {
    background(props);
    return null;
  },
}));

import { CanvasBackground } from "./canvas-background";

describe("CanvasBackground", () => {
  it("draws the shared dot grid from the theme tokens", () => {
    render(<CanvasBackground />);
    expect(background).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "dots",
        gap: 24,
        size: 1.5,
        color: "var(--canvas-grid)",
        bgColor: "var(--canvas-background)",
      }),
    );
  });

  it("gives each mounted canvas its own pattern id", () => {
    render(
      <>
        <CanvasBackground />
        <CanvasBackground />
      </>,
    );
    const ids = background.mock.calls.map(([props]) => props.id);
    expect(new Set(ids).size).toBe(2);
  });
});
