"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import {
  clearMiroLink,
  setMiroLink,
  useLatestMiroLink,
  type CanvasVersion,
  type ProjectChannel,
} from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl } from "./miro-links";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type MiroAction = { kind: "miro"; version: CanvasVersion; channel: ProjectChannel };

// Not "Link a Miro frame." — the Modal's close button aria-label prefixes the title with
// "Close ", and that exact phrase collides with the field's own `/Miro frame/` query in tests.
// Same reason for "Change the Miro link.": neither variant says "frame".
function miroTitle(hasLink: boolean) {
  return hasLink ? "Change the Miro link." : "Add a Miro link.";
}

/**
 * Sets or clears a single version's Miro link on whichever channel opened the dialog. A shared
 * version (a project-level client version of the Miro workspace) is nothing but its link, so its
 * link can be changed but never removed; the database refuses that too.
 */
export function ProjectActionMiro({
  action,
  suspended,
  onClose,
}: {
  action: MiroAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const linkRequired =
    action.channel === "client" &&
    action.version.deliverableId === null &&
    action.version.boardId === null;
  // Prefills from the deliverable's newest earlier link on the same channel, unless this version
  // already has its own link. The hook runs unconditionally; `enabled` scopes it.
  const latestMiro = useLatestMiroLink(action.version.deliverableId ?? "", action.channel, {
    excludeId: action.version.id,
    enabled: !action.version.miro,
  });
  const miroPrefill = action.version.miro
    ? miroBoardUrl(action.version.miro)
    : latestMiro.data
      ? miroBoardUrl(latestMiro.data)
      : "";
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const miroUrl = value("miro");
      if (!miroUrl && linkRequired) throw new Error("A shared version needs its Miro link.");
      if (!miroUrl)
        await clearMiroLink(database, { channel: action.channel, versionId: action.version.id });
      else {
        if (!parseMiroBoardUrl(miroUrl)) throw new Error(miroUrlHint);
        await setMiroLink(database, {
          channel: action.channel,
          versionId: action.version.id,
          url: miroUrl,
        });
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
      title={miroTitle(!!action.version.miro)}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : "Save link"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <p>
        {action.channel === "client"
          ? "The client opens this frame from the shared version."
          : "Assigned designers open this frame from the version. The client never sees it."}
      </p>
      <MiroField
        prefill={miroPrefill}
        loading={latestMiro.isPending && latestMiro.fetchStatus !== "idle"}
        required={linkRequired}
        hint={
          linkRequired
            ? "The client opens this version from this link."
            : "Leave empty to remove the link."
        }
      />
    </ProjectActionShell>
  );
}

/**
 * The Miro link input; remounted once its prefill arrives so `defaultValue` takes it. It is a text
 * input, not `type="url"`, so the dialog's own message (not the browser's) explains a bad link.
 */
export function MiroField({
  prefill,
  loading,
  hint,
  required = false,
}: {
  prefill: string;
  loading: boolean;
  hint: string;
  /** A shared version's link cannot be left empty; everywhere else the link is optional. */
  required?: boolean;
}) {
  return (
    <label>
      {required ? "Miro frame" : "Miro frame (optional)"}
      <input
        key={loading ? "loading" : prefill}
        name="miro"
        type="text"
        inputMode="url"
        defaultValue={prefill}
        disabled={loading}
        required={required}
        placeholder="https://miro.com/app/board/…/?moveToWidget=…"
      />
      <small>{hint}</small>
    </label>
  );
}
