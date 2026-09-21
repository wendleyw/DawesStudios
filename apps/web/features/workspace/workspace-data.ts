"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";

/**
 * Supabase access shared by the application shell, the home overview, the global search page and
 * notifications. Grouped like `features/settings/settings-data.ts`: each domain below holds its
 * read hook(s), and only the domains that own a write also export a `<domain>QueryKeys` /
 * `useInvalidate<Domain>()` pair — a single bundled `workspaceQueryKeys` invalidated by every
 * mutation would refresh the project list every time a notification is marked read, which is a
 * behavior neither call made before this migration. See the "Projects" and "Notifications" groups
 * below for the two keys this feature owns.
 */

// ---------------------------------------------------------------------------------------------
// Clients: the workspace list read by the shell, the home overview and several other features
// (`settings/client-settings.tsx`, `settings/team-settings.tsx`, `brand/brand-page.tsx`,
// `briefings/briefings-page.tsx`, `briefings/briefing-editor.tsx`, `assets/assets-page.tsx`,
// `credits/credits-page.tsx`, `reviews/reviews-page.tsx`). The read hook lives here because it has
// no single owning feature; the write it is invalidated by (`saveClient`) belongs to
// `settings/settings-data.ts`, which already owns `clientQueryKeys` / `useInvalidateClients()` for
// exactly this reason — this module does not duplicate that ownership.
// ---------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------
// Projects: the workspace-wide project list read by the home overview, the global search page and
// several board/project components. No write in this module touches the `projects` table, but this
// is still the key's owning module: `board/board-data.ts`'s `moveProjectPosition` invalidates
// `projects` inline (`board-page.tsx`'s `onSuccess`) with a comment recording that it should call
// this feature's invalidation helper once one exists, rather than adding a board-owned key set to
// describe a cache entry board does not own. `useInvalidateWorkspace()` below is that helper. Wiring
// `board-page.tsx`'s mutation to call it is outside this feature's write scope (`board-data.ts` and
// `board-page.tsx` are not touched here) and is left for whoever owns that call site next.
// ---------------------------------------------------------------------------------------------

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

export const workspaceQueryKeys = ["projects"] as const;

export function useInvalidateWorkspace() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      workspaceQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

// ---------------------------------------------------------------------------------------------
// Notifications: the single source shared by the shell's bell and the notifications page
// (`notifications-bell.tsx`, `notifications-page.tsx`), so marking everything read updates both
// from one cache entry rather than a second query or a divergent count.
// ---------------------------------------------------------------------------------------------

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

export const notificationsQueryKeys = ["notifications"] as const;

export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      notificationsQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/**
 * Marks one notification read, or every unread notification the caller owns when `id` is omitted.
 *
 * Relocated verbatim from `notifications-page.tsx`'s mutation: the same table, the same
 * `user_id`/`read_at` filters in the same order, and the same conditional `.eq("id", …)` branch.
 */
export async function markNotificationsRead(
  database: SupabaseDatabase,
  input: { userId: string; id?: string },
) {
  const query = database
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .is("read_at", null);
  assertResult(await (input.id ? query.eq("id", input.id) : query));
}

// ---------------------------------------------------------------------------------------------
// Campaigns: every campaign the caller may read, so a cross-client row (the home overview, the
// global search page) can name its campaign without a query per client. RLS scopes the result: a
// designer sees only campaigns in workspaces it works in. The write this reads alongside
// (`saveCampaign`) belongs to `settings/settings-data.ts`, which already owns `campaignQueryKeys` /
// `useInvalidateCampaigns()`.
// ---------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------
// Search: the cross-entity lookup behind the global search page (`search-page.tsx`). One hook
// covering all four entities, because the page renders one combined, ordered result list rather
// than four independent ones — the four queries run together and their results are concatenated in
// the same clients/projects/briefings/brand-assets order the page always used.
// ---------------------------------------------------------------------------------------------

export type WorkspaceSearchResult = {
  id: string;
  title: string;
  description: string;
  type: "Workspace" | "Project" | "Briefing" | "Brand asset";
  href: string;
};

export function useWorkspaceSearch(search: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["search", session?.user.id, search],
    enabled: search.length > 1,
    queryFn: async (): Promise<WorkspaceSearchResult[]> => {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      const [clients, projects, briefings, assets] = await Promise.all([
        database
          .from("clients")
          .select("id,name,industry")
          .eq("archived", false)
          .ilike("name", pattern)
          .limit(30),
        database.from("projects").select("id,title,description").ilike("title", pattern).limit(40),
        profile?.role !== "designer"
          ? database
              .from("briefings")
              .select("id,title,client_id,status")
              .ilike("title", pattern)
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
        database
          .from("brand_assets")
          .select("id,name,client_id,category")
          .ilike("name", pattern)
          .limit(30),
      ]);
      return [
        ...assertResult(clients).map((item) => ({
          id: item.id,
          title: item.name,
          description: item.industry,
          type: "Workspace" as const,
          href: `/clients/${item.id}/board`,
        })),
        ...assertResult(projects).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          type: "Project" as const,
          href: `/projects/${item.id}`,
        })),
        ...assertResult(briefings).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.status.replaceAll("_", " "),
          type: "Briefing" as const,
          href: `/clients/${item.client_id}/briefings/${item.id}`,
        })),
        ...assertResult(assets).map((item) => ({
          id: item.id,
          title: item.name,
          description: item.category,
          type: "Brand asset" as const,
          href: `/clients/${item.client_id}/brand/assets?asset=${item.id}`,
        })),
      ];
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
