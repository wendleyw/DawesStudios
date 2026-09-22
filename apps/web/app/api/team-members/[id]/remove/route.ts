import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";

/**
 * Removal is two layers, not one, and this route is the second. The RPC below (Task 1) handles the
 * data layer — revoking project assignments, writing the audit event — but an agency member's
 * access was never assignment-scoped (`private.is_agency()` checks `profiles.role` alone), so
 * nothing in Postgres can fully remove one. Only banning the Auth account does, and that needs the
 * Auth Admin API, which needs the service-role key — never available to the browser's
 * `authenticated` role. See the design spec's "Removal — a data RPC plus a privileged server step".
 *
 * Ordering matters: the RPC runs first. If the ban call then fails, the person has already lost
 * project access and the removal is already audited — incomplete, but safe, and this route is free
 * to retry (the RPC is a no-op on a target with nothing left to revoke). Banning first and running
 * the RPC second would risk a banned account with no audit trail of why.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return Response.json({ error: "This request must come from your workspace." }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return Response.json({ error: "Sign in before removing a teammate." }, { status: 401 });
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey)
    return Response.json(
      { error: "Team removal is not configured. Contact the workspace administrator." },
      { status: 503 },
    );
  const caller = createClient<Database>(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: rpcError } = await caller.rpc("remove_team_member", { p_profile_id: id });
  if (rpcError) return Response.json({ error: rpcError.message }, { status: 400 });
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  });
  if (banError)
    return Response.json(
      {
        error:
          "Access to studio data was removed, but the account could not be blocked from signing in. Try again.",
      },
      { status: 502 },
    );
  return Response.json({ removed: true });
}
