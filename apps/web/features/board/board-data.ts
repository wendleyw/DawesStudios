"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { BoardCampaign } from "./board-layout";
import { normalizeBoardView, type BoardView } from "./board-views";
import {
  fromDeliverableRows,
  resolveProjectArtwork,
  type ProjectArtworkMap,
  type ProjectCoverMap,
} from "./project-thumbnail";

/**
 * Supabase access for the board: the campaigns a client's board is grouped by, the cover and type
 * label shown on each project's card, and moving a card to a stored canvas position.
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

/**
 * The type-label read: only the deliverable's scope columns, never a version or a design, so the
 * same query is safe for every role.
 */
const DELIVERABLE_SELECT = "id, project_id, format, sort_order";

/**
 * The cover read, shared by every role: `public.project_covers`' own row-level security already
 * answers "may this viewer see it" (`private.can_produce`, or `private.can_client_channel` while
 * `client_visible`). `updated_by` is not selected: it is not readable by `authenticated` and is
 * not needed here.
 */
const COVER_SELECT = "project_id, storage_path";

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
      // The deliverable read and the cover read touch nothing in common, so they run as one round
      // trip rather than two sequential ones.
      const [deliverableRows, coverRows] = await Promise.all([
        database.from("deliverables").select(DELIVERABLE_SELECT).in("project_id", ids),
        database.from("project_covers").select(COVER_SELECT).in("project_id", ids),
      ]);
      const covers: ProjectCoverMap = {};
      for (const row of assertResult(coverRows) as { project_id: string; storage_path: string }[])
        covers[row.project_id] = row.storage_path;
      const coverPaths = [...new Set(Object.values(covers))];
      const urlByPath = new Map<string, string>();
      if (coverPaths.length) {
        const signed = assertResult(
          await database.storage.from("project-covers").createSignedUrls(coverPaths, THUMBNAIL_TTL),
        );
        for (const item of signed)
          if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      return resolveProjectArtwork(
        fromDeliverableRows(assertResult(deliverableRows)),
        covers,
        urlByPath,
      );
    },
  };
}

/**
 * Cover and type label for a whole board, keyed by project id.
 *
 * One query covers every card: twenty cards each fetching their own cover and signature would be
 * twenty round trips for a board that is read as a single surface.
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
