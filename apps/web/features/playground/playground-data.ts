"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, describeSupabaseError, type SupabaseDatabase } from "@/lib/supabase";
import type {
  PlaygroundData,
  PlaygroundItem,
  PlaygroundItemInput,
  PlaygroundScope,
} from "./playground-types";

const bucket = "playground-assets";
const itemColumns = "id,board_id,kind,title,body,asset_path,mime_type,x,y,width,height,revision";

/** Keep the database error code so a conflict can offer reload without losing the local draft. */
function resultOrThrow<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error)
    throw Object.assign(new Error(describeSupabaseError(result.error)), {
      code: result.error.code,
    });
  return result.data as T;
}

export function usePlayground(scope: PlaygroundScope) {
  const { database, session, profile } = useAuth();
  return useQuery<PlaygroundData>({
    queryKey: ["playground", session?.user.id, profile?.role, scope.clientId, scope.projectId],
    enabled: !!session && !!profile && !!scope.projectId,
    // Signed image previews expire after ten minutes. Refreshing an open canvas renews them and
    // discovers another collaborator's saved changes without a second client-side state store.
    refetchInterval: 60_000,
    queryFn: async () => {
      const boardId = resultOrThrow(
        await database.rpc("get_playground_board", {
          p_client_id: scope.clientId,
          p_project_id: scope.projectId,
        }),
      ) as string;
      const items = resultOrThrow(
        await database
          .from("playground_items")
          .select(itemColumns)
          .eq("board_id", boardId)
          .order("created_at")
          .order("id"),
      ) as PlaygroundItem[];
      let cleanupError: string | undefined;
      const pending = await database.rpc("get_playground_cleanup", { p_board_id: boardId });
      if (pending.error) {
        cleanupError = "Unfinished file cleanup could not be checked. Try again.";
      } else if (pending.data?.length) {
        const cleanup = await database.storage
          .from(bucket)
          .remove(pending.data.map((entry) => entry.path));
        if (cleanup.error)
          cleanupError =
            "Some removed files still need cleanup. Try again to finish deleting them.";
      }
      const paths = items.flatMap((item) =>
        item.kind === "image" && item.asset_path ? [item.asset_path] : [],
      );
      if (!paths.length) return { boardId, items, cleanupError };
      const signed = assertResult(await database.storage.from(bucket).createSignedUrls(paths, 600));
      const urls = new Map(
        signed.flatMap((entry) =>
          entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : [],
        ),
      );
      return {
        boardId,
        cleanupError,
        items: items.map((item) => ({
          ...item,
          ...(item.asset_path && urls.has(item.asset_path)
            ? { url: urls.get(item.asset_path) }
            : {}),
        })),
      };
    },
  });
}

export function useInvalidatePlayground() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["playground"] });
}

export async function savePlaygroundItem(
  database: SupabaseDatabase,
  input: { boardId: string; item: PlaygroundItemInput; expectedRevision: number | null },
): Promise<PlaygroundItem> {
  return resultOrThrow(
    await database.rpc("save_playground_item", {
      p_board_id: input.boardId,
      p_item: input.item,
      ...(input.expectedRevision === null ? {} : { p_expected_revision: input.expectedRevision }),
    }),
  ) as unknown as PlaygroundItem;
}

export async function deletePlaygroundItem(
  database: SupabaseDatabase,
  input: { boardId: string; itemId: string; expectedRevision: number; assetPath: string | null },
) {
  // The RPC retains a tombstone. If Storage fails after this commits, retrying the same input
  // returns the same server-owned path and retries cleanup without resurrecting or deleting a
  // newer item. The caller must retain its pending deletion until this whole function succeeds.
  const path = resultOrThrow(
    await database.rpc("delete_playground_item", {
      p_board_id: input.boardId,
      p_item_id: input.itemId,
      p_expected_revision: input.expectedRevision,
      ...(input.assetPath === null ? {} : { p_asset_path: input.assetPath }),
    }),
  );
  if (path) {
    const result = await database.storage.from(bucket).remove([path]);
    if (result.error)
      throw new Error(
        "The item was removed, but its file could not be deleted. Retry to finish cleanup.",
      );
  }
}

export async function uploadPlaygroundFile(
  database: SupabaseDatabase,
  input: { path: string; file: File },
) {
  const result = await database.storage.from(bucket).upload(input.path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (!result.error) return result.data;
  // A successful upload can lose its response. Repeating a stable path must never overwrite the
  // object, and matching a filename or size alone is insufficient proof that it is the same file.
  const existing = await database.storage.from(bucket).download(input.path);
  if (
    !existing.error &&
    existing.data.size === input.file.size &&
    existing.data.type.split(";")[0] === input.file.type
  ) {
    const hashes = await Promise.all(
      [existing.data, input.file].map(
        async (file) =>
          new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
      ),
    );
    if (hashes[0].every((value, index) => value === hashes[1][index])) return { path: input.path };
  }
  return assertResult(result);
}

export async function discardPlaygroundFile(database: SupabaseDatabase, path: string) {
  // Storage RLS refuses an attached live file. It allows a caller's staged upload or a tombstone's
  // exact path, and serializes this check against the item save to avoid a dangling attachment.
  assertResult(await database.storage.from(bucket).remove([path]));
}

export async function getPlaygroundDownload(database: SupabaseDatabase, path: string) {
  return assertResult(
    await database.storage.from(bucket).createSignedUrl(path, 60, { download: true }),
  ).signedUrl;
}
