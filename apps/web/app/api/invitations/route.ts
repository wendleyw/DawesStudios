import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import { invitationRequestSchema } from "@/features/settings/settings-model";

export async function POST(request: Request) {
  // A standalone Node.js server derives request.url from its listening address, so in a container
  // it reports the bind host instead of the browser origin. Trust the configured workspace origin,
  // matching the media service, and keep the request origin for a direct `next dev`/`next start`.
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return Response.json({ error: "This request must come from your workspace." }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return Response.json({ error: "Sign in before inviting a teammate." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 4096)
    return Response.json({ error: "Invitation request is too large." }, { status: 413 });
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey)
    return Response.json(
      { error: "Email invitations are not configured. Contact the workspace administrator." },
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
    return Response.json({ error: "Only the studio can send invitations." }, { status: 403 });
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 4096)
      return Response.json({ error: "Invitation request is too large." }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "Send a valid invitation request." }, { status: 400 });
  }
  const parsed = invitationRequestSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Check the invitation details." },
      { status: 400 },
    );
  const input = parsed.data;
  const { data: invitation, error: inviteError } = await caller.rpc("create_invitation", {
    p_email: input.email,
    p_role: input.role,
    ...(input.clientId ? { p_client_id: input.clientId } : {}),
  });
  if (inviteError) return Response.json({ error: inviteError.message }, { status: 400 });
  if (
    !invitation ||
    typeof invitation !== "object" ||
    Array.isArray(invitation) ||
    typeof invitation.id !== "string" ||
    typeof invitation.token !== "string"
  )
    return Response.json({ error: "The invitation could not be prepared." }, { status: 500 });
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const redirectTo = new URL("/auth/invite", origin);
    redirectTo.searchParams.set("token", invitation.token);
    const { error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: redirectTo.toString(),
    });
    if (error) throw error;
    return Response.json({ id: invitation.id, delivered: true });
  } catch (error) {
    const { error: revokeError } = await caller.rpc("revoke_invitation", {
      p_invitation_id: invitation.id,
    });
    const reason =
      error instanceof Error && /already.*(registered|exists)/i.test(error.message)
        ? "This email already has an account. Its access must be managed by the studio."
        : "The invitation email could not be sent. Please try again.";
    return Response.json(
      {
        error: `${reason}${revokeError ? " The pending invitation could not be revoked; revoke it in Team settings before retrying." : " No workspace access was granted."}`,
      },
      { status: 502 },
    );
  }
}
