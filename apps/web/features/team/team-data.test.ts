import { describe, expect, it, vi } from "vitest";
import { revokeInvitation, teamQueryKeys } from "./team-data";

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * A database whose query builder records every call in order and resolves to `result` when awaited.
 * Copied from `features/settings/settings-data.test.ts` (itself copied from
 * `features/projects/project-data.test.ts`): recording the whole chain is what proves a relocated
 * query still issues the same table, columns, filters and order it did in the component.
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

describe("teamQueryKeys", () => {
  it("includes the member list's own key, not only invitations", () => {
    // Regression guard for the bug this move fixes: useInvalidateTeam() previously invalidated only
    // "invitations", so a role change or removal never refreshed the member list itself.
    expect(teamQueryKeys).toContain("studio-team");
    expect(teamQueryKeys).toContain("invitations");
  });
});

describe("team writes", () => {
  it("revokes an invitation by id", async () => {
    const { database, rpc } = stubDatabase(ok);
    await revokeInvitation(database, { invitationId: "invitation-1" });
    expect(rpc).toHaveBeenCalledWith("revoke_invitation", { p_invitation_id: "invitation-1" });
  });
});

describe("team write failures", () => {
  const failures: [string, (database: never) => Promise<unknown>][] = [
    [
      "revokeInvitation",
      (database) => revokeInvitation(database, { invitationId: "invitation-1" }),
    ],
  ];

  it.each(failures)("%s surfaces the database error message", async (_name, run) => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(run(database)).rejects.toThrow("permission denied");
  });
});
