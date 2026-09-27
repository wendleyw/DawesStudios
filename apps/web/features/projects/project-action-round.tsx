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

/**
 * The message shown in place of the raw `send_board_round` error once the agency has reassigned
 * the board away from this designer mid-session: RLS then hides the board's row from their still-
 * open realtime subscription, so the server's "Board access required" (42501) is the first sign the
 * designer's copy of the board is stale.
 */
const boardReassignedMessage = "This board is no longer assigned to you.";

/** "Send to studio": the designer's next round of their board, with a note and an optional frame. */
export function ProjectActionRound({
  action,
  onClose,
}: {
  action: RoundAction;
  onClose: () => void;
}) {
  const { database } = useAuth();
  // One key per open dialog: a retry after a failure replays the same send.
  const idempotencyKey = useRef(crypto.randomUUID());
  const { invalidate, closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const frameUrl = value("frame");
      if (frameUrl && !parseMiroBoardUrl(frameUrl)) throw new Error(miroUrlHint);
      try {
        await sendBoardRound(database, {
          boardId: action.board.id,
          note: value("note"),
          frameUrl,
          idempotencyKey: idempotencyKey.current,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Board access required")) {
          // The board's row has already vanished from this designer's list on the server; pull
          // it out of the cache too so the workspace falls back before the next 30s poll.
          await invalidate();
          throw new Error(boardReassignedMessage);
        }
        throw error;
      }
    },
    onSuccess: closeOnSuccess,
  });
  const { closeDisabled, close } = useProjectActionClose({
    onClose,
    pending: mutation.isPending,
  });
  return (
    <ProjectActionShell
      open
      title={`Send ${action.board.name} to the studio.`}
      closeDisabled={closeDisabled}
      onModalClose={close}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={close}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Sending…" : "Send to studio"}
      submitDisabled={mutation.isPending}
      error={mutation.error?.message}
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
