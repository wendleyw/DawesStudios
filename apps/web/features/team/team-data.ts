"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type Profile, type SupabaseDatabase } from "@/lib/supabase";
import type { Invitation } from "@/features/settings/settings-model";
import type { Session } from "@supabase/supabase-js";

export function useTeamMembers() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["studio-team", session?.user.id],
    queryFn: async () => {
      const members = assertResult(
        await database
          .from("profiles")
          .select("id,display_name,role,avatar_url")
          .in("role", ["agency", "designer"])
          .order("display_name"),
      ) as Profile[];
      // One query for the whole list's workload rather than one per row: active-project counts,
      // grouped by designer, over every non-delivered project they are assigned to.
      const counts = assertResult(
        await database
          .from("project_assignments")
          .select("designer_id,projects!inner(status)")
          .neq("projects.status", "delivered"),
      ) as { designer_id: string }[];
      const byDesigner = new Map<string, number>();
      for (const row of counts)
        byDesigner.set(row.designer_id, (byDesigner.get(row.designer_id) ?? 0) + 1);
      return members.map((member) => ({
        ...member,
        activeProjectCount: byDesigner.get(member.id) ?? 0,
      }));
    },
  });
}

export function useInvitations() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["invitations", session?.user.id],
    queryFn: async () =>
      assertResult(
        await database.from("invitations").select("*").order("created_at", { ascending: false }),
      ) as Invitation[],
  });
}

export const teamQueryKeys = ["studio-team", "invitations"] as const;

export function useInvalidateTeam() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      teamQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export async function revokeInvitation(
  database: SupabaseDatabase,
  input: { invitationId: string },
) {
  assertResult(await database.rpc("revoke_invitation", { p_invitation_id: input.invitationId }));
}

export async function setTeamMemberRole(
  database: SupabaseDatabase,
  input: { profileId: string; role: "agency" | "designer" },
) {
  assertResult(
    await database.rpc("set_team_member_role", {
      p_profile_id: input.profileId,
      p_role: input.role,
    }),
  );
}

/**
 * Unlike every other write in this module, this does not take `database` — removal's second step
 * bans the Auth account, which needs the service-role key and therefore a server route, not a
 * direct RPC call. See `apps/web/app/api/team-members/[id]/remove/route.ts`.
 */
export async function removeTeamMember(session: Session, input: { profileId: string }) {
  const response = await fetch(`/api/team-members/${input.profileId}/remove`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The team member could not be removed.");
}
