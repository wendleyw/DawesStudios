import { useState } from "react";

export type ProjectSelectionHint = {
  board: string | null;
  round: string | null;
  version: string | null;
};

/**
 * The board, round and client version on screen. `project-page.tsx` owns it above its early
 * returns, like the open panel: switching channel loads the other channel's data and unmounts the
 * workspace, and a selection kept inside it would fall back to the first board on the way back.
 * URL hints are resolved against authorized rows only; they grant no access.
 */
export function useProjectSelection(initial?: ProjectSelectionHint) {
  const [boardId, setBoardId] = useState<string | null>(initial?.board ?? null);
  const [roundId, setRoundId] = useState<string | null>(initial?.round ?? null);
  const [versionId, setVersionId] = useState<string | null>(initial?.version ?? null);
  return { boardId, setBoardId, roundId, setRoundId, versionId, setVersionId };
}
