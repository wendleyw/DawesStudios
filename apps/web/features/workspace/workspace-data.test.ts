import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  designerDueDate,
  markNotificationsRead,
  unreadNotificationCount,
  useProjects,
  withDesignerDueDates,
  type Project,
} from "./workspace-data";

const auth = vi.hoisted(() => ({ database: null as unknown, role: "agency" }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: auth.database,
    session: { user: { id: "viewer" } },
    profile: { role: auth.role },
  }),
}));

type Result = { data: unknown; error: { message: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * A database whose query builder records every call in order and resolves to `result` when
 * awaited, mirroring the stub in `features/projects/project-data.test.ts`.
 */
function stubDatabase(result: Result) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return (resolve: (value: Result) => unknown) => resolve(result);
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });
          return chain;
        };
      },
    },
  );
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return chain;
  });
  return { database: { from } as never, calls };
}

const ok: Result = { data: null, error: null };

describe("markNotificationsRead", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks every unread notification for the caller when no id is given", async () => {
    const { database, calls } = stubDatabase(ok);
    await markNotificationsRead(database, { userId: "user-1" });
    expect(calls).toEqual([
      { method: "from", args: ["notifications"] },
      { method: "update", args: [{ read_at: "2026-09-20T12:00:00.000Z" }] },
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "is", args: ["read_at", null] },
    ]);
  });

  it("marks only the given notification when an id is given", async () => {
    const { database, calls } = stubDatabase(ok);
    await markNotificationsRead(database, { userId: "user-1", id: "notification-1" });
    expect(calls).toEqual([
      { method: "from", args: ["notifications"] },
      { method: "update", args: [{ read_at: "2026-09-20T12:00:00.000Z" }] },
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "is", args: ["read_at", null] },
      { method: "eq", args: ["id", "notification-1"] },
    ]);
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(markNotificationsRead(database, { userId: "user-1" })).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("unreadNotificationCount", () => {
  it("asks the database for an exact count of the caller's unread notifications, without rows", async () => {
    const select = vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ count: 271, error: null }),
    });
    const database = { from: vi.fn().mockReturnValue({ select }) };
    expect(await unreadNotificationCount(database as never)).toBe(271);
    expect(database.from).toHaveBeenCalledWith("notifications");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("surfaces a failed count", async () => {
    const database = {
      from: () => ({
        select: () => ({
          is: vi.fn().mockResolvedValue({ count: null, error: { message: "offline" } }),
        }),
      }),
    };
    await expect(unreadNotificationCount(database as never)).rejects.toThrow("offline");
  });
});

describe("a designer's due date", () => {
  it("takes the earlier of the project's date and the board's", () => {
    expect(designerDueDate("2026-10-10", "2026-10-06")).toBe("2026-10-06");
    expect(designerDueDate("2026-10-01", "2026-10-06")).toBe("2026-10-01");
    expect(designerDueDate(null, "2026-10-06")).toBe("2026-10-06");
    expect(designerDueDate("2026-10-10", null)).toBe("2026-10-10");
    expect(designerDueDate(null, null)).toBeNull();
  });

  it("uses the earliest of the designer's boards on each project", () => {
    const project = (id: string, due_date: string | null) => ({ id, due_date }) as Project;
    const projects = [project("a", "2026-10-10"), project("b", null), project("c", "2026-10-10")];
    const result = withDesignerDueDates(projects, [
      { project_id: "a", due_date: "2026-10-08" },
      { project_id: "a", due_date: "2026-10-04" },
      { project_id: "b", due_date: "2026-11-01" },
    ]);
    expect(result.map((item) => item.due_date)).toEqual(["2026-10-04", "2026-11-01", "2026-10-10"]);
    // A project without a board date keeps its own object.
    expect(result[2]).toBe(projects[2]);
  });
});

describe("useProjects pagination", () => {
  afterEach(() => {
    auth.role = "agency";
  });

  it("loads and orders more than 1,000 projects within the selected client", async () => {
    const projects = Array.from({ length: 1_201 }, (_, index) => ({
      id: `project-${String(1_200 - index).padStart(4, "0")}`,
      client_id: "client-1",
      created_at: "2026-09-27T00:00:00Z",
    }));
    const calls: {
      table: string;
      clientId?: string;
      range?: [number, number];
      orders: string[];
    }[] = [];
    auth.database = {
      from: (table: string) => {
        const call: {
          table: string;
          clientId?: string;
          range?: [number, number];
          orders: string[];
        } = { table, orders: [] };
        calls.push(call);
        const chain = {
          select: () => chain,
          eq: (_column: string, value: string) => {
            call.clientId = value;
            return chain;
          },
          order: (column: string) => {
            call.orders.push(column);
            return chain;
          },
          range: (from: number, to: number) => {
            call.range = [from, to];
            return chain;
          },
          abortSignal: () => chain,
          then: (resolve: (result: { data: typeof projects; error: null }) => unknown) =>
            Promise.resolve({
              data: projects.slice(call.range?.[0] ?? 0, (call.range?.[1] ?? 0) + 1),
              error: null,
            }).then(resolve),
        };
        return chain;
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

    const { result } = renderHook(() => useProjects("client-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((project) => project.id)).toEqual(
      projects.map((project) => project.id),
    );
    expect(calls.map((call) => call.range)).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
    expect(calls.every((call) => call.clientId === "client-1")).toBe(true);
    expect(calls.every((call) => call.orders.join(",") === "created_at,id")).toBe(true);
  });

  it("surfaces a database failure on a later page", async () => {
    let page = 0;
    auth.database = {
      from: () => {
        const chain = {
          select: () => chain,
          order: () => chain,
          range: () => chain,
          abortSignal: () => chain,
          then: (resolve: (value: Result) => unknown) => {
            page += 1;
            return Promise.resolve(
              page === 1
                ? {
                    data: Array.from({ length: 500 }, (_, index) => ({ id: `project-${index}` })),
                    error: null,
                  }
                : { data: null, error: { message: "later page failed" } },
            ).then(resolve);
          },
        };
        return chain;
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

    const { result } = renderHook(() => useProjects(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("later page failed");
    expect(page).toBe(2);
  });
});
