"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type Profile, type SupabaseDatabase } from "@/lib/supabase";
import type { Invitation } from "@/features/settings/settings-model";
import type { Session } from "@supabase/supabase-js";
import type { ClientPeople, ClientPerson } from "./client-people";

export function useTeamMembers() {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["studio-team", session?.user.id],
    enabled: profile?.role === "agency",
    queryFn: async () => {
      const members = assertResult(
        await database
          .from("profiles")
          .select("id,display_name,role,avatar_url,removed_at")
          .in("role", ["agency", "designer"])
          .is("removal_completed_at", null)
          .order("display_name"),
      ) as (Profile & { removed_at: string | null })[];
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
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["invitations", session?.user.id],
    enabled: profile?.role === "agency",
    queryFn: async () =>
      assertResult(
        await database.from("invitations").select("*").order("created_at", { ascending: false }),
      ) as Invitation[],
  });
}

/**
 * Whether a pending invitation is still open, on one shared clock: not yet accepted or revoked,
 * and its expiry has not passed as of `now`. The Team page and the client People dialog both
 * decide "pending" this one way — paired with `useNow` (`./use-now.ts`) for a live `now` — so an
 * invitation that expires while either is open drops out on its own instead of only after a reopen.
 */
export function isInvitationPending(invitation: Invitation, now: number): boolean {
  return invitation.status === "pending" && new Date(invitation.expires_at).getTime() > now;
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

/**
 * The cache keys of a client's people, named one by one because their writers dirty different
 * subsets: removing someone changes `people` (the team and the pending-removal list both live under
 * that prefix), while a person's own notification choice changes only `notifications`.
 */
export const clientPeopleQueryKeys = {
  /** `useClientPeople` and `usePendingClientRemovals`. */
  people: "client-people",
  /** `useClientNotificationChoices`. */
  notifications: "client-notification-choices",
} as const;

/**
 * One client's people, for everyone allowed to see them: the active people with their emails
 * (`client_team`, which returns nothing to anyone outside the client and the studio) and, for the
 * studio only, every client-role profile's name, so a former member can still be named. Designers
 * never run it. The one read of a client's people for briefings, projects, reviews and settings.
 */
export function useClientPeople(clientId: string | undefined) {
  const { database, session, profile } = useAuth();
  const role = profile?.role;
  return useQuery({
    queryKey: [clientPeopleQueryKeys.people, session?.user.id, clientId],
    enabled: !!session && !!clientId && (role === "agency" || role === "client"),
    queryFn: async (): Promise<ClientPeople> => {
      const team = assertResult(
        await database.rpc("client_team", { p_client_id: clientId! }),
      ) as ClientPerson[];
      if (role !== "agency") return { team, names: {} };
      const everyone = assertResult(
        await database.from("profiles").select("id,display_name").eq("role", "client"),
      ) as { id: string; display_name: string }[];
      return {
        team,
        names: Object.fromEntries(everyone.map((person) => [person.id, person.display_name])),
      };
    },
  });
}

/**
 * The studio's list of people removed from this client whose sign-in block has not been confirmed:
 * their membership row stays until then (`remove_client_member`), so the People dialog can offer
 * Finish removal after a reload.
 */
export function usePendingClientRemovals(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [clientPeopleQueryKeys.people, "pending-removals", session?.user.id, clientId],
    enabled: !!session && profile?.role === "agency",
    queryFn: async () => {
      const memberships = assertResult(
        await database.from("client_memberships").select("user_id").eq("client_id", clientId),
      ) as { user_id: string }[];
      if (!memberships.length) return [];
      return assertResult(
        await database
          .from("profiles")
          .select("id,display_name")
          .in(
            "id",
            memberships.map((membership) => membership.user_id),
          )
          .not("removed_at", "is", null)
          .is("removal_completed_at", null)
          .order("display_name"),
      ) as { id: string; display_name: string }[];
    },
  });
}

/** The signed-in client person's notification choice for each client they belong to. */
export function useClientNotificationChoices() {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [clientPeopleQueryKeys.notifications, session?.user.id],
    enabled: !!session && profile?.role === "client",
    queryFn: async () =>
      assertResult(
        await database
          .from("client_memberships")
          .select("client_id,notify_all")
          .eq("user_id", session!.user.id),
      ) as { client_id: string; notify_all: boolean }[],
  });
}

export async function setClientNotifications(
  database: SupabaseDatabase,
  input: { clientId: string; all: boolean },
) {
  assertResult(
    await database.rpc("set_client_notifications", {
      p_client_id: input.clientId,
      p_all: input.all,
    }),
  );
}

/**
 * Like `removeTeamMember`, this does not take `database`: removing someone's last client also
 * blocks their sign-in, which needs the service-role key and therefore the server route in
 * `app/api/clients/[clientId]/members/[profileId]/remove/route.ts`.
 */
export async function removeClientMember(
  session: Session,
  input: { clientId: string; profileId: string },
) {
  const response = await fetch(`/api/clients/${input.clientId}/members/${input.profileId}/remove`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "This person could not be removed.");
}
