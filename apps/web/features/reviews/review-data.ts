"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";

export type ReviewRow = {
  id: string;
  projectId: string;
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

/** A round: a `design_versions` row on a design board. */
type RoundRow = {
  id: string;
  project_id: string;
  board_id: string | null;
  version_number: number;
  status: string;
  created_at: string;
  notes: string;
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

/** Named columns: the API grants no role `design_versions.created_by`, so `select("*")` is refused. */
const ROUND_COLUMNS = "id,project_id,board_id,version_number,status,created_at,notes";
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

/** The label a round is listed under: its design board's name and its number on that board. */
export function roundLabel(boardName: string | undefined, roundNumber: number): string {
  return `${boardName ?? "Design board"} · Round ${roundNumber}`;
}

/**
 * What a version already shared with the client means, now that the client has had its turn.
 *
 * `design_versions.status` stops at `reviewed` — "Shared" — and never records the
 * decision that followed, which lives in `publication_reviews`. A designer cannot read that table
 * (`reviews_read` admits the agency and the client alone) and cannot reach it from an internal
 * version either, because the record joining the two is `private.publication_sources` in the
 * unexposed `private` schema. The one projection of the client's decision a designer *can* read is
 * the project's own status, which `review_publication` writes in the same transaction as the
 * review. A published version therefore takes its outcome from the project it belongs to, and stays
 * "Shared" while the client is still deciding.
 */
export function publishedVersionStatus(versionStatus: string, projectStatus: string): string {
  if (versionStatus !== "reviewed") return versionStatus;
  if (projectStatus === "changes_requested") return "changes_requested";
  if (projectStatus === "approved" || projectStatus === "delivered") return "approved";
  return "reviewed";
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

/**
 * All Supabase access for the reviews list, on the Miro workspace model:
 * - a designer sees the latest round of each of their design boards (`design_versions` with a
 *   `board_id`; row-level security admits only their own boards);
 * - the agency and the client see the latest client version of each project (`published_versions`
 *   without a deliverable), with the client's decision from `publication_reviews`;
 * - the agency also sees every round a designer has submitted for studio review.
 *
 * Rows with a deliverable are legacy per-deliverable versions, kept in the database only until
 * they are deleted: both reads leave them out (`board_id` is set only on rounds, which the
 * one-parent check keeps free of a deliverable; client versions filter `deliverable_id is null`).
 */
export function useReviews(clientId: string) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["reviews", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async (): Promise<ReviewRow[]> => {
      const projects = assertResult(
        await database.from("projects").select("id,title,status").eq("client_id", clientId),
      );
      if (!projects.length) return [];
      const ids = projects.map((project) => project.id);
      const role = profile?.role;
      const projectFor = (id: string) => projects.find((project) => project.id === id)!;
      const readRounds = async (submittedOnly: boolean) => {
        let query = database
          .from("design_versions")
          .select(ROUND_COLUMNS)
          .in("project_id", ids)
          .not("board_id", "is", null);
        if (submittedOnly) query = query.eq("status", "submitted");
        const rounds = assertResult(await query) as RoundRow[];
        const boardIds = [...new Set(rounds.map((round) => round.board_id!))];
        const boards = boardIds.length
          ? (assertResult(
              await database.from("design_boards").select("id,name").in("id", boardIds),
            ) as { id: string; name: string }[])
          : [];
        return { rounds, boards };
      };
      const toRoundRow = (round: RoundRow, boards: { id: string; name: string }[]): ReviewRow => {
        const project = projectFor(round.project_id);
        const board = boards.find((item) => item.id === round.board_id);
        return {
          id: round.id,
          projectId: round.project_id,
          title: project.title,
          label: roundLabel(board?.name, round.version_number),
          status: publishedVersionStatus(round.status, project.status),
          date: round.created_at,
          note: round.notes,
          internal: true,
          reviewedBy: null,
          reviewedAt: null,
        };
      };

      if (role === "designer") {
        const { rounds, boards } = await readRounds(false);
        return latestBy(rounds, (round) => round.board_id!)
          .map((round) => toRoundRow(round, boards))
          .toSorted((a, b) => b.date.localeCompare(a.date));
      }

      const versions = assertResult(
        await database
          .from("published_versions")
          .select(CLIENT_VERSION_COLUMNS)
          .in("project_id", ids)
          .is("deliverable_id", null),
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
        const { rounds, boards } = await readRounds(true);
        rows.push(...rounds.map((round) => toRoundRow(round, boards)));
      }
      return rows.toSorted((a, b) => b.date.localeCompare(a.date));
    },
    refetchInterval: 30_000,
  });
}
