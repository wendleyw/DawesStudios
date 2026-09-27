"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import type { SupabaseDatabase } from "@/lib/supabase";
import { useCompetitors } from "@/features/competitors/competitors-data";
import { addBoardWidget, removeBoardWidget, useBoardWidgets } from "./board-data";

/**
 * The Competitor ads board widget: whether the studio placed it, the count Canvas draws on its
 * frame, and the agency's add/remove toggle. Kept as its own hook because it fetches and mutates
 * independently of everything else the board reads — a client's board never even asks for it.
 */
export function useBoardCompetitorWidget({
  database,
  clientId,
  canMove,
  studioSide,
}: {
  database: SupabaseDatabase;
  clientId: string;
  canMove: boolean;
  /** Only the studio side reads widgets or competitors; a client's board never asks. */
  studioSide: boolean;
}) {
  const widgets = useBoardWidgets(clientId, studioSide);
  const placed = !!widgets.data?.includes("competitor_ads");
  const competitors = useCompetitors(clientId, studioSide && placed);
  const count = competitors.data?.length ?? 0;
  const toggle = useMutation({
    mutationFn: async (currentlyPlaced: boolean) =>
      currentlyPlaced
        ? removeBoardWidget(database, { clientId, kind: "competitor_ads" })
        : addBoardWidget(database, { clientId, kind: "competitor_ads" }),
    onSuccess: () => widgets.refetch(),
  });
  const { mutate: setPlaced } = toggle;
  const removeCompetitorWidget = useCallback(() => setPlaced(true), [setPlaced]);

  /** Fed to `useBoardCanvasNodes`; present only once the studio side has placed the widget. */
  const competitorWidget = useMemo(
    () =>
      placed
        ? { count, canEdit: canMove, removing: toggle.isPending, onRemove: removeCompetitorWidget }
        : undefined,
    [placed, count, canMove, toggle.isPending, removeCompetitorWidget],
  );

  /** Fed to `BoardToolbar`'s Widgets panel; the page shows it only on Canvas for a mover. */
  const widgetsPanel = useMemo(
    () => ({
      placed,
      pending: toggle.isPending || widgets.isPending,
      error: toggle.error?.message ?? null,
      onToggle: () => setPlaced(placed),
    }),
    [placed, toggle.isPending, toggle.error, widgets.isPending, setPlaced],
  );

  return { competitorWidget, widgetsPanel };
}
