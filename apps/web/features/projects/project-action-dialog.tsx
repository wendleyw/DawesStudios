"use client";

import { Modal } from "@/features/shared/modal";
import { ProjectActionMiro, type MiroAction } from "./project-action-miro";
import { ProjectActionReview, type ReviewAction } from "./project-action-review";
import { ProjectActionBoard, type BoardAction } from "./project-action-board";
import { ProjectActionRound, type RoundAction } from "./project-action-round";
import { ProjectActionShare, type ShareAction } from "./project-action-share";

export type ProjectAction = ReviewAction | MiroAction | BoardAction | RoundAction | ShareAction;

/**
 * A thin dispatcher: it renders exactly one component per action kind (each in its own file
 * beside this one), so a change to one action never requires reading the other kinds. The shared
 * `Modal` shell, the error paragraph and the Cancel/submit footer live in `project-action-shell.tsx`
 * and are the same markup for every kind; each kind component owns its own mutation, form state and
 * fields.
 *
 * `action` carries no target when the dialog is closed, so this case renders the same closed
 * `Modal` every kind renders into.
 */
export function ProjectActionDialog({
  action,
  suspended,
  onClose,
}: {
  action: ProjectAction | null;
  suspended: boolean;
  onClose: () => void;
}) {
  if (!action)
    return (
      <Modal open={false} onClose={onClose} title="Project action">
        {null}
      </Modal>
    );
  switch (action.kind) {
    case "miro":
      return <ProjectActionMiro action={action} suspended={suspended} onClose={onClose} />;
    case "review":
      return <ProjectActionReview action={action} suspended={suspended} onClose={onClose} />;
    case "board":
      return <ProjectActionBoard action={action} suspended={suspended} onClose={onClose} />;
    case "round":
      return <ProjectActionRound action={action} suspended={suspended} onClose={onClose} />;
    case "share":
      return <ProjectActionShare action={action} suspended={suspended} onClose={onClose} />;
  }
}

/** A remount key per action target, so reopening an action starts from a fresh form. */
export function projectActionKey(action: ProjectAction | null): string {
  if (!action) return "closed";
  switch (action.kind) {
    case "board":
      return `board:${action.board?.id ?? "new"}`;
    case "round":
      return `round:${action.board.id}`;
    case "share":
      return `share:${action.round?.id ?? "direct"}`;
    default:
      return `${action.kind}:${action.version.id}`;
  }
}
