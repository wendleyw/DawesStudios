/**
 * What the Planning frame is showing, and the pure rules behind it.
 *
 * Kept free of React and xyflow so the board's selection and sizing rules can be unit tested
 * without rendering a canvas.
 */
import type { ProjectStatus } from "@/features/workspace/workspace-data";

/** The two planning layouts the viewer chooses between. */
export type PlanningMode = "timeline" | "kanban";

/**
 * The stages the Kanban lays out, in the order work moves through them. It lives here rather than
 * with the component because the board's geometry is sized from how many there are.
 */
export const boardStatuses: ProjectStatus[] = [
  "planned",
  "in_progress",
  "internal_review",
  "client_review",
  "changes_requested",
  "approved",
  "delivered",
];

/** The part of an xyflow node change this board reads. */
export type BoardNodeChange = { type: string; id?: string; selected?: boolean };

/**
 * The card a batch of changes leaves selected.
 *
 * Selection is controlled: with a controlled `nodes` prop xyflow only reports the change and
 * rebuilds its internal nodes from the array it is given, so a selection the board does not
 * record is discarded the next time the array changes.
 *
 * Only project cards are selectable — every frame and the briefing slot pass `selectable: false` —
 * so a select change can be trusted to name a project.
 */
export function selectionFromChanges(
  changes: readonly BoardNodeChange[],
  current: string | null,
): string | null {
  let next = current;
  for (const change of changes) {
    if (change.type !== "select" || !change.id) continue;
    if (change.selected) next = change.id;
    else if (next === change.id) next = null;
  }
  return next;
}
