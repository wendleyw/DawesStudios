"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";

export type ProjectAsset = {
  id: string;
  name: string;
  projectId: string;
  path: string;
  bucket: "internal-assets" | "published-assets" | "delivery-files";
  mime: string;
  size: number | null;
  date: string;
  category: "Working file" | "Shared design" | "Delivery";
  approved: boolean;
};

export function useProjectAssets(clientId: string) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["assets", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async () => {
      const projects = assertResult(
        await database.from("projects").select("id,title,status").eq("client_id", clientId),
      );
      if (!projects.length) return { assets: [] as ProjectAsset[], projects };
      const ids = projects.map((project) => project.id);
      const assets: ProjectAsset[] = [];
      const [deliveries, internal, publications, reviews] = await Promise.all([
        database.from("delivery_files").select("*").in("project_id", ids),
        profile?.role !== "client"
          ? database.from("project_assets").select("*").in("project_id", ids)
          : Promise.resolve({ data: [], error: null }),
        profile?.role !== "designer"
          ? database
              .from("published_designs")
              .select(
                "*,published_versions!published_designs_publication_id_project_id_fkey(published_at)",
              )
              .in("project_id", ids)
              .not("asset_path", "is", null)
          : Promise.resolve({ data: [], error: null }),
        profile?.role !== "designer"
          ? database
              .from("publication_reviews")
              .select("publication_id,status")
              .in("project_id", ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const approvedIds = new Set(
        assertResult(reviews)
          .filter((review) => review.status === "approved")
          .map((review) => review.publication_id),
      );
      assets.push(
        ...assertResult(deliveries).map((file) => ({
          id: file.id,
          name: file.name,
          projectId: file.project_id,
          path: file.storage_path,
          bucket: "delivery-files" as const,
          mime: file.mime_type,
          size: file.file_size,
          date: file.created_at,
          category: "Delivery" as const,
          approved: true,
        })),
      );
      assets.push(
        ...assertResult(internal).map((file) => ({
          id: file.id,
          name: file.name,
          projectId: file.project_id,
          path: file.storage_path,
          bucket: "internal-assets" as const,
          mime: file.mime_type,
          size: file.file_size,
          date: file.created_at,
          category: "Working file" as const,
          approved: false,
        })),
      );
      assets.push(
        ...assertResult(publications)
          .filter((file) => file.asset_path)
          .map((file) => ({
            id: file.id,
            name: file.title,
            projectId: file.project_id,
            path: file.asset_path!,
            bucket: "published-assets" as const,
            mime: "image/png",
            size: null,
            date: file.published_versions.published_at,
            category: "Shared design" as const,
            approved: approvedIds.has(file.publication_id),
          })),
      );
      return { assets: assets.toSorted((a, b) => b.date.localeCompare(a.date)), projects };
    },
  });
}

/**
 * The project an upload dialog opens on.
 *
 * A delivery can only be attached to an approved project, so the choices are narrowed — but the
 * narrowing must not throw away which project the viewer is actually looking at. Preferring the
 * first approved project in the workspace over the current filter silently attached a final file
 * to a different project, and the client was notified about that one instead: the assets page was
 * filtered to one project, the dialog targeted another, and nothing on screen disagreed.
 */
export function initialUploadProject(
  candidates: { id: string }[],
  filteredProject: string,
): string {
  if (candidates.some((candidate) => candidate.id === filteredProject)) return filteredProject;
  return candidates[0]?.id ?? "";
}

/**
 * Looks up whether a `project_assets` row already points at a storage path.
 *
 * Called from `upload-file-dialog.tsx`'s `close()` (deciding whether an unfinished upload's file can
 * be safely removed from storage) and from its upload `mutationFn` (deciding whether the same upload
 * already recorded its row on a previous, interrupted attempt). Neither call site renders this
 * result — both branch on it before performing a write — so it is a plain `(database, input)`
 * function per the contract's "reads that cannot be hooks" rule, not a `use<Thing>()` hook.
 */
export async function findAssetByStoragePath(database: SupabaseDatabase, input: { path: string }) {
  return assertResult(
    await database.from("project_assets").select("id").eq("storage_path", input.path),
  ) as { id: string }[];
}

/** Removes an unfinished upload's file from the private bucket once nothing else references it. */
export async function removeUnusedUpload(database: SupabaseDatabase, input: { path: string }) {
  assertResult(await database.storage.from("internal-assets").remove([input.path]));
}

/** Uploads a working file to the private bucket at an already-chosen path. */
export async function uploadInternalAsset(
  database: SupabaseDatabase,
  input: { path: string; file: File },
) {
  assertResult(
    await database.storage
      .from("internal-assets")
      .upload(input.path, input.file, { contentType: input.file.type, upsert: false }),
  );
}

/** Records an uploaded working file's row for a project. */
export async function recordProjectAsset(
  database: SupabaseDatabase,
  input: { projectId: string; name: string; path: string; mime: string; size: number },
) {
  assertResult(
    await database.from("project_assets").insert({
      project_id: input.projectId,
      name: input.name,
      storage_path: input.path,
      mime_type: input.mime,
      file_size: input.size,
    }),
  );
}

/** Marks an approved project as delivered, notifying its client. */
export async function markProjectDelivered(
  database: SupabaseDatabase,
  input: { projectId: string },
) {
  assertResult(await database.rpc("mark_project_delivered", { p_project_id: input.projectId }));
}
