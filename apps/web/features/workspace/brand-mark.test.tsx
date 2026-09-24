// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandMark } from "./brand-mark";

let reducedMotion = false;
const play = vi.fn();

beforeEach(() => {
  reducedMotion = false;
  play.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => vi.restoreAllMocks());

describe("BrandMark", () => {
  it("plays the silent mark animation once, as decoration", () => {
    const { container } = render(<BrandMark />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("src", "/brand/logo-mark.webm");
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(false);
    expect(video).toHaveAttribute("playsinline");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shows the finished mark still when motion is reduced", () => {
    reducedMotion = true;
    const { container } = render(<BrandMark />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/brand/logo-mark.webp");
    expect(play).not.toHaveBeenCalled();
  });

  it("falls back to the finished mark still when the video cannot play", () => {
    const { container } = render(<BrandMark />);
    fireEvent.error(container.querySelector("video")!);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/brand/logo-mark.webp");
  });
});
