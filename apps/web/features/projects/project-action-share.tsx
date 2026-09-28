"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  shareWorkflowVersion,
  useLatestSharedMiroLink,
  type CanvasVersion,
  type ProjectWorkflow,
} from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl, type MiroLink } from "./miro-links";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type ShareAction = {
  kind: "share";
  projectId: string;
  /** The round being shared, or null for a version added directly in Shared with client. */
  round: CanvasVersion | null;
  /** The client board to start from; null lets the dialog read the latest shared link itself. */
  prefill: MiroLink | null;
  workflow: ProjectWorkflow;
  availableRounds: CanvasVersion[];
  boardNames?: Record<string, string>;
};

/**
 * Shares a client version: the agency pastes the client board's link after copying the design. An
 * action opened before the page had the latest shared link reads it here, so a quick click still
 * gets the prefill once it arrives.
 */
export function ProjectActionShare({
  action,
  onClose,
}: {
  action: ShareAction;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const latest = useLatestSharedMiroLink(action.projectId, action.prefill === null);
  const loading = action.prefill === null && latest.isPending && latest.fetchStatus !== "idle";
  const prefill = action.prefill ?? latest.data ?? null;
  const prefillUrl = prefill ? miroBoardUrl(prefill) : "";
  const [url, setUrl] = useState(prefillUrl);
  const urlTouched = useRef(false);
  useEffect(() => {
    if (!urlTouched.current && prefillUrl) setUrl(prefillUrl);
  }, [prefillUrl]);
  const [selected, setSelected] = useState<string[]>(action.round ? [action.round.id] : []);
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const url = value("miro");
      if (!parseMiroBoardUrl(url)) throw new Error(miroUrlHint);
      const note = value("note");
      const confirmReplacement = form.get("confirmReplacement") === "on";
      const payload = JSON.stringify({ url, note, selected, confirmReplacement });
      if (attempt.current?.payload !== payload)
        attempt.current = { payload, id: crypto.randomUUID() };
      const latestPublication = action.workflow.project.latestPublication;
      await shareWorkflowVersion(database, {
        projectId: action.projectId,
        url,
        note,
        sourceRoundIds: selected,
        latestPublicationId: latestPublication?.id ?? null,
        reviewRevision: latestPublication?.reviewRevision ?? null,
        confirmReplacement,
        requestId: attempt.current.id,
      });
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
      title={
        action.round
          ? `Share round ${action.round.number} with the client.`
          : "A new client version."
      }
      closeDisabled={closeDisabled}
      onModalClose={close}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={close}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Sharing…" : "Share with client"}
      submitDisabled={mutation.isPending}
      error={mutation.error?.message}
    >
      <p>
        Copy the design into the client board in Miro first, then paste that board or frame here.
      </p>
      <label>
        Client Miro board
        <input
          name="miro"
          required
          value={url}
          onChange={(event) => {
            urlTouched.current = true;
            setUrl(event.target.value);
          }}
          disabled={loading}
        />
      </label>
      <label>
        Note for the client
        <textarea name="note" rows={3} placeholder="What should the client look at?" />
      </label>
      {action.availableRounds.length > 0 && (
        <fieldset>
          <legend>Included working rounds</legend>
          {action.availableRounds.map((round) => (
            <label key={round.id}>
              <input
                type="checkbox"
                checked={selected.includes(round.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, round.id]
                      : current.filter((id) => id !== round.id),
                  )
                }
              />
              {round.boardId ? `${action.boardNames?.[round.boardId] ?? "Design board"} · ` : ""}R
              {round.number}
            </label>
          ))}
        </fieldset>
      )}
      {action.workflow.project.latestPublication &&
        action.workflow.project.latestPublication.decision !== "changes_requested" && (
          <label>
            <input type="checkbox" name="confirmReplacement" required />
            Replace the current V{action.workflow.project.latestPublication.number} review
          </label>
        )}
    </ProjectActionShell>
  );
}
