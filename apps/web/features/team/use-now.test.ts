import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./use-now";

describe("useNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the mount-time clock until the interval elapses, then refreshes it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current).toBe(new Date("2026-09-26T12:00:00.000Z").getTime());

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current).toBe(new Date("2026-09-26T12:00:00.000Z").getTime());

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(new Date("2026-09-26T12:01:00.000Z").getTime());
  });

  it("stops refreshing once unmounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
    const { result, unmount } = renderHook(() => useNow(60_000));
    unmount();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toBe(new Date("2026-09-26T12:00:00.000Z").getTime());
  });
});
