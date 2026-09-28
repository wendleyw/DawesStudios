"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { chunkItems, fetchAllPages } from "@/features/shared/pagination";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";

/**
 * The one cache key this feature owns: the combined delivery/working file list behind
 * `useProjectAssets`.
 *
 * Unlike `brand` and `briefings`, this feature does get an aggregate `useInvalidateAssets()`: both
 * of its write call sites (`assets-page.tsx`'s deliver mutation and `upload-file-dialog.tsx`'s
 * upload mutation) already invalidated the whole set, because the whole set is one key. Routing
 * them through the helper is therefore exactly non-widening, which is the only condition under
 * which the helper in rule 5 of `docs/architecture/data-access.md` may be used.
 *
 * `projects` is not listed here. `assets-page.tsx` does invalidate it alongside `assets`, but
 * `workspace/workspace-data.ts` owns that key and the call site reaches it through that feature's
 * `useInvalidateWorkspace()` — the same split `board-data.ts` records above `moveProjectPosition`.
 */
export const assetQueryKeys = ["assets"] as const;

export function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      assetQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export type ProjectAsset = {
  id: string;
  name: string;
  projectId: string;
  path: string;
  bucket: "internal-assets" | "delivery-files";
  mime: string;
  size: number | null;
  date: string;
  category: "Working file" | "Delivery";
  approved: boolean;
};

/**
 * `delivery_files` and `project_assets` are two tables with the same seven column names, so the
 * only thing that distinguishes their rows as assets is which bucket holds them, what the list
 * calls them and whether they count as approved. The designs themselves live in Miro, so no
 * design copy is listed here.
 */
function fromStoredFile(
  file: {
    id: string;
    name: string;
    project_id: string;
    storage_path: string;
    mime_type: string;
    file_size: number;
    created_at: string;
  },
  bucket: ProjectAsset["bucket"],
  category: ProjectAsset["category"],
  approved: boolean,
): ProjectAsset {
  return {
    id: file.id,
    name: file.name,
    projectId: file.project_id,
    path: file.storage_path,
    bucket,
    mime: file.mime_type,
    size: file.file_size,
    date: file.created_at,
    category,
    approved,
  };
}

/**
 * A project as the Files page's folder/campaign views need it: its own `id`/`title`/`status` plus
 * the campaign its files fold into. `campaignId`/`campaignTitle` come from a single `campaigns(id,
 * title)` embed on the `projects` read below — the FK is unambiguous (`projects` has exactly one
 * relationship to `campaigns`) and every role may read campaigns (`campaigns_read` on
 * `private.can_access_client`), so no second query or role branch is needed. `file-groups.ts` reads
 * both fields structurally and never imports this type.
 */
export type AssetProject = {
  id: string;
  title: string;
  status: string;
  activity?: string;
  campaignId: string | null;
  campaignTitle: string | null;
  /**
   * The project's client-channel Drive link, if any; the icon beside its file group opens it.
   * Files is the client-facing delivery surface, so only the `client` row of `project_drive_links`
   * is ever read here — never `internal`. RLS keeps this null for a designer (whose read only ever
   * returns their `internal` row) without any role branch here.
   */
  driveUrl: string | null;
};

export function useProjectAssets(clientId: string) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["assets", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async ({ signal }) => {
      const projectRows = await fetchAllPages(
        async (from, to) =>
          assertResult(
            await database
              .from("projects")
              .select("id,title,status,activity,campaign_id,campaigns(id,title)")
              .eq("client_id", clientId)
              .order("id")
              .range(from, to)
              .abortSignal(signal),
          ),
        signal,
      );
      const projects: AssetProject[] = projectRows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        activity: row.activity,
        campaignId: row.campaign_id,
        campaignTitle: row.campaigns?.title ?? null,
        driveUrl: null,
      }));
      if (!projects.length) return { assets: [] as ProjectAsset[], projects };
      const ids = projects.map((project) => project.id);
      const assets: ProjectAsset[] = [];
      const driveUrlByProject = new Map<string, string>();
      for (const projectIds of chunkItems(ids)) {
        const [deliveries, internal, driveLinks] = await Promise.all([
          fetchAllPages(
            async (from, to) =>
              assertResult(
                await database
                  .from("delivery_files")
                  .select("*")
                  .in("project_id", projectIds)
                  .order("created_at", { ascending: false })
                  .order("id")
                  .range(from, to)
                  .abortSignal(signal),
              ),
            signal,
          ),
          profile?.role !== "client"
            ? fetchAllPages(
                async (from, to) =>
                  assertResult(
                    await database
                      .from("project_assets")
                      .select("*")
                      .in("project_id", projectIds)
                      .order("created_at", { ascending: false })
                      .order("id")
                      .range(from, to)
                      .abortSignal(signal),
                  ),
                signal,
              )
            : Promise.resolve([]),
          fetchAllPages(
            async (from, to) =>
              assertResult(
                await database
                  .from("project_drive_links")
                  .select("project_id,url")
                  .eq("channel", "client")
                  .in("project_id", projectIds)
                  .order("project_id")
                  .range(from, to)
                  .abortSignal(signal),
              ),
            signal,
          ),
        ]);
        assets.push(
          ...deliveries.map((file) => fromStoredFile(file, "delivery-files", "Delivery", true)),
        );
        assets.push(
          ...internal.map((file) => fromStoredFile(file, "internal-assets", "Working file", false)),
        );
        for (const row of driveLinks) driveUrlByProject.set(row.project_id, row.url);
      }
      for (const project of projects) {
        project.driveUrl = driveUrlByProject.get(project.id) ?? null;
      }
      return {
        assets: assets.toSorted((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
        projects,
      };
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

/**
 * Ten minutes, the board thumbnails' window: a signed URL outlives any change of access, so its
 * expiry is the whole revocation window (see `THUMBNAIL_TTL` in `board-data.ts`).
 */
const PREVIEW_TTL = 600;
const previewableMimes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Previews for the Files grid, keyed `bucket:id`: one signed URL per raster image, one request per
 * bucket. Every file here already came through the viewer's own role-scoped read, so a preview is
 * never signed for a file the viewer could not download.
 */
export function useAssetPreviews(assets: ProjectAsset[]) {
  const { database, session } = useAuth();
  const images = useMemo(
    () => assets.filter((asset) => previewableMimes.has(asset.mime)),
    [assets],
  );
  return useQuery({
    queryKey: [
      "asset-previews",
      session?.user.id,
      images.map((image) => `${image.bucket}:${image.path}`).sort(),
    ],
    enabled: !!session && images.length > 0,
    staleTime: (PREVIEW_TTL - 300) * 1000,
    queryFn: async ({ signal }) => {
      const previews: Record<string, string> = {};
      const buckets = [...new Set(images.map((image) => image.bucket))];
      await Promise.all(
        buckets.map(async (bucket) => {
          const inBucket = images.filter((image) => image.bucket === bucket);
          for (const batch of chunkItems(inBucket)) {
            signal.throwIfAborted();
            const signed = assertResult(
              await database.storage.from(bucket).createSignedUrls(
                batch.map((image) => image.path),
                PREVIEW_TTL,
              ),
            );
            signal.throwIfAborted();
            for (const image of batch) {
              const url = signed.find((item) => item.path === image.path)?.signedUrl;
              if (url) previews[`${bucket}:${image.id}`] = url;
            }
          }
        }),
      );
      return previews;
    },
  });
}
