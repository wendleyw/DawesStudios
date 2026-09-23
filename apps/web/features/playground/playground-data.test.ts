import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePlaygroundItem, savePlaygroundItem, usePlayground } from "./playground-data";
import type { PlaygroundItemInput, PlaygroundScope } from "./playground-types";

const auth = vi.hoisted(() => ({
  database: {} as unknown,
  session: { user: { id: "viewer" } },
  profile: { role: "client" },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

const note: PlaygroundItemInput = {
  id: "note",
  kind: "note",
  title: "Project note",
  body: "Keep this draft",
  asset_path: null,
  mime_type: null,
  x: 0,
  y: 0,
  width: 280,
  height: 180,
};
const queryClients: QueryClient[] = [];

function renderPlayground(scope: PlaygroundScope) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClients.push(client);
  return renderHook((currentScope: PlaygroundScope) => usePlayground(currentScope), {
    initialProps: scope,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

function databaseStub() {
  const rpc = vi.fn(async (name: string, args: { p_project_id?: string }) => ({
    data: name === "get_playground_board" ? `${args.p_project_id}-${auth.profile.role}` : [],
    error: null,
  }));
  const from = vi.fn(() => ({
    select: () => ({
      eq: (_field: string, boardId: string) => ({
        order: () => ({
          order: async () => ({
            data: [{ ...note, board_id: boardId, revision: 1 }],
            error: null,
          }),
        }),
      }),
    }),
  }));
  return { rpc, from };
}

beforeEach(() => {
  auth.profile.role = "client";
  auth.database = databaseStub();
});
afterEach(() => {
  queryClients.splice(0).forEach((client) => client.clear());
});

describe("usePlayground", () => {
  it("resolves the explicit project and keeps another project out of its cache", async () => {
    const database = databaseStub();
    auth.database = database;
    const { result, rerender } = renderPlayground({ clientId: "workspace", projectId: "first" });
    await waitFor(() => expect(result.current.data?.boardId).toBe("first-client"));

    rerender({ clientId: "workspace", projectId: "second" });
    await waitFor(() => expect(result.current.data?.boardId).toBe("second-client"));
    expect(result.current.data?.items[0].board_id).toBe("second-client");
    expect(database.rpc).toHaveBeenCalledWith("get_playground_board", {
      p_client_id: "workspace",
      p_project_id: "second",
    });

    rerender({ clientId: "workspace", projectId: "first" });
    await waitFor(() => expect(result.current.data?.boardId).toBe("first-client"));
  });

  it("keeps role changes out of the previous role's project cache", async () => {
    const scope = { clientId: "workspace", projectId: "project" };
    const { result, rerender } = renderPlayground(scope);
    await waitFor(() => expect(result.current.data?.boardId).toBe("project-client"));

    auth.profile.role = "agency";
    rerender(scope);
    await waitFor(() => expect(result.current.data?.boardId).toBe("project-agency"));
    expect(result.current.data?.items[0].board_id).toBe("project-agency");
  });

  it("does not automatically resolve an obsolete workspace-only consumer", () => {
    const database = databaseStub();
    auth.database = database;
    const { result } = renderPlayground({ clientId: "workspace" } as PlaygroundScope);

    expect(result.current.fetchStatus).toBe("idle");
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("surfaces scope denial without reading items or attempting file cleanup", async () => {
    const database = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "Playground access required" },
      }),
      from: vi.fn(),
    };
    auth.database = database;
    const { result } = renderPlayground({ clientId: "workspace", projectId: "revoked" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "42501" });
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("Playground writes", () => {
  it("preserves conflict codes so the component retains the failed draft", async () => {
    const database = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PT409", message: "This item changed elsewhere." },
      }),
    };
    await expect(
      savePlaygroundItem(database as never, {
        boardId: "project-board",
        item: note,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "PT409", message: "This item changed elsewhere." });
    expect(note.body).toBe("Keep this draft");
  });

  it("does not attempt Storage cleanup after a legacy board deletion is refused", async () => {
    const storage = { from: vi.fn() };
    const database = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "Playground access required" },
      }),
      storage,
    };
    await expect(
      deletePlaygroundItem(database as never, {
        boardId: "legacy-board",
        itemId: "legacy-item",
        expectedRevision: 1,
        assetPath: "legacy-file",
      }),
    ).rejects.toMatchObject({ code: "42501" });
    expect(storage.from).not.toHaveBeenCalled();
  });
});
