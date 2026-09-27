"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { shareMiroVersion, useLatestSharedMiroLink, type CanvasVersion } from "./project-data";
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
  const idempotencyKey = useRef(crypto.randomUUID());
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const url = value("miro");
      if (!parseMiroBoardUrl(url)) throw new Error(miroUrlHint);
      await shareMiroVersion(database, {
        projectId: action.projectId,
        url,
        note: value("note"),
        sourceRoundId: action.round?.id ?? null,
        idempotencyKey: idempotencyKey.current,
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
        {/* Remounted once a late prefill arrives, so `defaultValue` takes it. */}
        <input
          key={loading ? "loading" : prefillUrl}
          name="miro"
          required
          defaultValue={prefillUrl}
          disabled={loading}
        />
      </label>
      <label>
        Note for the client
        <textarea name="note" rows={3} placeholder="What should the client look at?" />
      </label>
    </ProjectActionShell>
  );
}
