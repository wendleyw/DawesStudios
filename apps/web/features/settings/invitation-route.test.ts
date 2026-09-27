import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { POST } from "@/app/api/invitations/route";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const clientId = "00000000-0000-4000-8000-000000000001";
const existingUserId = "00000000-0000-4000-8000-000000000002";
const invitationId = "00000000-0000-4000-8000-000000000003";
const invitationToken = "a".repeat(64);
const originalEnv = { ...process.env };

function setupInvitation(existing: boolean, removed = false) {
  const rpc = vi.fn(async (name: string) =>
    name === "create_invitation"
      ? {
          data: {
            id: invitationId,
            token: invitationToken,
            existing_user_id: existing ? existingUserId : null,
            existing_removed: removed,
          },
          error: null,
        }
      : { data: null, error: null },
  );
  const caller = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "agency-id" } }, error: null }),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          is: () => ({ single: async () => ({ data: { role: "agency" }, error: null }) }),
        }),
      }),
    })),
    rpc,
  };
  const updateUserById = vi.fn().mockResolvedValue({ error: null });
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
  const admin = { auth: { admin: { updateUserById, inviteUserByEmail }, signInWithOtp } };
  vi.mocked(createClient)
    .mockReturnValueOnce(caller as never)
    .mockReturnValueOnce(admin as never);
  return { rpc, updateUserById, signInWithOtp, inviteUserByEmail };
}

function request(email = "person@fixture.local", displayName?: string) {
  return new Request("http://localhost:3003/api/invitations", {
    method: "POST",
    headers: { authorization: "Bearer agency-token", "content-type": "application/json" },
    body: JSON.stringify({ email, displayName, role: "client", clientId }),
  });
}

describe("POST /api/invitations", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "http://localhost:3003";
    process.env.SUPABASE_INTERNAL_URL = "http://localhost:55421";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.mocked(createClient).mockReset();
  });

  it("sends an existing client a sign-in link without creating another Auth identity", async () => {
    const { signInWithOtp, inviteUserByEmail, updateUserById } = setupInvitation(true);

    const response = await POST(request("person@fixture.local", "  New Name  "));

    expect(response.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "person@fixture.local",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `http://localhost:3003/auth/invite?token=${invitationToken}`,
      },
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ id: invitationId, delivered: true });
  });

  it("unbans only a removed client before sending the sign-in link", async () => {
    const { updateUserById, signInWithOtp } = setupInvitation(true, true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(existingUserId, { ban_duration: "none" });
    expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
      signInWithOtp.mock.invocationCallOrder[0],
    );
  });

  it("revokes a failed link without re-banning a potentially reactivated client", async () => {
    const { rpc, updateUserById, signInWithOtp } = setupInvitation(true, true);
    signInWithOtp.mockResolvedValueOnce({ error: new Error("SMTP failed") });

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith(existingUserId, { ban_duration: "none" });
    expect(rpc).toHaveBeenCalledWith("revoke_invitation", { p_invitation_id: invitationId });
  });

  it("uses the new-account Auth invite for an unknown email", async () => {
    const { signInWithOtp, inviteUserByEmail } = setupInvitation(false);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(inviteUserByEmail).toHaveBeenCalledWith("person@fixture.local", {
      redirectTo: `http://localhost:3003/auth/invite?token=${invitationToken}`,
    });
  });

  it("sets a trimmed Auth display name only for a new identity", async () => {
    const { inviteUserByEmail } = setupInvitation(false);

    const response = await POST(request("person@fixture.local", "  Ana Lima  "));

    expect(response.status).toBe(200);
    expect(inviteUserByEmail).toHaveBeenCalledWith("person@fixture.local", {
      redirectTo: `http://localhost:3003/auth/invite?token=${invitationToken}`,
      data: { display_name: "Ana Lima" },
    });
  });

  it("rejects an overlong name before creating an invitation", async () => {
    const { rpc, inviteUserByEmail } = setupInvitation(false);

    const response = await POST(request("person@fixture.local", "A".repeat(121)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Full name must be 120 characters or fewer." });
    expect(rpc).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
