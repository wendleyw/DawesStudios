"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database, Json } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import { versionDate, versionNote, versionStatus } from "@/features/shared/version-row";

/**
 * Supabase access for a project: the canvas the project page draws, its two comment channels, the
 * designers assigned to it, and every write the canvas and its dialogs perform.
 *
 * Signed artwork URLs are read here rather than in `artwork-files.ts`: that module is deliberately
 * free of React and of `useAuth`, and `board-data.ts` already keeps its own `createSignedUrls` read
 * beside the rows it signs. Only the upload and discard of an artwork file live in `artwork-files`.
 */

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
        note: versionNote(version),
        status: versionStatus(
          version,
          reviewResult.data?.find((review) => review.publication_id === version.id)?.status,
        ),
        date: versionDate(version),
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

/**
 * The seven fields a comment has whichever channel it came from. The eighth, `label`, is the one
 * thing the two channels must not share: a client comment carries the author label the client
 * wrote it under, while an internal comment resolves to the reader's own name or the anonymous
 * "Studio team" — never a designer's identity. It is passed in, so the two label rules stay
 * separate and visible at the two call sites that own them.
 */
function toCanvasComment(
  comment: {
    id: string;
    body: string;
    pin_x: number | null;
    pin_y: number | null;
    design_id: string | null;
    resolved: boolean;
    created_at: string;
  },
  label: string,
): CanvasComment {
  return {
    id: comment.id,
    body: comment.body,
    label,
    pinX: comment.pin_x,
    pinY: comment.pin_y,
    designId: comment.design_id,
    resolved: comment.resolved,
    createdAt: comment.created_at,
  };
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
        return rows.map((comment) => toCanvasComment(comment, comment.author_label));
      }
      const query = database
        .from("internal_comments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      const rows = assertResult(
        await (designId ? query.eq("design_id", designId) : query.is("design_id", null)),
      );
      return rows.map((comment) =>
        toCanvasComment(
          comment,
          comment.author_id === profile?.id ? profile.display_name : "Studio team",
        ),
      );
    },
    refetchInterval: 15_000,
  });
}

/** The designers a project may be assigned, and the ones it already has. */
export function useProjectAssignments(projectId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["assignments", session?.user.id, projectId],
    enabled: profile?.role === "agency",
    queryFn: async () => {
      const [members, assigned] = await Promise.all([
        database.from("profiles").select("id,display_name").eq("role", "designer"),
        database.from("project_assignments").select("designer_id").eq("project_id", projectId),
      ]);
      return {
        members: assertResult(members),
        assigned: assertResult(assigned).map((item) => item.designer_id),
      };
    },
  });
}

/**
 * A short-lived signed URL for one design's uploaded artwork.
 *
 * The bucket is chosen by channel rather than by role, so a client channel never signs a path in
 * the internal bucket. The URL outlives a look at the artwork and is refreshed before it expires.
 */
export function useDesignAssetUrl(assetPath: string | null, channel: ProjectChannel) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["asset-url", session?.user.id, channel, assetPath],
    enabled: !!assetPath,
    staleTime: 120_000,
    refetchInterval: 240_000,
    queryFn: async () =>
      assertResult(
        await database.storage
          .from(channel === "internal" ? "internal-assets" : "published-assets")
          .createSignedUrl(assetPath!, 300),
      ).signedUrl,
  });
}

/**
 * The keys every project write invalidates.
 *
 * `assignments` and `asset-url` are deliberately absent. Assignments are refetched by the panel
 * that owns them, straight after the assign or revoke that changed them, and a signed URL is
 * governed by its own expiry rather than by a project edit. Adding either here would refresh caches
 * no write has invalidated.
 */
export const projectQueryKeys = [
  "project-detail",
  "projects",
  "comments",
  "notifications",
] as const;

export function useInvalidateProject() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      projectQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/** Saves the project's own details, refusing a save that would overwrite a concurrent edit. */
export async function updateProjectDetails(
  database: SupabaseDatabase,
  input: {
    id: string;
    /** The `updated_at` the form was opened on: the guard that makes the save a compare-and-set. */
    revision: string;
    title: string;
    description: string;
    startDate: string | null;
    dueDate: string | null;
  },
) {
  const result = await database
    .from("projects")
    .update({
      title: input.title,
      description: input.description,
      start_date: input.startDate,
      due_date: input.dueDate,
    })
    .eq("id", input.id)
    .eq("updated_at", input.revision)
    .select("id")
    .single();
  // The conflict message travels with the query rather than staying at the call site: it is the
  // reading of a no-rows result that only the `updated_at` guard above can produce.
  if (result.error?.code === "PGRST116")
    throw new Error(
      "This project changed while you were editing. Close and reopen the details to try again.",
    );
  assertResult(result);
}

export async function assignDesigner(
  database: SupabaseDatabase,
  input: { projectId: string; designerId: string },
) {
  return assertResult(
    await database.rpc("assign_designer", {
      p_project_id: input.projectId,
      p_designer_id: input.designerId,
    }),
  );
}

export async function revokeDesignAssignment(
  database: SupabaseDatabase,
  input: { projectId: string; designerId: string },
) {
  return assertResult(
    await database.rpc("revoke_design_assignment", {
      p_project_id: input.projectId,
      p_designer_id: input.designerId,
    }),
  );
}

export async function postComment(
  database: SupabaseDatabase,
  input: {
    projectId: string;
    channel: ProjectChannel;
    body: string;
    versionId?: string;
    designId?: string;
    pin?: { x: number; y: number } | null;
  },
) {
  return assertResult(
    await database.rpc("post_comment", {
      p_project_id: input.projectId,
      p_channel: input.channel,
      p_body: input.body,
      ...(input.versionId ? { p_version_id: input.versionId } : {}),
      ...(input.designId ? { p_design_id: input.designId } : {}),
      ...(input.pin ? { p_pin_x: input.pin.x, p_pin_y: input.pin.y } : {}),
    }),
  );
}

export async function resolveComment(
  database: SupabaseDatabase,
  input: { commentId: string; channel: ProjectChannel; resolved: boolean },
) {
  return assertResult(
    await database.rpc("resolve_comment", {
      p_comment_id: input.commentId,
      p_channel: input.channel,
      p_resolved: input.resolved,
    }),
  );
}

export async function createDesignVersion(
  database: SupabaseDatabase,
  input: { deliverableId: string; notes: string; copyVersionId?: string },
) {
  assertResult(
    await database.rpc("create_design_version", {
      p_deliverable_id: input.deliverableId,
      p_notes: input.notes,
      ...(input.copyVersionId ? { p_copy_version_id: input.copyVersionId } : {}),
    }),
  );
}

/*
 * `findUnchangedDesign` and `findDesignByAsset` are plain functions rather than `use<Thing>()`
 * hooks. Both are called from inside `mutation.mutationFn` in `project-action-dialog.tsx`, where a
 * hook cannot be called at all, so the contract's read rule cannot apply — see the `Reads that
 * cannot be hooks` rule in `docs/architecture/data-access.md` and this feature's `README.md`.
 *
 * Each runs on the submit that needs it, to decide whether the write that follows is a repeat of
 * one already stored. A hook would read on render instead — the answer would be cached from before
 * the upload it is meant to judge, and there is no component that wants the row on screen.
 */

/** The design row already holding exactly what this save would write, if there is one. */
export async function findUnchangedDesign(
  database: SupabaseDatabase,
  input: { id: string; title: string; content: Json; assetPath: string | null },
) {
  const query = database
    .from("designs")
    .select("id")
    .eq("id", input.id)
    .eq("title", input.title)
    .eq("content", JSON.stringify(input.content));
  return assertResult(
    await (input.assetPath
      ? query.eq("internal_asset_path", input.assetPath)
      : query.is("internal_asset_path", null)),
  );
}

/** The design in this version already carrying an uploaded artwork, so a retry does not add a second. */
export async function findDesignByAsset(
  database: SupabaseDatabase,
  input: { versionId: string; assetPath: string },
) {
  return assertResult(
    await database
      .from("designs")
      .select("id")
      .eq("version_id", input.versionId)
      .eq("internal_asset_path", input.assetPath),
  );
}

/** Saves an edited working design, refusing a save that would overwrite a concurrent edit. */
export async function updateWorkingDesign(
  database: SupabaseDatabase,
  input: {
    id: string;
    title: string;
    content: Json;
    assetPath: string | null;
    /** The values the form was opened on: the guard that makes the save a compare-and-set. */
    previousTitle: string;
    previousContent: Json;
    previousAssetPath: string | null;
  },
) {
  const query = database
    .from("designs")
    .update({ title: input.title, content: input.content, internal_asset_path: input.assetPath })
    .eq("id", input.id)
    .eq("title", input.previousTitle)
    .eq("content", JSON.stringify(input.previousContent));
  const result = await (
    input.previousAssetPath
      ? query.eq("internal_asset_path", input.previousAssetPath)
      : query.is("internal_asset_path", null)
  )
    .select("id")
    .single();
  if (result.error?.code === "PGRST116")
    throw new Error(
      "This design changed while you were editing. Close and reopen it before saving.",
    );
  assertResult(result);
}

/** Rewrites the design a repeated upload resolved to, instead of adding another one beside it. */
export async function updateDesignContent(
  database: SupabaseDatabase,
  input: { id: string; title: string; content: Json },
) {
  assertResult(
    await database
      .from("designs")
      .update({ title: input.title, content: input.content })
      .eq("id", input.id)
      .select("id")
      .single(),
  );
}

export async function addDesign(
  database: SupabaseDatabase,
  input: { versionId: string; title: string; content: Json; internalAssetPath: string | null },
) {
  assertResult(
    await database.rpc("add_design", {
      p_version_id: input.versionId,
      p_title: input.title,
      p_content: input.content,
      ...(input.internalAssetPath ? { p_internal_asset_path: input.internalAssetPath } : {}),
    }),
  );
}

export async function publishVersion(
  database: SupabaseDatabase,
  input: { versionId: string; releaseNote: string; assets: Record<string, string> },
) {
  assertResult(
    await database.rpc("publish_version", {
      p_version_id: input.versionId,
      p_release_note: input.releaseNote,
      p_assets: input.assets,
      // No submission key: publish_version then treats one internal version as mapping to
      // exactly one client snapshot, so reopening this dialog and sharing an unchanged
      // version returns the existing publication instead of minting a second one. A caller
      // that genuinely wants a fresh snapshot of the same version still passes a key.
    }),
  );
}

export async function submitDesignVersion(
  database: SupabaseDatabase,
  input: { versionId: string },
) {
  assertResult(await database.rpc("submit_design_version", { p_version_id: input.versionId }));
}

export async function reviewPublication(
  database: SupabaseDatabase,
  input: { publicationId: string; decision: string; feedback: string },
) {
  assertResult(
    await database.rpc("review_publication", {
      p_publication_id: input.publicationId,
      p_decision: input.decision,
      p_feedback: input.feedback,
    }),
  );
}
