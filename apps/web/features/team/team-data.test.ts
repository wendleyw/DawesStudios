import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invitation } from "@/features/settings/settings-model";
import {
  isInvitationPending,
  removeClientMember,
  revokeInvitation,
  setClientNotifications,
  teamQueryKeys,
} from "./team-data";

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

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invitation-1",
    email: "person@sabre.test",
    role: "client",
    client_id: "sabre",
    status: "pending",
    expires_at: "2026-09-26T12:00:30.000Z",
    created_at: "2026-09-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("isInvitationPending", () => {
  const now = new Date("2026-09-26T12:00:00.000Z").getTime();

  it("is pending while its expiry is still ahead of now", () => {
    expect(isInvitationPending(invitation({ expires_at: "2026-09-26T12:00:30.000Z" }), now)).toBe(
      true,
    );
  });

  it("stops being pending once its expiry is behind now", () => {
    expect(isInvitationPending(invitation({ expires_at: "2026-09-26T11:59:30.000Z" }), now)).toBe(
      false,
    );
  });

  it("is never pending once accepted or revoked, however far off its expiry is", () => {
    expect(
      isInvitationPending(
        invitation({ status: "accepted", expires_at: "2999-01-01T00:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
    expect(
      isInvitationPending(
        invitation({ status: "revoked", expires_at: "2999-01-01T00:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
  });
});

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
    [
      "setClientNotifications",
      (database) => setClientNotifications(database, { clientId: "client-1", all: false }),
    ],
  ];

  it.each(failures)("%s surfaces the database error message", async (_name, run) => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(run(database)).rejects.toThrow("permission denied");
  });
});

describe("client people writes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records a person's notification choice for one client", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setClientNotifications(database, { clientId: "client-1", all: true });
    expect(rpc).toHaveBeenCalledWith("set_client_notifications", {
      p_client_id: "client-1",
      p_all: true,
    });
  });

  it("removes a client's person through the server route with the caller's token", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ removed: true, deactivated: false }));
    vi.stubGlobal("fetch", request);
    await removeClientMember({ access_token: "token-1" } as Session, {
      clientId: "client-1",
      profileId: "person-1",
    });
    expect(request).toHaveBeenCalledWith("/api/clients/client-1/members/person-1/remove", {
      method: "POST",
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("surfaces the route's own error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "Only the studio can remove a client's people." },
            { status: 403 },
          ),
        ),
    );
    await expect(
      removeClientMember({ access_token: "token-1" } as Session, {
        clientId: "client-1",
        profileId: "person-1",
      }),
    ).rejects.toThrow("Only the studio can remove a client's people.");
  });
});
