"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { discardPreparedAssets, preparePublicationAssets } from "./media-client";
import { publishVersion, setMiroLink, useLatestMiroLink, type CanvasVersion } from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl } from "./miro-links";
import { MiroField } from "./project-action-miro";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type PublishAction = { kind: "publish"; version: CanvasVersion };

/** "Share with the client." — publishes an immutable client-channel snapshot of a version. */
export function ProjectActionPublish({
  action,
  suspended,
  onClose,
}: {
  action: PublishAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database, mediaUrl } = useAuth();
  // Prefills from the deliverable's newest earlier client-channel publication, not this version.
  const latestMiro = useLatestMiroLink(action.version.deliverableId, "client", { enabled: true });
  const miroPrefill = latestMiro.data ? miroBoardUrl(latestMiro.data) : "";
  const { invalidate, closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const miroUrl = value("miro");
      if (miroUrl && !parseMiroBoardUrl(miroUrl)) throw new Error(miroUrlHint);
      const assets = await preparePublicationAssets(database, mediaUrl, action.version.id);
      let publicationId: string;
      try {
        publicationId = await publishVersion(database, {
          versionId: action.version.id,
          releaseNote: value("note"),
          assets,
        });
      } finally {
        // Referenced files are retained; the server also expires abandoned preparations.
        await discardPreparedAssets(database, mediaUrl, Object.values(assets)).catch(
          () => undefined,
        );
      }
      if (miroUrl) {
        try {
          await setMiroLink(database, {
            channel: "client",
            versionId: publicationId,
            url: miroUrl,
          });
        } catch (error) {
          // Publishing without a key is idempotent, so sharing again returns this same
          // publication and retries only the link.
          await invalidate();
          throw new Error(
            `V${action.version.number} was shared, but the Miro link was not saved (${
              error instanceof Error ? error.message : "unknown error"
            }). Share again to retry the link.`,
          );
        }
      }
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
      title="Share with the client."
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : "Share version"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <p>
        The client will receive a fixed copy of this version. Future studio edits remain private.
      </p>
      <label>
        A note for the client
        <textarea name="note" rows={4} placeholder="What should they look for?" maxLength={2000} />
      </label>
      <MiroField
        prefill={miroPrefill}
        loading={latestMiro.isPending && latestMiro.fetchStatus !== "idle"}
        hint="The client opens this frame from the version. Copy the frame's link in Miro."
      />
    </ProjectActionShell>
  );
}
