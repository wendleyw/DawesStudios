import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Removes one person from one client. It mirrors `app/api/team-members/[id]/remove/route.ts`,
 * including its order: `remove_client_member` runs first and ends the person's access to this
 * client. When that was their last client the RPC also deactivates the account (`removed_at`) and
 * answers `true`; only then does this route block future sign-ins with the service-role key and
 * record `removal_completed_at`. A failed second step answers 502 and leaves the person listed as a
 * pending removal in the People dialog (their membership row is kept until then); a retry repeats
 * every step, and the RPC returns early for an account it already deactivated. The two routes stay
 * separate files, as the spec asks for a mirror of the tested team route rather than a change to it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string; profileId: string }> },
) {
  const { clientId, profileId } = await params;
  if (!uuid.test(clientId) || !uuid.test(profileId))
    return Response.json({ error: "Select a valid person." }, { status: 400 });
  // A standalone Node.js server derives request.url from its listening address, so in a container
  // it reports the bind host instead of the browser origin. Trust the configured workspace origin,
  // matching the media service, and keep the request origin for a direct `next dev`/`next start`.
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return Response.json({ error: "This request must come from the studio." }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in before removing someone." }, { status: 401 });
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey)
    return Response.json(
      { error: "Removal is not configured. Ask the studio administrator to set it up." },
      { status: 503 },
    );
  const caller = createClient<Database>(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser(token);
  if (authError || !user)
    return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  const { data: profile, error: profileError } = await caller
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .is("removed_at", null)
    .single();
  if (profileError || profile?.role !== "agency")
    return Response.json(
      { error: "Only the studio can remove a client's people." },
      { status: 403 },
    );
  const { data: deactivated, error: rpcError } = await caller.rpc("remove_client_member", {
    p_client_id: clientId,
    p_profile_id: profileId,
  });
  if (rpcError) return Response.json({ error: rpcError.message }, { status: 400 });
  if (!deactivated) return Response.json({ removed: true, deactivated: false });
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: banError } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: "876000h",
  });
  if (banError)
    return Response.json(
      {
        error:
          "Access to this client was removed, but the account could not be blocked from signing in. Try again.",
      },
      { status: 502 },
    );
  const { error: completionError } = await admin
    .from("profiles")
    .update({ removal_completed_at: new Date().toISOString() })
    .eq("id", profileId)
    .not("removed_at", "is", null);
  if (completionError)
    return Response.json(
      { error: "The account is blocked, but removal could not be finalized. Try again." },
      { status: 502 },
    );
  return Response.json({ removed: true, deactivated: true });
}
