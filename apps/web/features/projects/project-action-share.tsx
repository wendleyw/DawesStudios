"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { shareMiroVersion, type CanvasVersion } from "./project-data";
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
  prefill: MiroLink | null;
};

/** Shares a client version: the agency pastes the client board's link after copying the design. */
export function ProjectActionShare({
  action,
  suspended,
  onClose,
}: {
  action: ShareAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
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
  const { closeError, closeDisabled, close } = useProjectActionClose({
    onClose,
    pending: mutation.isPending,
  });
  return (
    <ProjectActionShell
      open={!suspended}
      title={
        action.round
          ? `Share round ${action.round.number} with the client.`
          : "A new client version."
      }
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Sharing…" : "Share with client"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <p>
        Copy the design into the client board in Miro first, then paste that board or frame here.
      </p>
      <label>
        Client Miro board
        <input
          name="miro"
          required
          defaultValue={action.prefill ? miroBoardUrl(action.prefill) : ""}
        />
      </label>
      <label>
        Note for the client
        <textarea name="note" rows={3} placeholder="What should the client look at?" />
      </label>
    </ProjectActionShell>
  );
}
