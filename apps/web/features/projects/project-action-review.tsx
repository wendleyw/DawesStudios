"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { reviewPublication, type CanvasVersion } from "./project-data";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type ReviewDecision = "approved" | "changes_requested";
/** `decision` preselects the choice when the client started from an Approve/Request changes button. */
export type ReviewAction = { kind: "review"; version: CanvasVersion; decision?: ReviewDecision };

/** "Your thoughts make it better." — the client's approve/request-changes decision on a publication. */
export function ProjectActionReview({
  action,
  suspended,
  onClose,
}: {
  action: ReviewAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      await reviewPublication(database, {
        publicationId: action.version.id,
        decision: value("decision"),
        feedback: value("feedback"),
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
      title="Your thoughts make it better."
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : "Send review"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <label>
        Your decision
        <select name="decision" defaultValue={action.decision ?? "approved"}>
          <option value="approved">Approve this version</option>
          <option value="changes_requested">Request changes</option>
        </select>
      </label>
      <label>
        Feedback
        <textarea
          name="feedback"
          rows={4}
          placeholder="Share a little context. Required when requesting changes."
          maxLength={5000}
        />
      </label>
    </ProjectActionShell>
  );
}
