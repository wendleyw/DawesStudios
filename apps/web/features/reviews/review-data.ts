"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";

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
      const rows = [...latest.values()].map((version) => ({
        id: version.id,
        projectId: version.project_id,
        title: projects.find((project) => project.id === version.project_id)!.title,
        deliverable:
          deliverables.find((item) => item.id === version.deliverable_id)?.name ?? "Deliverable",
        version: version.version_number,
        status:
          "status" in version ? version.status : (version.publication_reviews?.status ?? "pending"),
        date: "created_at" in version ? version.created_at : version.published_at,
        note: "notes" in version ? version.notes : version.release_note,
        internal,
      }));
      if (profile?.role === "agency") {
        const submitted = assertResult(
          await database
            .from("design_versions")
            .select("*")
            .in("project_id", ids)
            .eq("status", "submitted"),
        );
        rows.push(
          ...submitted.map((version) => ({
            id: version.id,
            projectId: version.project_id,
            title: projects.find((project) => project.id === version.project_id)!.title,
            deliverable:
              deliverables.find((item) => item.id === version.deliverable_id)?.name ??
              "Deliverable",
            version: version.version_number,
            status: "submitted",
            date: version.created_at,
            note: version.notes,
            internal: true,
          })),
        );
      }
      return rows.toSorted((a, b) => b.date.localeCompare(a.date));
    },
    refetchInterval: 30_000,
  });
}
