import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReviews } from "./review-data";

const auth = vi.hoisted(() => ({
  database: {} as unknown,
  session: { user: { id: "viewer" } },
  profile: { role: "agency" },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

type Call = { table: string; method: string; args: unknown[] };

/**
 * A chainable, awaitable query builder per table that records every call; `rowsFor` decides what
 * each finished chain resolves to from the table and its recorded calls.
 */
function stubDatabase(rowsFor: (table: string, calls: Call[]) => unknown[]) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const own: Call[] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "in", "is", "not", "order"])
      builder[method] = (...args: unknown[]) => {
        const call = { table, method, args };
        own.push(call);
        calls.push(call);
        return builder;
      };
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rowsFor(table, own), error: null }).then(resolve);
    return builder;
  };
  auth.database = { from };
  return calls;
}

const projects = [{ id: "p1", title: "Launch", status: "in_progress", activity: "active" }];
const rounds = [
  {
    id: "request2",
    project_id: "p1",
    board_id: "b1",
    sequence: 2,
    kind: "initial",
    outcome: "submitted",
    current: true,
    round_id: "r2",
    round: { version_number: 2, notes: "Second" },
    created_at: "2026-09-22T00:00:00Z",
  },
];
const clientVersions = [
  {
    id: "v1",
    project_id: "p1",
    version_number: 1,
    published_at: "2026-09-18T00:00:00Z",
    release_note: "One",
    publication_reviews: { status: "changes_requested", reviewed_by: "ana", reviewed_at: "x" },
  },
  {
    id: "v2",
    project_id: "p1",
    version_number: 2,
    published_at: "2026-09-21T00:00:00Z",
    release_note: "Two",
    publication_reviews: null,
  },
];

function rowsFor(table: string) {
  if (table === "projects") return projects;
  if (table === "design_boards") return [{ id: "b1", name: "Hero banner" }];
  if (table === "published_versions") return clientVersions;
  if (table === "board_work_requests") return rounds;
  return [];
}

function renderReviews() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useReviews("c1"), { wrapper });
}

const has = (calls: Call[], table: string, method: string, ...args: unknown[]) =>
  calls.some(
    (call) =>
      call.table === table &&
      call.method === method &&
      JSON.stringify(call.args) === JSON.stringify(args),
  );

beforeEach(() => {
  auth.profile.role = "agency";
});

describe("useReviews", () => {
  it("gives the agency the latest client version and each current submitted request", async () => {
    const calls = stubDatabase(rowsFor);
    const { result } = renderReviews();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "r2", label: "Hero banner · Round 2", internal: true }),
      expect.objectContaining({ id: "v2", label: "V2", status: "pending", internal: false }),
    ]);
    expect(has(calls, "board_work_requests", "eq", "current", true)).toBe(true);
    expect(
      calls.some((call) => call.method === "select" && String(call.args[0]).includes("*")),
    ).toBe(false);
  });

  it("gives a client only client versions, with the decision", async () => {
    auth.profile.role = "client";
    const calls = stubDatabase(rowsFor);
    const { result } = renderReviews();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((row) => [row.id, row.label, row.internal])).toEqual([
      ["v2", "V2", false],
    ]);
    expect(calls.some((call) => call.table === "design_versions")).toBe(false);
    expect(calls.some((call) => call.table === "design_boards")).toBe(false);
  });

  it("gives a designer the latest round of each board, labelled by board name", async () => {
    auth.profile.role = "designer";
    const calls = stubDatabase(rowsFor);
    const { result } = renderReviews();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "r2", label: "Hero banner · Round 2", status: "submitted" }),
    ]);
    expect(calls.some((call) => call.table === "published_versions")).toBe(false);
  });
});
