// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markSignInIntro, SignInIntro } from "./sign-in-intro";

const auth = vi.hoisted(() => ({ loading: true, session: null as object | null }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    loading: auth.loading,
    session: auth.session,
    profile: auth.session ? { role: "agency" } : null,
    error: null,
  }),
}));

let reducedMotion = false;
const play = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  auth.loading = true;
  auth.session = null;
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const intro = (container: HTMLElement) => container.querySelector(".sign-in-intro");

describe("SignInIntro", () => {
  it("stays away without a sign-in, so reloads and navigation open the workspace directly", () => {
    const { container } = render(<SignInIntro />);
    expect(intro(container)).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it("plays the silent mark once after a sign-in, as decoration", () => {
    markSignInIntro();
    const { container } = render(<SignInIntro />);
    expect(intro(container)).toHaveAttribute("aria-hidden", "true");
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("src", "/brand/intro.webm");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("holds the finished mark until the workspace has loaded, then fades out and clears", () => {
    markSignInIntro();
    const { container, rerender } = render(<SignInIntro />);
    fireEvent.ended(container.querySelector("video")!);
    expect(intro(container)).not.toHaveClass("leaving");

    auth.loading = false;
    auth.session = {};
    rerender(<SignInIntro />);
    expect(intro(container)).toHaveClass("leaving");
    act(() => vi.advanceTimersByTime(400));
    expect(intro(container)).toBeNull();
    expect(sessionStorage.getItem("dawes:intro-after-sign-in")).toBeNull();
  });

  it("is skipped by a key press", () => {
    markSignInIntro();
    const { container } = render(<SignInIntro />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(intro(container)).toHaveClass("leaving");
  });

  it("never keeps the workspace covered when the video stalls", () => {
    markSignInIntro();
    const { container } = render(<SignInIntro />);
    act(() => vi.advanceTimersByTime(6_000));
    expect(intro(container)).toHaveClass("leaving");
  });

  it("does not play with reduced motion", () => {
    reducedMotion = true;
    markSignInIntro();
    const { container } = render(<SignInIntro />);
    expect(intro(container)).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});
