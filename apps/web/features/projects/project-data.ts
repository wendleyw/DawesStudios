"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database, Json } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";

export type TableRow<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];
export type ProjectChannel = "internal" | "client";
export type CanvasVersion = {
  id: string;
  projectId: string;
  deliverableId: string;
  number: number;
  note: string;
  status: string;
  date: string;
  feedback?: string;
};
export type CanvasDesign = {
  id: string;
  versionId: string;
  title: string;
  content: Json;
  assetPath: string | null;
  order: number;
};
export type CanvasComment = {
  id: string;
  body: string;
  label: string;
  pinX: number | null;
  pinY: number | null;
  designId: string | null;
  resolved: boolean;
  createdAt: string;
};

export function useProjectDetail(projectId: string, channel: ProjectChannel) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, projectId, channel],
    enabled: !!session,
    queryFn: async () => {
      const [project, deliverables, versionResult, designResult, reviewResult] = await Promise.all([
        database.from("projects").select("*").eq("id", projectId).single(),
        database.from("deliverables").select("*").eq("project_id", projectId).order("sort_order"),
        channel === "client" || profile?.role === "client"
          ? database
              .from("published_versions")
              .select("*")
              .eq("project_id", projectId)
              .order("version_number")
          : database
              .from("design_versions")
              .select("*")
              .eq("project_id", projectId)
              .order("version_number"),
        channel === "client" || profile?.role === "client"
          ? database
              .from("published_designs")
              .select("*")
              .eq("project_id", projectId)
              .order("sort_order")
          : database.from("designs").select("*").eq("project_id", projectId).order("sort_order"),
        database.from("publication_reviews").select("*").eq("project_id", projectId),
      ]);
      if (versionResult.error) throw new Error(versionResult.error.message);
      if (designResult.error) throw new Error(designResult.error.message);
      const versions: CanvasVersion[] = versionResult.data.map((version) => ({
        id: version.id,
        projectId: version.project_id,
        deliverableId: version.deliverable_id,
        number: version.version_number,
        note: "notes" in version ? version.notes : version.release_note,
        status:
          "status" in version
            ? version.status
            : (reviewResult.data?.find((review) => review.publication_id === version.id)?.status ??
              "pending"),
        date: "created_at" in version ? version.created_at : version.published_at,
        feedback: reviewResult.data?.find((review) => review.publication_id === version.id)
          ?.feedback,
      }));
      const designs: CanvasDesign[] = designResult.data.map((design) => ({
        id: design.id,
        versionId: "version_id" in design ? design.version_id : design.publication_id,
        title: design.title,
        content: design.content,
        assetPath: "internal_asset_path" in design ? design.internal_asset_path : design.asset_path,
        order: design.sort_order,
      }));
      return {
        project: assertResult(project),
        deliverables: assertResult(deliverables),
        versions,
        designs,
        reviews: assertResult(reviewResult),
      };
    },
  });
}

export function useProjectComments(projectId: string, channel: ProjectChannel, designId?: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["comments", session?.user.id, projectId, channel, designId ?? "project"],
    enabled: !!session,
    queryFn: async () => {
      if (channel === "client") {
        const query = database
          .from("client_comments")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at");
        const rows = assertResult(
          await (designId ? query.eq("design_id", designId) : query.is("design_id", null)),
        );
        return rows.map((comment) => ({
          id: comment.id,
          body: comment.body,
          label: comment.author_label,
          pinX: comment.pin_x,
          pinY: comment.pin_y,
          designId: comment.design_id,
          resolved: comment.resolved,
          createdAt: comment.created_at,
        })) satisfies CanvasComment[];
      }
      const query = database
        .from("internal_comments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      const rows = assertResult(
        await (designId ? query.eq("design_id", designId) : query.is("design_id", null)),
      );
      return rows.map((comment) => ({
        id: comment.id,
        body: comment.body,
        label: comment.author_id === profile?.id ? profile.display_name : "Studio team",
        pinX: comment.pin_x,
        pinY: comment.pin_y,
        designId: comment.design_id,
        resolved: comment.resolved,
        createdAt: comment.created_at,
      })) satisfies CanvasComment[];
    },
    refetchInterval: 15_000,
  });
}

export function useInvalidateProject() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["comments"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };
}
