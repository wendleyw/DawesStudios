"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { SupabaseDatabase } from "@/lib/supabase";
import { saveBoardView, useBoardPreferences } from "./board-data";
import { defaultBoardView, type BoardView } from "./board-views";

/**
 * Which of the five views the board shows, and persisting a viewer's choice per client.
 *
 * `layout` is the pending choice until the save settles, then the confirmed one — never both, so
 * the picker never shows a state the database has not agreed with yet. Kept as its own hook so
 * `BoardPage` does not also have to read the mutation's error/pending shape to render its retry
 * controls.
 */
export function useBoardView(database: SupabaseDatabase, clientId: string) {
  const preferences = useBoardPreferences(clientId);
  const [pendingView, setPendingView] = useState<BoardView | null>(null);
  const persistView = useMutation({
    mutationFn: async (view: BoardView) => saveBoardView(database, { clientId, view }),
    onSuccess: async () => {
      await preferences.refetch();
    },
    onSettled: () => setPendingView(null),
  });
  const layout = pendingView ?? preferences.data ?? defaultBoardView;
  function chooseLayout(view: BoardView) {
    setPendingView(view);
    persistView.mutate(view);
  }
  const disabled = preferences.isPending || !!preferences.error || pendingView !== null;

  return {
    layout,
    chooseLayout,
    disabled,
    isPending: preferences.isPending,
    preferencesError: preferences.error,
    retryPreferences: () => void preferences.refetch(),
    saveError: persistView.error,
    savePending: persistView.isPending,
    retrySave: () => {
      if (persistView.variables) chooseLayout(persistView.variables);
    },
  };
}
