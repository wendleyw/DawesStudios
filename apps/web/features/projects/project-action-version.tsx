"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { createDesignVersion } from "./project-data";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type VersionAction = { kind: "version"; deliverableId: string; sourceVersionId?: string };

/** "A fresh version." — starts a new working version, optionally copied from the previous one. */
export function ProjectActionVersion({
  action,
  suspended,
  onClose,
}: {
  action: VersionAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      await createDesignVersion(database, {
        deliverableId: action.deliverableId,
        notes: value("notes"),
        copyVersionId:
          form.get("copy") && action.sourceVersionId ? action.sourceVersionId : undefined,
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
      title="A fresh version."
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : "Create version"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <p>Keep earlier work intact while exploring what’s next.</p>
      <label>
        Version note
        <textarea name="notes" rows={3} placeholder="What will this version explore?" />
      </label>
      {action.sourceVersionId && (
        <label className="checkbox-label">
          <input name="copy" type="checkbox" defaultChecked />
          Start from the previous version
        </label>
      )}
    </ProjectActionShell>
  );
}
