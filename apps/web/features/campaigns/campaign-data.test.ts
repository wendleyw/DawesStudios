import { describe, expect, it, vi } from "vitest";
import { createCampaign } from "./campaign-data";

type Result = { data: unknown; error: { message: string } | null };
type Call = { method: string; args: unknown[] };

/** Copies the Proxy-based call-recording stub from `features/projects/project-data.test.ts`. */
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

const row: Result = { data: { id: "campaign-1" }, error: null };

describe("createCampaign", () => {
  it("inserts a campaign scoped to its client and selects the new id", async () => {
    const { database, calls } = stubDatabase(row);
    await createCampaign(database, {
      clientId: "client-1",
      title: "Fall launch",
      description: "Autumn push",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
    });
    expect(calls).toEqual([
      { method: "from", args: ["campaigns"] },
      {
        method: "insert",
        args: [
          {
            client_id: "client-1",
            title: "Fall launch",
            description: "Autumn push",
            start_date: "2026-09-01",
            end_date: "2026-10-01",
          },
        ],
      },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(
      createCampaign(database, {
        clientId: "client-1",
        title: "Fall launch",
        description: "",
        startDate: null,
        endDate: null,
      }),
    ).rejects.toThrow("permission denied");
  });
});
