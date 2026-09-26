import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useProfile } from "./auth-data";

// Mirrors playground-data.test.ts's own createElement wrapper: this file stays .ts, like its
// return-path.test.ts sibling, rather than .tsx.
function renderProfile(row: Record<string, unknown>) {
  const database = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useProfile(database as never, { user: { id: "viewer" } } as never), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useProfile", () => {
  it("locks out a profile with removed_at set", async () => {
    const { result } = renderProfile({
      id: "viewer",
      display_name: "Removed Member",
      role: "client",
      avatar_url: null,
      removed_at: "2026-01-01T00:00:00Z",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("Your studio access has been removed."));
  });

  it("resolves the profile normally when removed_at is not set", async () => {
    const { result } = renderProfile({
      id: "viewer",
      display_name: "Active Member",
      role: "client",
      avatar_url: null,
      removed_at: null,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toMatchObject({ display_name: "Active Member", removed_at: null });
  });
});
