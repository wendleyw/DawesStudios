"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { useDateFormat } from "@/features/workspace/workspace-data";
import {
  createDesignBoard,
  updateDesignBoard,
  useProjectAssignments,
  type DesignBoard,
} from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl } from "./miro-links";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type BoardAction = {
  kind: "board";
  projectId: string;
  board?: DesignBoard;
  /** The project's own due date, the latest the board's date may be. */
  projectDueDate?: string | null;
};

/**
 * Adds or edits a design board: its name, its Miro link, the one designer who works on it and an
 * optional internal due date, which the client never sees and which may not fall after the
 * project's own due date.
 */
export function ProjectActionBoard({
  action,
  suspended,
  onClose,
}: {
  action: BoardAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const { formatDate } = useDateFormat();
  const latest = action.projectDueDate ?? undefined;
  const assignments = useProjectAssignments(action.projectId);
  const designers = (assignments.data?.members ?? []).filter((member) =>
    assignments.data?.assigned.includes(member.id),
  );
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const input = {
        name: value("name"),
        url: value("miro"),
        designerId: value("designer"),
        dueDate: value("due") || null,
      };
      if (!parseMiroBoardUrl(input.url)) throw new Error(miroUrlHint);
      // Same rule the server enforces; checked here so the dialog explains it before a round trip.
      if (latest && input.dueDate && input.dueDate > latest)
        throw new Error(`Set the board's due date on or before ${formatDate(latest)}.`);
      if (action.board) await updateDesignBoard(database, { boardId: action.board.id, ...input });
      else await createDesignBoard(database, { projectId: action.projectId, ...input });
    },
    onSuccess: closeOnSuccess,
  });
  const { closeError, closeDisabled, close } = useProjectActionClose({
    onClose,
    pending: mutation.isPending,
  });
  const submitLabel = action.board ? "Save board" : "Add board";
  return (
    <ProjectActionShell
      open={!suspended}
      title={action.board ? "Edit the design board." : "A design board."}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : submitLabel}
      submitDisabled={mutation.isPending || designers.length === 0}
      error={
        closeError ||
        mutation.error?.message ||
        assignments.error?.message ||
        (assignments.data && designers.length === 0
          ? "Assign a designer to the project first."
          : undefined)
      }
    >
      <p>The designer works here; only you and that designer see this board.</p>
      <label>
        Board name
        <input name="name" required maxLength={80} defaultValue={action.board?.name ?? ""} />
      </label>
      <label>
        Miro board
        <input
          name="miro"
          required
          defaultValue={action.board ? miroBoardUrl(action.board.miro) : ""}
        />
      </label>
      <label>
        Designer
        <select
          name="designer"
          required
          defaultValue={action.board?.designerId ?? designers[0]?.id}
        >
          {designers.map((designer) => (
            <option key={designer.id} value={designer.id}>
              {designer.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Board due date
        <input
          type="date"
          name="due"
          max={latest}
          defaultValue={action.board?.dueDate ?? ""}
          aria-describedby="board-due-hint"
        />
        <small id="board-due-hint">
          Internal: only you and the designer see it.{" "}
          {latest ? `The client's date is ${formatDate(latest)}.` : "The project has no due date."}
        </small>
      </label>
    </ProjectActionShell>
  );
}
