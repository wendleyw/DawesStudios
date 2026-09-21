import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markNotificationsRead } from "./workspace-data";

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
