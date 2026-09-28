"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchAllPages } from "@/features/shared/pagination";
import type { StatusTone } from "@/features/shared/status-tone";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { assertResult, describeSupabaseError, type SupabaseDatabase } from "@/lib/supabase";

/**
 * Supabase access shared by the application shell, the home overview and notifications. Grouped
 * like `features/settings/settings-data.ts`: each domain below holds its read hook(s), and only the
 * domains that own a write also export a `<domain>QueryKeys` / `useInvalidate<Domain>()` pair — a
 * single bundled `workspaceQueryKeys` invalidated by every mutation would refresh the project list
 * every time a notification is marked read, which is a behavior neither call made before this
 * migration. See the "Projects" and "Notifications" groups below for the two keys this feature owns.
 */

// ---------------------------------------------------------------------------------------------
// Clients: the workspace list read by the shell, the home overview and several other features
// (`settings/client-settings.tsx`, `team/team-page.tsx`, `brand/brand-page.tsx`,
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
  /** The agency-chosen workspace logo in `brand-assets`, preferred over any Brand Hub logo. */
  logo_path: string | null;
  /** The revision the client-settings editor opens on, so a stale save can be refused. */
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

// ---------------------------------------------------------------------------------------------
// Projects: the workspace-wide project list read by the home overview, the global search page and
// several board/project components. No write in this module touches the `projects` table, but this
// is still the key's owning module: `board/board-data.ts`'s `moveProjectPosition` invalidates
// `projects` through `useInvalidateWorkspace()` below, called from `board-page.tsx`'s `onSuccess`,
// rather than through a board-owned key set describing a cache entry board does not own.
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
  /** When the studio marked the project delivered; null until then. */
  delivered_at: string | null;
  start_date: string | null;
  /** The month (first day, UTC) whose credits the project uses; null until it is accepted. */
  credit_month?: string | null;
  board_position: { x: number; y: number };
  created_at: string;
  updated_at: string;
};

/**
 * The date a designer works to: the earlier of the project's own due date and a board's internal
 * one. The agency sets the board's date on or before the project's, but the project's date can move
 * earlier later, so the earlier of the two always wins.
 */
export function designerDueDate(projectDue: string | null, boardDue: string | null) {
  if (!boardDue) return projectDue;
  if (!projectDue) return boardDue;
  return boardDue < projectDue ? boardDue : projectDue;
}

/** Each project's due date as a designer sees it, from the dates on their own boards. */
export function withDesignerDueDates(
  projects: Project[],
  boards: { project_id: string; due_date: string | null }[],
): Project[] {
  const earliest = new Map<string, string>();
  for (const board of boards)
    earliest.set(
      board.project_id,
      designerDueDate(earliest.get(board.project_id) ?? null, board.due_date) ?? "",
    );
  return projects.map((project) => {
    const due = designerDueDate(project.due_date, earliest.get(project.id) || null);
    return due === project.due_date ? project : { ...project, due_date: due };
  });
}

/**
 * The viewer's projects. A designer's copy carries the internal date of their own boards in
 * `due_date` (RLS returns only their boards), so every list, calendar and timeline shows the date
 * they work to; the agency and the client read the project's own date.
 */
export function useProjects(clientId?: string) {
  const { database, session, profile } = useAuth();
  const designer = profile?.role === "designer";
  return useQuery({
    queryKey: ["projects", session?.user.id, clientId ?? "all", designer ? "designer" : "all"],
    enabled: !!session,
    queryFn: async ({ signal }) => {
      const projects = await fetchAllPages(async (from, to) => {
        const query = database
          .rpc("visible_projects")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        return assertResult(
          await (clientId ? query.eq("client_id", clientId) : query)
            .range(from, to)
            .abortSignal(signal),
        ) as Project[];
      }, signal);
      if (!designer) return projects;
      const boards = await fetchAllPages(
        async (from, to) =>
          assertResult(
            await database
              .from("design_boards")
              .select("project_id,due_date")
              .not("due_date", "is", null)
              .order("project_id")
              .order("due_date")
              .order("id")
              .range(from, to)
              .abortSignal(signal),
          ),
        signal,
      );
      return withDesignerDueDates(projects, boards);
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

/** The feed lists the latest notifications only; the unread count below covers all of them. */
export const NOTIFICATION_FEED_LIMIT = 100;
export const ACTION_NOTIFICATION_LIMIT = 100;

export type ActionNotification = {
  id: string;
  kind: string;
  client_id: string;
  project_id: string | null;
  entity_id: string;
  board_id: string | null;
  subject: string;
  created_at: string;
};

/** Current workflow obligations are separate from read/unread activity. */
export function useActionNotifications(page = 0) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["action-notifications", session?.user.id, page],
    enabled: !!session,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, count, error } = await database
        .from("action_notifications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * ACTION_NOTIFICATION_LIMIT, (page + 1) * ACTION_NOTIFICATION_LIMIT - 1);
      if (error) throw new Error(describeSupabaseError(error));
      return { items: (data ?? []) as ActionNotification[], count: count ?? 0 };
    },
  });
}

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
          .limit(NOTIFICATION_FEED_LIMIT),
      ) as WorkspaceNotification[],
  });
}

/**
 * Every unread notification of the caller's, counted by the database without sending rows, so the
 * bell and the feed never report only the unread share of the latest page.
 */
export async function unreadNotificationCount(database: SupabaseDatabase): Promise<number> {
  const { count, error } = await database
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(describeSupabaseError(error));
  return count ?? 0;
}

/** Keyed under `notifications`, so the feed's invalidation refreshes it with the list. */
export function useUnreadNotificationCount() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["notifications", session?.user.id, "unread"],
    enabled: !!session,
    refetchInterval: 30_000,
    queryFn: () => unreadNotificationCount(database),
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
// Labels and dates: the vocabulary and the date rendering every feature shares. A status that is
// read from an enum is named here once, so the same record can never be described by two different
// words on two screens, and every date is formatted by the same set of functions.
// ---------------------------------------------------------------------------------------------

export const statusLabels: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  internal_review: "Studio review",
  client_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  delivered: "Delivered",
};

/**
 * A project status read as a badge tone. Three states wait on a person — the studio's own review,
 * the client's review, and a change request — so all three read as `attention`; the label says
 * whose turn it is.
 */
export const projectStatusTones: Record<ProjectStatus, StatusTone> = {
  planned: "neutral",
  in_progress: "active",
  internal_review: "attention",
  client_review: "attention",
  changes_requested: "attention",
  approved: "complete",
  delivered: "complete",
};

/**
 * Every value a design version's status can take, in the same vocabulary as `statusLabels`.
 *
 * A version carries one of two status sets depending on the channel it is read through, and both
 * reach the same components: `design_versions.status` (`draft`, `submitted`, `reviewed`) on the
 * internal channel, and `publication_reviews.status` (`pending`, `approved`, `changes_requested`)
 * on the client channel. Rendering the raw token instead left one state reading three ways on three
 * screens, and left `submitted`, `reviewed` and `pending` with no label at all.
 */
export type VersionStatus =
  "draft" | "submitted" | "reviewed" | "pending" | "approved" | "changes_requested";

export const versionStatusLabels: Record<VersionStatus, string> = {
  draft: "In progress",
  submitted: "Studio review",
  reviewed: "Shared",
  pending: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** A status the database may hold but this build does not name yet still reads as a word. */
export function versionStatusLabel(status: string): string {
  return versionStatusLabels[status as VersionStatus] ?? status.replaceAll("_", " ");
}

/**
 * A calendar date (`2026-09-21`) names a day, not an instant: a due date, a start date or a
 * campaign boundary is the same day in every timezone, so it is read in UTC — the zone the database
 * stores it against. Shifting one into the studio's zone would move a due date to the day before.
 * Everything with a time in it is an instant and is read in the studio's timezone.
 */
function isCalendarDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export type DateFormatters = {
  /** A record's date, in context: `Sep 21`. */
  formatDate: (date: string | null, emptyLabel?: string) => string;
  /** The same date where the year carries meaning, such as a ledger row: `Sep 21, 2026`. */
  formatDateLong: (date: string | null, emptyLabel?: string) => string;
  /** An instant, where the time of day is part of the record: `Sep 21, 2026, 11:00 PM`. */
  formatDateTime: (date: string | null, emptyLabel?: string) => string;
  /** The same instant in a list whose rows are recent, without the year: `Sep 21, 11:00 PM`. */
  formatDayTime: (date: string | null, emptyLabel?: string) => string;
  /** A month, for the ledger's month filter: `September 2026`. */
  formatMonth: (date: string | null, emptyLabel?: string) => string;
  /** Today, named as a day rather than as a record: `Monday, September 21`. */
  formatWeekdayDate: (date: string | null, emptyLabel?: string) => string;
  /** The calendar day in the studio zone as `2026-09-21`, for counting days. */
  formatDayKey: (date: string) => string;
};

/**
 * The product's date rendering, bound to one timezone.
 *
 * Exported for tests and for any caller that already knows the zone; components take the studio's
 * zone from `useDateFormat()` instead of constructing their own `Intl.DateTimeFormat`, which is
 * what left the studio timezone setting honoured on a single screen.
 */
export function createDateFormatters(timeZone: string): DateFormatters {
  const format = (options: Intl.DateTimeFormatOptions) => {
    const instant = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    const calendar = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    return (date: string | null, emptyLabel = "No date") => {
      if (!date) return emptyLabel;
      const value = new Date(date);
      if (Number.isNaN(value.getTime())) return emptyLabel;
      return (isCalendarDate(date) ? calendar : instant).format(value);
    };
  };
  const dayKey = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return {
    formatDate: format({ month: "short", day: "numeric" }),
    formatDateLong: format({ month: "short", day: "numeric", year: "numeric" }),
    formatDateTime: format({ dateStyle: "medium", timeStyle: "short" }),
    formatDayTime: format({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    formatMonth: format({ month: "long", year: "numeric" }),
    formatWeekdayDate: format({ weekday: "long", month: "long", day: "numeric" }),
    formatDayKey: (date: string) => {
      if (isCalendarDate(date)) return date;
      const parts = dayKey.formatToParts(new Date(date));
      const part = (type: string) => parts.find((piece) => piece.type === type)!.value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    },
  };
}

const utcFormatters = createDateFormatters("UTC");

/**
 * The date formatters every user-facing render uses, in the timezone the studio chose in Settings.
 *
 * `useWorkspaceSettings` is one shared query, so every component here reads the same value and they
 * all re-render together when it resolves or changes. Until it resolves — and for a viewer whose
 * session cannot read it — the formatters fall back to UTC, which is what every surface but the
 * notifications page used before.
 */
export function useDateFormat(): DateFormatters {
  const settings = useWorkspaceSettings();
  const timeZone = settings.data?.timezone || "UTC";
  return useMemo(
    () => (timeZone === "UTC" ? utcFormatters : createDateFormatters(timeZone)),
    [timeZone],
  );
}
