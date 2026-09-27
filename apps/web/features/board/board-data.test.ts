import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  THUMBNAIL_TTL,
  addBoardWidget,
  moveProjectPosition,
  removeBoardWidget,
  saveBoardView,
  useProjectArtwork,
} from "./board-data";

const auth = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: auth.database,
    session: { user: { id: "viewer" } },
    profile: { role: "client" },
  }),
}));

function stubDatabase(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, update, eq, select, single };
}

describe("moveProjectPosition", () => {
  it("updates the project's stored board position by id", async () => {
    const database = stubDatabase({ data: { id: "project-1" }, error: null });
    await moveProjectPosition(database as never, {
      id: "project-1",
      position: { x: 120, y: 340 },
    });
    expect(database.from).toHaveBeenCalledWith("projects");
    expect(database.update).toHaveBeenCalledWith({ board_position: { x: 120, y: 340 } });
    expect(database.eq).toHaveBeenCalledWith("id", "project-1");
    expect(database.select).toHaveBeenCalledWith("id");
  });

  it("surfaces the database error message", async () => {
    const database = stubDatabase({ data: null, error: { message: "row not found" } });
    await expect(
      moveProjectPosition(database as never, { id: "project-1", position: { x: 0, y: 0 } }),
    ).rejects.toThrow("row not found");
  });
});

describe("THUMBNAIL_TTL", () => {
  // A signed storage URL outlives the assignment it was minted under, because the signature carries
  // no subject and no session. The TTL is the whole revocation window, so it is pinned here: the
  // board's thumbnails must not drift back above the longest expiry any other signing site uses.
  it("stays within the longest expiry the rest of the product signs with", () => {
    expect(THUMBNAIL_TTL).toBe(600);
  });
});

describe("saveBoardView", () => {
  it("persists a view for the current caller without accepting a user id", async () => {
    const database = { rpc: vi.fn().mockResolvedValue({ data: "calendar", error: null }) };
    expect(await saveBoardView(database as never, { clientId: "client-1", view: "calendar" })).toBe(
      "calendar",
    );
    expect(database.rpc).toHaveBeenCalledWith("save_board_view", {
      p_client_id: "client-1",
      p_active_view: "calendar",
    });
  });

  it("surfaces authorization failure so the component can retain and retry the intended choice", async () => {
    const database = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "Access removed" } }),
    };
    await expect(
      saveBoardView(database as never, { clientId: "client-1", view: "kanban" }),
    ).rejects.toThrow("Access removed");
  });
});

describe("board widget placement", () => {
  it("places a widget for a client", async () => {
    const single = vi.fn().mockResolvedValue({ data: { kind: "competitor_ads" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const database = { from: vi.fn().mockReturnValue({ insert }) };
    await addBoardWidget(database as never, { clientId: "client-1", kind: "competitor_ads" });
    expect(database.from).toHaveBeenCalledWith("client_board_widgets");
    expect(insert).toHaveBeenCalledWith({ client_id: "client-1", kind: "competitor_ads" });
  });

  it("removes a client's widget and reports a removal the database refused", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "No widget" } });
    const select = vi.fn().mockReturnValue({ single });
    const kindFilter = vi.fn().mockReturnValue({ select });
    const clientFilter = vi.fn().mockReturnValue({ eq: kindFilter });
    const database = {
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: clientFilter }) }),
    };
    await expect(
      removeBoardWidget(database as never, { clientId: "client-1", kind: "competitor_ads" }),
    ).rejects.toThrow("No widget");
    expect(clientFilter).toHaveBeenCalledWith("client_id", "client-1");
    expect(kindFilter).toHaveBeenCalledWith("kind", "competitor_ads");
  });
});

describe("useProjectArtwork pagination", () => {
  it("loads later deliverables and covers across bounded project-ID filters", async () => {
    const ids = Array.from(
      { length: 101 },
      (_, index) => `project-${String(index).padStart(3, "0")}`,
    );
    const deliverables = Array.from({ length: 1_101 }, (_, index) => ({
      id: `deliverable-${String(index).padStart(4, "0")}`,
      project_id: ids[index % ids.length],
      format: "feed",
      sort_order: index,
    }));
    const covers = ids.map((project_id) => ({
      project_id,
      storage_path: `${project_id}/cover.webp`,
    }));
    const calls: { table: string; ids: string[]; range?: [number, number] }[] = [];
    const signedPaths: string[][] = [];
    auth.database = {
      from: (table: string) => {
        const call: { table: string; ids: string[]; range?: [number, number] } = { table, ids: [] };
        calls.push(call);
        const chain = {
          select: () => chain,
          in: (_column: string, projectIds: string[]) => {
            call.ids = projectIds;
            return chain;
          },
          order: () => chain,
          range: (from: number, to: number) => {
            call.range = [from, to];
            return chain;
          },
          abortSignal: () => chain,
          then: (resolve: (result: { data: unknown[]; error: null }) => unknown) => {
            const source = table === "deliverables" ? deliverables : covers;
            const rows = source.filter((row) => call.ids.includes(row.project_id));
            return Promise.resolve({
              data: rows.slice(call.range?.[0] ?? 0, (call.range?.[1] ?? 0) + 1),
              error: null,
            }).then(resolve);
          },
        };
        return chain;
      },
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            signedPaths.push(paths);
            return {
              data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
              error: null,
            };
          },
        }),
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        {
          client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        },
        children,
      );

    const { result } = renderHook(() => useProjectArtwork(ids), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[ids[100]]).toEqual({
      url: `https://signed/${ids[100]}/cover.webp`,
      typeLabel: "Portrait Feed",
    });
    expect(Object.keys(result.current.data ?? {})).toHaveLength(101);
    expect(
      calls.filter((call) => call.table === "deliverables").map((call) => call.ids.length),
    ).toEqual([100, 100, 100, 1]);
    expect(calls.filter((call) => call.table === "deliverables").map((call) => call.range)).toEqual(
      [
        [0, 499],
        [500, 999],
        [1000, 1499],
        [0, 499],
      ],
    );
    expect(calls.every((call) => call.ids.length <= 100)).toBe(true);
    expect(signedPaths.map((paths) => paths.length)).toEqual([100, 1]);
  });
});
