"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";

export type Client = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  initials: string;
  website: string;
  description: string;
  archived: boolean;
};
export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "internal_review"
  | "client_review"
  | "changes_requested"
  | "approved"
  | "delivered";
export type Project = {
  id: string;
  client_id: string;
  campaign_id: string | null;
  briefing_id: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  service_type: string;
  due_date: string | null;
  start_date: string | null;
  board_position: { x: number; y: number };
  created_at: string;
  updated_at: string;
};

export function useClients() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["clients", session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database.from("clients").select("*").eq("archived", false).order("name"),
      ) as Client[],
  });
}

/**
 * Resolves the workspace a project belongs to, so the shell can keep that client selected while the
 * viewer is on the non-nested /projects/:id route.
 */
export function useProjectClient(projectId?: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["project-client", session?.user.id, projectId ?? "none"],
    enabled: !!session && !!projectId,
    staleTime: 300_000,
    queryFn: async () =>
      assertResult(
        await database.from("projects").select("client_id").eq("id", projectId!).maybeSingle(),
      ) as { client_id: string } | null,
  });
}

export type WorkspaceNotification = {
  id: string;
  user_id: string;
  client_id: string | null;
  project_id: string | null;
  title: string;
  body: string;
  kind: string;
  read_at: string | null;
  created_at: string;
};

/**
 * The single source for notifications. The shell's bell and the notifications page share this cache
 * entry, so marking everything read updates both without a second query or a divergent count.
 */
export function useNotifications() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["notifications", session?.user.id],
    enabled: !!session,
    refetchInterval: 30_000,
    queryFn: async () =>
      assertResult(
        await database
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ) as WorkspaceNotification[],
  });
}

/**
 * Every campaign the caller may read, so a cross-client row can name its campaign without a query
 * per client. RLS scopes the result: a designer sees only campaigns in workspaces it works in.
 */
export function useWorkspaceCampaigns() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["campaigns", session?.user.id, "workspace"],
    enabled: !!session,
    staleTime: 120_000,
    queryFn: async () =>
      assertResult(await database.from("campaigns").select("id, title")) as {
        id: string;
        title: string;
      }[],
  });
}

export function useProjects(clientId?: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["projects", session?.user.id, clientId ?? "all"],
    enabled: !!session,
    queryFn: async () => {
      const query = database.from("projects").select("*").order("created_at", { ascending: false });
      return assertResult(await (clientId ? query.eq("client_id", clientId) : query)) as Project[];
    },
  });
}

export const statusLabels: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  internal_review: "Studio review",
  client_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  delivered: "Delivered",
};

export function formatDate(date: string | null) {
  if (!date) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}
