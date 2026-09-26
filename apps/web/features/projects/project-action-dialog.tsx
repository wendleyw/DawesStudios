"use client";

import { Modal } from "@/features/shared/modal";
import type { CanvasDesign, CanvasVersion, ProjectChannel } from "./project-data";
import { ProjectActionVersion } from "./project-action-version";
import { ProjectActionDesign } from "./project-action-design";
import { ProjectActionPublish } from "./project-action-publish";
import { ProjectActionMiro } from "./project-action-miro";
import { ProjectActionSubmit } from "./project-action-submit";
import { ProjectActionReview, type ReviewAction } from "./project-action-review";
import { ProjectActionBoard, type BoardAction } from "./project-action-board";
import { ProjectActionRound, type RoundAction } from "./project-action-round";
import { ProjectActionShare, type ShareAction } from "./project-action-share";

export type ProjectAction =
  | { kind: "version"; deliverableId: string; sourceVersionId?: string }
  | { kind: "design" | "publish" | "submit"; version: CanvasVersion }
  | ReviewAction
  | { kind: "edit-design"; version: CanvasVersion; design: CanvasDesign }
  | { kind: "miro"; version: CanvasVersion; channel: ProjectChannel }
  | BoardAction
  | RoundAction
  | ShareAction;

/**
 * A thin dispatcher: it renders exactly one component per action kind (each in its own file
 * beside this one), so a change to one action never requires reading the other kinds. The shared
 * `Modal` shell, the error paragraph and the Cancel/submit footer live in `project-action-shell.tsx`
 * and are the same markup for every kind; each kind component owns its own mutation, form state and
 * fields. Design and edit-design share `project-action-design.tsx` because they share the same form.
 *
 * `action` carries no target when the dialog is closed, so this case renders the same closed
 * `Modal` every kind renders into, matching the DOM every closed action left behind before this
 * split.
 */
export function ProjectActionDialog({
  action,
  projectId,
  suspended,
  onOpenPlayground,
  onClose,
}: {
  action: ProjectAction | null;
  projectId: string;
  suspended: boolean;
  onOpenPlayground: () => void;
  onClose: () => void;
}) {
  if (!action)
    return (
      <Modal open={false} onClose={onClose} title="Project action">
        {null}
      </Modal>
    );
  switch (action.kind) {
    case "version":
      return <ProjectActionVersion action={action} suspended={suspended} onClose={onClose} />;
    case "design":
      return (
        <ProjectActionDesign
          action={{ kind: "design", version: action.version }}
          projectId={projectId}
          suspended={suspended}
          onOpenPlayground={onOpenPlayground}
          onClose={onClose}
        />
      );
    case "edit-design":
      return (
        <ProjectActionDesign
          action={{ kind: "edit-design", version: action.version, design: action.design }}
          projectId={projectId}
          suspended={suspended}
          onOpenPlayground={onOpenPlayground}
          onClose={onClose}
        />
      );
    case "publish":
      return (
        <ProjectActionPublish
          action={{ kind: "publish", version: action.version }}
          suspended={suspended}
          onClose={onClose}
        />
      );
    case "miro":
      return <ProjectActionMiro action={action} suspended={suspended} onClose={onClose} />;
    case "submit":
      return (
        <ProjectActionSubmit
          action={{ kind: "submit", version: action.version }}
          suspended={suspended}
          onClose={onClose}
        />
      );
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
    case "version":
      return `version:${action.deliverableId}`;
    default:
      return `${action.kind}:${action.version.id}`;
  }
}
