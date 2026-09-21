import { describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  revokeInvitation,
  saveCampaign,
  saveClient,
  saveServicePreset,
  saveWorkspaceSettings,
  updateProfile,
} from "./settings-data";

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * A database whose query builder records every call in order and resolves to `result` when awaited.
 * Copied from `features/projects/project-data.test.ts`: recording the whole chain is what proves a
 * relocated query still issues the same table, columns, filters and order it did in the component.
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
  const rpc = vi.fn().mockResolvedValue(result);
  return { database: { from, rpc } as never, calls, rpc };
}

const ok: Result = { data: [], error: null };
const row: Result = { data: { id: "row-1" }, error: null };

describe("team writes", () => {
  it("revokes an invitation by id", async () => {
    const { database, rpc } = stubDatabase(ok);
    await revokeInvitation(database, { invitationId: "invitation-1" });
    expect(rpc).toHaveBeenCalledWith("revoke_invitation", { p_invitation_id: "invitation-1" });
  });
});

describe("client writes", () => {
  it("updates a client's own details", async () => {
    const { database, calls } = stubDatabase(row);
    await saveClient(database, {
      mode: "update",
      id: "client-1",
      name: "Harbor & Pine",
      industry: "Retail",
      website: "https://example.test",
      description: "A studio partner.",
    });
    expect(calls).toEqual([
      { method: "from", args: ["clients"] },
      {
        method: "update",
        args: [
          {
            name: "Harbor & Pine",
            industry: "Retail",
            website: "https://example.test",
            description: "A studio partner.",
          },
        ],
      },
      { method: "eq", args: ["id", "client-1"] },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("creates a client through the create_client procedure", async () => {
    const { database, rpc } = stubDatabase(ok);
    await saveClient(database, {
      mode: "create",
      name: "Harbor & Pine",
      slug: "harbor-pine",
      industry: "Retail",
      initialCredits: 50,
    });
    expect(rpc).toHaveBeenCalledWith("create_client", {
      p_name: "Harbor & Pine",
      p_slug: "harbor-pine",
      p_industry: "Retail",
      p_initial_credits: 50,
    });
  });
});

describe("campaign writes", () => {
  it("updates a campaign scoped to its client", async () => {
    const { database, calls } = stubDatabase(row);
    await saveCampaign(database, {
      mode: "update",
      id: "campaign-1",
      clientId: "client-1",
      title: "Autumn launch",
      description: "Seasonal push",
      startDate: "2026-09-01",
      endDate: null,
    });
    expect(calls).toEqual([
      { method: "from", args: ["campaigns"] },
      {
        method: "update",
        args: [
          {
            title: "Autumn launch",
            description: "Seasonal push",
            start_date: "2026-09-01",
            end_date: null,
          },
        ],
      },
      { method: "eq", args: ["id", "campaign-1"] },
      { method: "eq", args: ["client_id", "client-1"] },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("creates a campaign for the client", async () => {
    const { database, calls } = stubDatabase(row);
    await saveCampaign(database, {
      mode: "create",
      clientId: "client-1",
      title: "Autumn launch",
      description: "",
      startDate: null,
      endDate: null,
    });
    expect(calls).toEqual([
      { method: "from", args: ["campaigns"] },
      {
        method: "insert",
        args: [
          {
            title: "Autumn launch",
            description: "",
            start_date: null,
            end_date: null,
            client_id: "client-1",
          },
        ],
      },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });
});

describe("preset writes", () => {
  it("saves a service preset revision", async () => {
    const { database, rpc } = stubDatabase({ data: 3, error: null });
    const revision = await saveServicePreset(database, {
      serviceType: "brand-identity",
      minCredits: 10,
      maxCredits: 20,
      dueDays: 14,
    });
    expect(rpc).toHaveBeenCalledWith("save_service_preset", {
      p_service_type: "brand-identity",
      p_min_credits: 10,
      p_max_credits: 20,
      p_due_days: 14,
    });
    expect(revision).toBe(3);
  });
});

describe("workspace writes", () => {
  it("saves the studio name and timezone", async () => {
    const { database, rpc } = stubDatabase(ok);
    await saveWorkspaceSettings(database, { studioName: "Dawes Studio", timezone: "UTC" });
    expect(rpc).toHaveBeenCalledWith("update_workspace_settings", {
      p_studio_name: "Dawes Studio",
      p_timezone: "UTC",
    });
  });
});

describe("account writes", () => {
  it("updates the caller's display name", async () => {
    const { database, calls } = stubDatabase(row);
    await updateProfile(database, { userId: "user-1", displayName: "Jordan Lee" });
    expect(calls).toEqual([
      { method: "from", args: ["profiles"] },
      { method: "update", args: [{ display_name: "Jordan Lee" }] },
      { method: "eq", args: ["id", "user-1"] },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("accepts an invitation by its token", async () => {
    const { database, rpc } = stubDatabase(ok);
    await acceptInvitation(database, { token: "a".repeat(64) });
    expect(rpc).toHaveBeenCalledWith("accept_invitation", { p_token: "a".repeat(64) });
  });
});

describe("settings write failures", () => {
  const failures: [string, (database: never) => Promise<unknown>][] = [
    [
      "revokeInvitation",
      (database) => revokeInvitation(database, { invitationId: "invitation-1" }),
    ],
    [
      "saveClient (update)",
      (database) =>
        saveClient(database, {
          mode: "update",
          id: "client-1",
          name: "n",
          industry: "",
          website: "",
          description: "",
        }),
    ],
    [
      "saveClient (create)",
      (database) =>
        saveClient(database, {
          mode: "create",
          name: "n",
          slug: "n",
          industry: "",
          initialCredits: 0,
        }),
    ],
    [
      "saveCampaign (update)",
      (database) =>
        saveCampaign(database, {
          mode: "update",
          id: "campaign-1",
          clientId: "client-1",
          title: "t",
          description: "",
          startDate: null,
          endDate: null,
        }),
    ],
    [
      "saveCampaign (create)",
      (database) =>
        saveCampaign(database, {
          mode: "create",
          clientId: "client-1",
          title: "t",
          description: "",
          startDate: null,
          endDate: null,
        }),
    ],
    [
      "saveServicePreset",
      (database) =>
        saveServicePreset(database, {
          serviceType: "brand-identity",
          minCredits: 1,
          maxCredits: 2,
          dueDays: 5,
        }),
    ],
    [
      "saveWorkspaceSettings",
      (database) => saveWorkspaceSettings(database, { studioName: "s", timezone: "UTC" }),
    ],
    [
      "updateProfile",
      (database) => updateProfile(database, { userId: "user-1", displayName: "d" }),
    ],
    ["acceptInvitation", (database) => acceptInvitation(database, { token: "a".repeat(64) })],
  ];

  it.each(failures)("%s surfaces the database error message", async (_name, run) => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(run(database)).rejects.toThrow("permission denied");
  });
});
