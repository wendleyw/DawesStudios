"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { sendBoardRound, type DesignBoard } from "./project-data";
import { miroUrlHint, parseMiroBoardUrl } from "./miro-links";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type RoundAction = { kind: "round"; board: DesignBoard };

/** "Send to studio": the designer's next round of their board, with a note and an optional frame. */
export function ProjectActionRound({
  action,
  suspended,
  onClose,
}: {
  action: RoundAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  // One key per open dialog: a retry after a failure replays the same send.
  const idempotencyKey = useRef(crypto.randomUUID());
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const frameUrl = value("frame");
      if (frameUrl && !parseMiroBoardUrl(frameUrl)) throw new Error(miroUrlHint);
      await sendBoardRound(database, {
        boardId: action.board.id,
        note: value("note"),
        frameUrl,
        idempotencyKey: idempotencyKey.current,
      });
    },
    onSuccess: closeOnSuccess,
  });
  const { closeError, closeDisabled, close } = useProjectActionClose({
    onClose,
    pending: mutation.isPending,
  });
  return (
    <ProjectActionShell
      open={!suspended}
      title={`Send ${action.board.name} to the studio.`}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Sending…" : "Send to studio"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <label>
        Note for the studio
        <textarea name="note" rows={3} placeholder="What should the studio look at?" />
      </label>
      <label>
        Frame link (optional)
        <input name="frame" placeholder="Leave empty to send the whole board" />
      </label>
    </ProjectActionShell>
  );
}
