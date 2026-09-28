"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { approveBoardRound, useInvalidateProject, type WorkflowBoard } from "./project-data";

/**
 * The studio's approval of the round on screen: the step between a designer's Send to studio and
 * Share with client. It needs no form, so it is a button rather than a dialog. The request key is
 * kept until the approval lands, so a retry after a lost response replays it instead of failing.
 */
export function ApproveRoundButton({
  board,
  roundId,
  roundNumber,
}: {
  board: WorkflowBoard;
  roundId: string;
  roundNumber: number;
}) {
  const { database } = useAuth();
  const invalidateProject = useInvalidateProject();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const approve = useMutation({
    mutationFn: () =>
      approveBoardRound(database, {
        boardId: board.id,
        roundId,
        boardRevision: board.workflowRevision,
        requestId,
      }),
    onSuccess: () => setRequestId(crypto.randomUUID()),
    onSettled: () => invalidateProject(),
  });
  return (
    <>
      {approve.error && (
        <span className="project-workflow-error" role="alert">
          {approve.error.message}
        </span>
      )}
      <button
        className="button primary"
        disabled={approve.isPending}
        aria-label={`Approve round ${roundNumber}`}
        onClick={() => approve.mutate()}
      >
        {approve.isPending ? "Approving…" : "Approve round"}
      </button>
    </>
  );
}
