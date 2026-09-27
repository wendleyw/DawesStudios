"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isVideoAsset } from "@/features/shared/upload-rules";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { BoardCampaign } from "./board-layout";
import { normalizeBoardView, type BoardView } from "./board-views";
import {
  fromInternalRows,
  fromPublishedRows,
  resolveProjectArtwork,
  selectProjectArtwork,
  type DeliverableArtwork,
  type ProjectArtworkMap,
  type ProjectCoverMap,
} from "./project-thumbnail";

/**
 * Supabase access for the board: the campaigns a client's board is grouped by, the artwork shown
 * on each project's card, and moving a card to a stored canvas position.
 */

/**
 * Ten minutes, and the number is a security boundary rather than a convenience.
 *
 * A storage signature carries only `{url, iat, exp}` — no subject and no session — so Storage serves
 * whatever it signed to whoever holds the link, and revoking the assignment the link was minted
 * under cannot reach it. Acceptance family C measured exactly that: a designer's thumbnail URL still
 * answered 200 anonymously after `revoke_design_assignment`. The expiry is therefore the whole
 * revocation window for an internal asset, and this was the product's longest at 3600 while every
 * other signing site sits at 300 or 600. Ten matches the nearest sibling and still leaves
 * `THUMBNAIL_STALE` a real five-minute cache — 300 would flatten it to zero and re-sign on every
 * render. See docs/architecture/permissions.md.
 */
export const THUMBNAIL_TTL = 600;
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

/**
 * The cover read, shared by every role: `public.project_covers`' own row-level security already
 * answers "may this viewer see it" (`private.can_produce`, or `private.can_client_channel` while
 * `client_visible`), so — unlike the deliverable queries above — this needs no `asClient` branch.
 * `updated_by` is not selected: it is not readable by `authenticated` and is not needed here.
 */
const COVER_SELECT = "project_id, storage_path";

/**
 * The deliverable half of the board's artwork read, by role.
 *
 * Pulled out from `useBoardArtworkQuery` below so the ternary's two branches each resolve to
 * `DeliverableArtwork[]` on their own: inlined as one array element of a `Promise.all` pair with
 * the unrelated cover read, the two branches' distinct row shapes would otherwise widen to a union
 * that neither `fromPublishedRows` nor `fromInternalRows` accepts.
 */
async function fetchDeliverableArtwork(
  database: SupabaseDatabase,
  ids: string[],
  asClient: boolean,
): Promise<DeliverableArtwork[]> {
  return asClient
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
}

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

export function useBoardPreferences(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["board-preferences", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () => {
      const result = await database
        .from("board_preferences")
        .select("active_view")
        .eq("user_id", session!.user.id)
        .eq("client_id", clientId)
        .maybeSingle();
      if (result.error) throw result.error;
      return normalizeBoardView(result.data?.active_view ?? null);
    },
  });
}

export async function saveBoardView(
  database: SupabaseDatabase,
  input: { clientId: string; view: BoardView },
) {
  return assertResult(
    await database.rpc("save_board_view", {
      p_client_id: input.clientId,
      p_active_view: input.view,
    }),
  );
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
      // The deliverable read and the cover read name different tables and touch nothing in
      // common, so they run as one round trip rather than two sequential ones.
      const [deliverables, coverRows] = await Promise.all([
        fetchDeliverableArtwork(database, ids, asClient),
        database.from("project_covers").select(COVER_SELECT).in("project_id", ids),
      ]);
      const covers: ProjectCoverMap = {};
      for (const row of assertResult(coverRows) as { project_id: string; storage_path: string }[])
        covers[row.project_id] = row.storage_path;

      // Both candidates per project — the cover and today's role-based pick — are gathered before
      // either is signed, so a cover's signature failing below can still fall back to the legacy
      // candidate's own path and version instead of losing both (`resolveProjectArtwork` decides).
      const candidates = selectProjectArtwork(deliverables, covers);
      const designPaths = [
        ...new Set(
          Object.values(candidates)
            .map((item) => item.legacyPath)
            .filter((path): path is string => !!path && !isVideoAsset(path)),
        ),
      ];
      const coverPaths = [
        ...new Set(
          Object.values(candidates)
            .map((item) => item.coverPath)
            .filter((path): path is string => !!path),
        ),
      ];
      const urlByPath = new Map<string, string>();
      if (designPaths.length) {
        const signed = assertResult(
          await database.storage
            .from(asClient ? "published-assets" : "internal-assets")
            .createSignedUrls(designPaths, THUMBNAIL_TTL),
        );
        for (const item of signed)
          if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      // Covers live in their own private bucket, signed with a second, independent call: mixing a
      // cover path into the design/published bucket call above would just fail to resolve it.
      if (coverPaths.length) {
        const signed = assertResult(
          await database.storage.from("project-covers").createSignedUrls(coverPaths, THUMBNAIL_TTL),
        );
        for (const item of signed)
          if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      return resolveProjectArtwork(candidates, urlByPath);
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
 * `workspace` owns, not one of board's own. The call site (`use-board-card-positions.ts`) uses `workspace`'s
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

export type BoardWidgetKind = "competitor_ads";

/**
 * The widgets the studio placed on this client's board. Only the studio side can read them, so the
 * board disables this read for a client instead of sending it.
 */
export function useBoardWidgets(clientId: string, enabled: boolean) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["board-widgets", session?.user.id, clientId],
    enabled: enabled && !!session,
    queryFn: async () =>
      (
        assertResult(
          await database.from("client_board_widgets").select("kind").eq("client_id", clientId),
        ) as { kind: BoardWidgetKind }[]
      ).map((row) => row.kind),
  });
}

export async function addBoardWidget(
  database: SupabaseDatabase,
  input: { clientId: string; kind: BoardWidgetKind },
) {
  assertResult(
    await database
      .from("client_board_widgets")
      .insert({ client_id: input.clientId, kind: input.kind })
      .select("kind")
      .single(),
  );
}

export async function removeBoardWidget(
  database: SupabaseDatabase,
  input: { clientId: string; kind: BoardWidgetKind },
) {
  assertResult(
    await database
      .from("client_board_widgets")
      .delete()
      .eq("client_id", input.clientId)
      .eq("kind", input.kind)
      .select("kind")
      .single(),
  );
}
