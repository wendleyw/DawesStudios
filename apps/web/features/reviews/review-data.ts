"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import {
  versionDate,
  versionNote,
  versionStatus,
  type VersionRow,
} from "@/features/shared/version-row";

export type ReviewRow = {
  id: string;
  projectId: string;
  title: string;
  deliverable: string;
  version: number;
  status: string;
  date: string;
  note: string | null;
  internal: boolean;
};

/**
 * A version row from either channel, with the identifying columns the list needs. The optional
 * `publication_reviews` is the embedded join the published query adds; the internal query has no
 * such column, which is what `versionStatus` falls back on.
 */
type ReviewVersion = VersionRow & {
  id: string;
  project_id: string;
  deliverable_id: string;
  version_number: number;
  publication_reviews?: { status: string } | null;
};

/**
 * What a version already shared with the client means, now that the client has had its turn.
 *
 * `design_versions.status` stops at `reviewed` — "Shared with client" — and never records the
 * decision that followed, which lives in `publication_reviews`. A designer cannot read that table
 * (`reviews_read` admits the agency and the client alone) and cannot reach it from an internal
 * version either, because the record joining the two is `private.publication_sources` in the
 * unexposed `private` schema. The one projection of the client's decision a designer *can* read is
 * the project's own status, which `review_publication` writes in the same transaction as the
 * review. A published version therefore takes its outcome from the project it belongs to, and stays
 * "Shared with client" while the client is still deciding.
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
 * "Shared with client" — it is `design_versions.status` recording that a version was published, not
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
 * All Supabase access for the reviews list: a designer's own in-progress design versions, or (for
 * an agency/client session) the published versions awaiting client review, plus — for an agency
 * session — the versions a designer has submitted to the studio for internal review.
 */
export function useReviews(clientId: string) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["reviews", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async (): Promise<ReviewRow[]> => {
      const projects = assertResult(
        await database
          .from("projects")
          .select("id,title,status,due_date")
          .eq("client_id", clientId),
      );
      if (!projects.length) return [];
      const ids = projects.map((project) => project.id);
      const deliverables = assertResult(
        await database.from("deliverables").select("id,name").in("project_id", ids),
      );
      const internal = profile?.role === "designer";
      const versions = internal
        ? assertResult(
            await database
              .from("design_versions")
              .select("id,project_id,deliverable_id,version_number,status,created_at,notes")
              .in("project_id", ids),
          )
        : assertResult(
            await database
              .from("published_versions")
              .select(
                "*,publication_reviews!publication_reviews_publication_id_fkey(status,feedback)",
              )
              .in("project_id", ids),
          );
      const latest = new Map<string, (typeof versions)[number]>();
      for (const version of versions)
        if (
          !latest.has(version.deliverable_id) ||
          latest.get(version.deliverable_id)!.version_number < version.version_number
        )
          latest.set(version.deliverable_id, version);
      // Both blocks below read the same table through the same expressions; the submitted block
      // differs only in the two values its `status = "submitted"` filter has already decided.
      const toReviewRow = (
        version: ReviewVersion,
        overrides: Partial<Pick<ReviewRow, "status" | "internal">> = {},
      ): ReviewRow => {
        const project = projects.find((item) => item.id === version.project_id)!;
        return {
          id: version.id,
          projectId: version.project_id,
          title: project.title,
          deliverable:
            deliverables.find((item) => item.id === version.deliverable_id)?.name ?? "Deliverable",
          version: version.version_number,
          status: publishedVersionStatus(
            overrides.status ?? versionStatus(version, version.publication_reviews?.status),
            project.status,
          ),
          date: versionDate(version),
          note: versionNote(version),
          internal: overrides.internal ?? internal,
        };
      };
      const rows = [...latest.values()].map((version) => toReviewRow(version));
      if (profile?.role === "agency") {
        const submitted = assertResult(
          await database
            .from("design_versions")
            .select("*")
            .in("project_id", ids)
            .eq("status", "submitted"),
        );
        rows.push(
          ...submitted.map((version) =>
            toReviewRow(version, { status: "submitted", internal: true }),
          ),
        );
      }
      return rows.toSorted((a, b) => b.date.localeCompare(a.date));
    },
    refetchInterval: 30_000,
  });
}
