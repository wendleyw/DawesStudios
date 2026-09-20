import { describe, expect, it } from "vitest";
import { FIT_PAD, fitToContent } from "./canvas-fit";

const view = { width: 1400, height: 900 };
const board = { minZoom: 0.4, constrainHeight: true };
const list = { minZoom: 0.7, constrainHeight: false };

describe("fitting a canvas to its content", () => {
  it("shows the whole content when it is larger than the view", () => {
    const content = { width: 2800, height: 1200 };
    const fit = fitToContent(content, view, board);
    expect(content.width * fit.zoom).toBeLessThanOrEqual(view.width - FIT_PAD * 2 + 1);
    expect(content.height * fit.zoom).toBeLessThanOrEqual(view.height - FIT_PAD * 2 + 1);
  });

  it("lets height constrain the fit only when the surface asks for it", () => {
    // The same tall content: a board shrinks to show it, a list keeps its width and scrolls.
    const tall = { width: 600, height: 4000 };
    expect(fitToContent(tall, view, board).zoom).toBeLessThan(1);
    expect(fitToContent(tall, view, list).zoom).toBe(1);
  });

  it("stops at the scale each surface says is still worth reading", () => {
    expect(fitToContent({ width: 40000, height: 40000 }, view, board).zoom).toBe(board.minZoom);
    expect(fitToContent({ width: 40000, height: 100 }, view, list).zoom).toBe(list.minZoom);
  });

  it("never magnifies small content past its natural size", () => {
    const fit = fitToContent({ width: 400, height: 300 }, view, board);
    expect(fit.zoom).toBe(1);
    expect(fit.x).toBe(Math.round((view.width - 400) / 2));
  });

  it("keeps the content on screen rather than pushing it off to centre it", () => {
    const fit = fitToContent({ width: 20000, height: 400 }, view, board);
    expect(fit.x).toBeGreaterThanOrEqual(FIT_PAD);
    expect(fit.y).toBe(FIT_PAD);
  });

  it("pins the top on every surface, so a fit never starts mid-content", () => {
    expect(fitToContent({ width: 900, height: 5000 }, view, board).y).toBe(FIT_PAD);
    expect(fitToContent({ width: 900, height: 5000 }, view, list).y).toBe(FIT_PAD);
  });

  it("returns a usable viewport before anything has been measured", () => {
    expect(fitToContent({ width: 0, height: 0 }, view, board)).toEqual({
      x: FIT_PAD,
      y: FIT_PAD,
      zoom: 1,
    });
    expect(fitToContent({ width: 900, height: 900 }, { width: 0, height: 0 }, list).zoom).toBe(1);
  });
});
