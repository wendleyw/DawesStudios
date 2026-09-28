"use client";

import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { changeBoardActivity, type WorkflowBoard } from "./project-data";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type BoardActivityAction = {
  kind: "activity";
  board: WorkflowBoard;
  change: "close" | "reactivate";
};

export function ProjectActionActivity({
  action,
  onClose,
}: {
  action: BoardActivityAction;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const requestId = useRef(crypto.randomUUID());
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: () =>
      changeBoardActivity(database, {
        boardId: action.board.id,
        revision: action.board.workflowRevision,
        action: action.change,
        requestId: requestId.current,
      }),
    onSuccess: closeOnSuccess,
  });
  const { closeDisabled, close } = useProjectActionClose({ onClose, pending: mutation.isPending });
  return (
    <ProjectActionShell
      open
      title={
        action.change === "close" ? "End this design direction?" : "Reactivate this design board?"
      }
      closeDisabled={closeDisabled}
      onModalClose={close}
      onCancelClick={close}
      cancelDisabled={closeDisabled}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      submitLabel={
        mutation.isPending
          ? "Saving…"
          : action.change === "close"
            ? "No further work needed"
            : "Reactivate board"
      }
      submitDisabled={mutation.isPending}
      error={mutation.error?.message}
    >
      <p>
        {action.change === "close"
          ? `${action.board.name} will keep its history. Its designer will have no current task on this board.`
          : `${action.board.name} will need a fresh production release before its designer can submit again.`}
      </p>
    </ProjectActionShell>
  );
}
