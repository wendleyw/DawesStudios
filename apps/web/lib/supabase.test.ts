import { describe, expect, it, vi } from "vitest";
import { callAuth, describeSupabaseError } from "./supabase";

describe("describeSupabaseError", () => {
  it("replaces a browser transport failure with a sentence a person can act on", () => {
    // The exact strings Chromium/Firefox and Safari produce when the request never left the machine.
    expect(describeSupabaseError({ message: "TypeError: Failed to fetch" })).toMatch(
      /connection failed/i,
    );
    expect(describeSupabaseError({ message: "Load failed" })).toMatch(/connection failed/i);
  });

  it("passes a real server message through untouched", () => {
    expect(describeSupabaseError({ message: "Invalid login credentials" })).toBe(
      "Invalid login credentials",
    );
  });
});

describe("callAuth", () => {
  it("resolves with the call's own result when it settles", async () => {
    await expect(callAuth(Promise.resolve({ error: null }))).resolves.toEqual({ error: null });
  });

  it("rejects with the transport sentence when the call never settles", async () => {
    vi.useFakeTimers();
    try {
      // `updateUser` refreshes the session first, and offline that refresh retries forever — the
      // promise below stands in for it. Without the bound, the form sits on "Updating…" with its
      // button disabled and nothing to act on.
      const pending = callAuth(new Promise<{ error: null }>(() => {}));
      const assertion = expect(pending).rejects.toThrow(/connection failed/i);
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
