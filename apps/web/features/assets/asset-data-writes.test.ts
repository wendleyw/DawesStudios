import { describe, expect, it, vi } from "vitest";
import { markProjectDelivered } from "./asset-data";

/** Unit tests for the write functions in `asset-data.ts`. */

type Result = { data: unknown; error: { message: string } | null };
type Call = { method: string; args: unknown[] };

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
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    database: { from, rpc } as never,
    calls,
    rpc,
  };
}

const ok: Result = { data: [], error: null };
const failure: Result = { data: null, error: { message: "permission denied" } };

describe("markProjectDelivered", () => {
  it("calls the mark_project_delivered procedure with the project id", async () => {
    const { database, rpc } = stubDatabase(ok);
    await markProjectDelivered(database, { projectId: "project-1" });
    expect(rpc).toHaveBeenCalledWith("mark_project_delivered", { p_project_id: "project-1" });
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase(failure);
    await expect(markProjectDelivered(database, { projectId: "project-1" })).rejects.toThrow(
      "permission denied",
    );
  });
});
