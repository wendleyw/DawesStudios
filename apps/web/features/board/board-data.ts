"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { BoardCampaign } from "./board-layout";
import {
  fromInternalRows,
  fromPublishedRows,
  selectProjectArtwork,
  type ProjectArtworkMap,
} from "./project-thumbnail";

/**
 * Supabase access for the board: the campaigns a client's board is grouped by, the artwork shown
 * on each project's card, and moving a card to a stored canvas position.
 */

/** Long enough to outlive a board session, short enough that a copied URL stops working. */
const THUMBNAIL_TTL = 3600;
/** Refetch a little before the URLs expire rather than after a card has already gone blank. */
const THUMBNAIL_STALE = (THUMBNAIL_TTL - 300) * 1000;

/*
 * The two artwork reads. Each one names only the tables its role may touch, so the wrong channel is
 * never even asked for; row level security is what makes that a guarantee rather than a convention.
 * Deliverables lead both queries so a project without any artwork still comes back with its type.
 */
const INTERNAL_SELECT =
  "id, project_id, format, sort_order, design_versions(version_number, designs(id, sort_order, internal_asset_path))";
const PUBLISHED_SELECT =
  "id, project_id, format, sort_order, published_versions(version_number, published_designs(id, sort_order, asset_path))";

/** The campaigns inside one client's board, ordered for the campaign rail. */
export function useBoardCampaigns(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["campaigns", session?.user.id, clientId],
    queryFn: async () =>
      assertResult(
        await database
          .from("campaigns")
          .select("id, title, start_date, end_date")
          .eq("client_id", clientId)
          .order("title"),
      ) as BoardCampaign[],
  });
}

/**
 * Shared options for the board's artwork read, so the hooks below are two views of one request.
 *
 * React Query keys the result by viewer, role and project list; two hooks asking for the same key
 * share the one cache entry, which keeps the board at a single query and a single signing call.
 */
function useBoardArtworkQuery(projectIds: string[]) {
  const { database, session, profile } = useAuth();
  const role = profile?.role;
  // The identity of the id list drives the query key, so a filter that only hides cards must not
  // start a new request: callers pass their full client scope and the board picks from the result.
  const ids = useMemo(() => [...projectIds].sort(), [projectIds]);
  return {
    queryKey: ["board-thumbnails", session?.user.id, role, ids],
    enabled: !!session && !!role && ids.length > 0,
    staleTime: THUMBNAIL_STALE,
    queryFn: async (): Promise<ProjectArtworkMap> => {
      const asClient = role === "client";
      const deliverables = asClient
        ? fromPublishedRows(
            assertResult(
              await database
                .from("deliverables")
                .select(PUBLISHED_SELECT)
                .in("project_id", ids)
                .not("published_versions.published_designs.asset_path", "is", null),
            ),
          )
        : fromInternalRows(
            assertResult(
              await database
                .from("deliverables")
                .select(INTERNAL_SELECT)
                .in("project_id", ids)
                .not("design_versions.designs.internal_asset_path", "is", null),
            ),
          );
      const chosen = selectProjectArtwork(deliverables);
      const paths = [
        ...new Set(
          Object.values(chosen)
            .map((item) => item.path)
            .filter((path): path is string => !!path),
        ),
      ];
      const urlByPath = new Map<string, string>();
      if (paths.length) {
        const signed = assertResult(
          await database.storage
            .from(asClient ? "published-assets" : "internal-assets")
            .createSignedUrls(paths, THUMBNAIL_TTL),
        );
        for (const item of signed)
          if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      const artwork: ProjectArtworkMap = {};
      for (const [projectId, item] of Object.entries(chosen)) {
        const url = item.path ? (urlByPath.get(item.path) ?? null) : null;
        // A version is a claim about an image. Without the image the claim is dropped rather than
        // shown over an empty tile, which is the mismatch this whole path exists to prevent.
        artwork[projectId] = {
          url,
          version: url ? item.version : null,
          typeLabel: item.typeLabel,
        };
      }
      return artwork;
    },
  };
}

/**
 * Artwork, version and type label for a whole board, keyed by project id.
 *
 * One query covers every card: twenty cards each fetching their own design row and signature
 * would be twenty round trips for a board that is read as a single surface.
 */
export function useProjectArtwork(projectIds: string[]) {
  return useQuery(useBoardArtworkQuery(projectIds));
}

/**
 * Moves a project card to a stored canvas position.
 *
 * No `boardQueryKeys`/`useInvalidateBoard()` here: this write invalidates `projects`, a key
 * `workspace` owns, not one of board's own. The call site (`board-page.tsx`) uses `workspace`'s
 * `useInvalidateWorkspace()` for that reason, rather than adding a board-owned key set to describe
 * someone else's cache entry.
 */
export async function moveProjectPosition(
  database: SupabaseDatabase,
  input: { id: string; position: { x: number; y: number } },
) {
  return assertResult(
    await database
      .from("projects")
      .update({ board_position: input.position })
      .eq("id", input.id)
      .select("id")
      .single(),
  );
}
