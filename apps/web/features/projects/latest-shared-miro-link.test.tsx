import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { table: string; method: string; args: unknown[] }[]);
const rows = vi.hoisted(() => ({
  published_versions: [] as unknown[],
  publication_miro_links: [] as unknown[],
}));
/** A query builder per table that records its chain and resolves to that table's rows. */
const database = vi.hoisted(() => ({
  from: (table: keyof typeof rows) => {
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then")
            return (resolve: (value: unknown) => unknown) =>
              resolve({ data: rows[table], error: null });
          return (...args: unknown[]) => {
            calls.push({ table, method: String(property), args });
            return chain;
          };
        },
      },
    );
    return chain;
  },
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database, session: { user: { id: "agency" } } }),
}));

import { useLatestSharedMiroLink } from "./project-data";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useLatestSharedMiroLink", () => {
  it("reads the newest project-level client version's link", async () => {
    rows.published_versions = [
      { id: "v1", version_number: 1 },
      { id: "v2", version_number: 2 },
    ];
    rows.publication_miro_links = [
      { publication_id: "v1", board_id: "uXjVOld0001=", widget_id: "1" },
      { publication_id: "v2", board_id: "uXjVNew0001=", widget_id: "2" },
    ];
    const { result } = renderHook(() => useLatestSharedMiroLink("p", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ boardId: "uXjVNew0001=", widgetId: "2" });
    // Only project-level versions count: a deliverable's publication never prefills a shared one.
    expect(calls).toContainEqual({
      table: "published_versions",
      method: "is",
      args: ["deliverable_id", null],
    });
    expect(calls).toContainEqual({
      table: "published_versions",
      method: "eq",
      args: ["project_id", "p"],
    });
  });

  it("stays idle when disabled, so a designer never asks for client links", () => {
    calls.length = 0;
    const { result } = renderHook(() => useLatestSharedMiroLink("p", false), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(calls).toEqual([]);
  });
});
