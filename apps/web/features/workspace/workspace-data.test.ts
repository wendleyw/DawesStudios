import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  designerDueDate,
  markNotificationsRead,
  unreadNotificationCount,
  withDesignerDueDates,
  type Project,
} from "./workspace-data";

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
