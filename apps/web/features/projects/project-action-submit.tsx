"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { submitDesignVersion, type CanvasVersion } from "./project-data";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type SubmitAction = { kind: "submit"; version: CanvasVersion };

/** "Ready for the studio?" — sends a working version for internal review. */
export function ProjectActionSubmit({
  action,
  suspended,
  onClose,
}: {
  action: SubmitAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async () => {
      await submitDesignVersion(database, { versionId: action.version.id });
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
      title="Ready for the studio?"
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : "Send to studio"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <p>
        Send this version to the studio for an internal review. The client will see it after the
        studio shares it.
      </p>
    </ProjectActionShell>
  );
}
