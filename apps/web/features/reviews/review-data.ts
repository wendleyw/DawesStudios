"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { workRequestLabel, workRequestStatus, type CurrentBoardWork } from "./work-request";
import { assertResult } from "@/lib/supabase";

export type ReviewRow = {
  id: string;
  projectId: string;
  boardId?: string;
  title: string;
  /** "Board name · Round N" for a round, "V N" for a client version. */
  label: string;
  status: string;
  date: string;
  note: string | null;
  internal: boolean;
  /** Who made the client's decision and when; null until decided, and on reviews decided before reviewers were recorded. */
  reviewedBy: string | null;
  reviewedAt: string | null;
};

/** A client version: a project-level `published_versions` row with the client's decision. */
type ClientVersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  published_at: string;
  release_note: string;
  publication_reviews: {
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
  } | null;
};

const REQUEST_COLUMNS =
  "id,project_id,board_id,sequence,kind,outcome,current,round_id,created_at,round:design_versions!board_work_requests_round_id_fkey(version_number,notes)";
const CLIENT_VERSION_COLUMNS =
  "id,project_id,version_number,published_at,release_note,publication_reviews!publication_reviews_publication_id_fkey(status,reviewed_by,reviewed_at)";

/** The newest row per group, by `version_number`. Shared with the Overview's designer rounds. */
export function latestBy<T extends { version_number: number }>(
  rows: T[],
  key: (row: T) => string,
): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(key(row));
    if (!current || current.version_number < row.version_number) latest.set(key(row), row);
  }
  return [...latest.values()];
}

/**
 * A version that is finished: it has been through review and nothing further is waiting on anyone.
 *
 * Of the six statuses `versionStatusLabels` names, only `approved` qualifies. `reviewed` reads
 * "Shared" — it is `design_versions.status` recording that a version was published, not
 * that the client accepted it, and a version the client then rejected keeps it. Treating it as
 * finished filed rejected work under Approved for the designer who had to revise it. `pending` and
 * `draft`/`submitted` are waiting on the client and on the studio, and `changes_requested` is
 * waiting on the designer.
 */
export const isFinished = (status: string) => status === "approved";

/**
 * Whether a row belongs to a review tab for the signed-in role. A client's **Waiting for you** holds
 * only versions still waiting on their decision; one they sent back is waiting on the studio, so it
 * moves to **With the studio**. The agency's **In review** keeps every published version that is not
 * approved, and a designer's **In progress** every unfinished version of their own.
 */
export function inReviewTab(
  tab: string,
  row: { status: string; internal: boolean },
  role: string | undefined,
): boolean {
  if (tab === "approved") return isFinished(row.status);
  if (tab === "studio") return row.internal && row.status === "submitted";
  if (tab === "with-studio") return !row.internal && row.status === "changes_requested";
  if (role === "client") return !row.internal && row.status === "pending";
  return !isFinished(row.status) && (role === "designer" || !row.internal);
}

/** Current board requests for internal work and the latest immutable client publication. */
export function useReviews(clientId: string) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["reviews", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async (): Promise<ReviewRow[]> => {
      const projects = assertResult(
        await database
          .from("projects")
          .select("id,title,status,activity")
          .eq("client_id", clientId)
          .eq("activity", "active"),
      );
      if (!projects.length) return [];
      const ids = projects.map((project) => project.id);
      const role = profile?.role;
      const projectFor = (id: string) => projects.find((project) => project.id === id)!;
      const readWork = async (submittedOnly: boolean): Promise<ReviewRow[]> => {
        let query = database
          .from("board_work_requests")
          .select(REQUEST_COLUMNS)
          .in("project_id", ids)
          .eq("current", true)
          .neq("outcome", "closed");
        if (submittedOnly) query = query.eq("outcome", "submitted");
        const requests = assertResult(await query) as CurrentBoardWork[];
        const boardIds = [...new Set(requests.map((request) => request.board_id))];
        const boards = boardIds.length
          ? assertResult(await database.from("design_boards").select("id,name").in("id", boardIds))
          : [];
        return requests
          .filter((request) => projectFor(request.project_id).status !== "delivered")
          .map((request) => ({
            id: request.round_id ?? request.id,
            projectId: request.project_id,
            boardId: request.board_id,
            title: projectFor(request.project_id).title,
            label: workRequestLabel(
              request,
              boards.find((board) => board.id === request.board_id)?.name,
            ),
            status: workRequestStatus(request),
            date: request.created_at,
            note: request.round?.notes ?? null,
            internal: true,
            reviewedBy: null,
            reviewedAt: null,
          }));
      };
      if (role === "designer")
        return (await readWork(false)).toSorted((a, b) => b.date.localeCompare(a.date));

      const versions = assertResult(
        await database
          .from("published_versions")
          .select(CLIENT_VERSION_COLUMNS)
          .in("project_id", ids),
      ) as ClientVersionRow[];
      const rows: ReviewRow[] = latestBy(versions, (version) => version.project_id).map(
        (version) => ({
          id: version.id,
          projectId: version.project_id,
          title: projectFor(version.project_id).title,
          label: `V${version.version_number}`,
          status: version.publication_reviews?.status ?? "pending",
          date: version.published_at,
          note: version.release_note,
          internal: false,
          reviewedBy: version.publication_reviews?.reviewed_by ?? null,
          reviewedAt: version.publication_reviews?.reviewed_at ?? null,
        }),
      );
      if (role === "agency") {
        rows.push(...(await readWork(true)));
      }
      return rows.toSorted((a, b) => b.date.localeCompare(a.date));
    },
    refetchInterval: 30_000,
  });
}
