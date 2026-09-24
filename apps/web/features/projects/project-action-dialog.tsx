"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { discardUnreferencedArtwork, uploadDesignAsset } from "./artwork-files";
import { discardPreparedAssets, preparePublicationAssets } from "./media-client";
import {
  addDesign,
  createDesignVersion,
  findDesignByAsset,
  findUnchangedDesign,
  publishVersion,
  reviewPublication,
  submitDesignVersion,
  updateDesignContent,
  updateWorkingDesign,
  useInvalidateProject,
  type CanvasDesign,
  type CanvasVersion,
} from "./project-data";
import { FormError } from "@/features/shared/form-error";
import {
  ARTWORK_MAX_BYTES,
  designUploadMimes,
  uploadLimitMb,
  uploadTypesLabel,
  VIDEO_MAX_BYTES,
} from "@/features/shared/upload-rules";

export type ProjectAction =
  | { kind: "version"; deliverableId: string; sourceVersionId?: string }
  | { kind: "design" | "publish" | "submit" | "review"; version: CanvasVersion }
  | { kind: "edit-design"; version: CanvasVersion; design: CanvasDesign };
const titles = {
  version: "A fresh version.",
  design: "Add a design.",
  "edit-design": "Edit working design.",
  publish: "Share with the client.",
  submit: "Ready for the studio?",
  review: "Your thoughts make it better.",
};

export function ProjectActionDialog({
  action,
  projectId,
  suspended,
  onOpenPlayground,
  onClose,
}: {
  action: ProjectAction | null;
  projectId: string;
  suspended: boolean;
  onOpenPlayground: () => void;
  onClose: () => void;
}) {
  const { database, mediaUrl } = useAuth();
  const invalidate = useInvalidateProject();
  const [stagedArtwork, setStagedArtwork] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [returningFromPlayground, setReturningFromPlayground] = useState(false);
  const playgroundTrigger = useRef<HTMLButtonElement>(null);
  // `null` means no upload is in flight (or none was ever started for this attempt); once an
  // upload begins it's set to 0 and tracks `uploadDesignAsset`'s `onProgress` fraction up to 1.
  // A video's own resumable transfer can run for many minutes, so this is what turns "Saving…"
  // into an honest, moving number instead of a hang.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  async function close() {
    // `mutation.isPending` covers the whole upload, not just the initial request: `mutationFn`
    // does not resolve until `uploadDesignAsset` does, so this guard — and the disabled Cancel
    // button and disabled Modal close control below — already refuse to close the dialog while a
    // video is mid-transfer. `uploadResumable` (in `artwork-files.ts`) does not currently expose
    // the `tus.Upload` handle needed to abort a transfer server-side, so "closing" today could
    // only ever hide the request, not stop it, while still leaving the raw object it's writing to
    // `internal-assets` behind. Real cancellation (threading an abort handle out through
    // `uploadDesignAsset` and a new branch here) is a deliberate follow-up, not something ruled
    // out — until it lands, blocking the close keeps the visible state honest about what's
    // actually still happening.
    if (mutation.isPending || closing) return;
    setClosing(true);
    setCloseError("");
    try {
      if (stagedArtwork) await discardUnreferencedArtwork(database, stagedArtwork);
      setUploadProgress(null);
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }
  // A video upload can run for many minutes, unattended, with nothing on screen to catch outside
  // this tab. Mirrors the `beforeunload` guard in `features/brand/draft-editor.tsx`: it can only
  // warn, not stop the navigation, but a silent tab close abandoning a half-finished upload with
  // no warning at all is worse than a confirmation prompt.
  useEffect(() => {
    if (uploadProgress === null) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadProgress]);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!action) return;
      const value = (name: string) => String(form.get(name) ?? "").trim();
      if (action.kind === "version") {
        await createDesignVersion(database, {
          deliverableId: action.deliverableId,
          notes: value("notes"),
          copyVersionId:
            form.get("copy") && action.sourceVersionId ? action.sourceVersionId : undefined,
        });
      } else if (action.kind === "design" || action.kind === "edit-design") {
        if (!value("title")) throw new Error("Add a design name.");
        const file = form.get("artwork");
        let path = stagedArtwork;
        if (!path && file instanceof File && file.size) {
          // Mirrors the branch `uploadDesignAsset` takes internally: an image goes down the
          // canvas path (`uploadArtwork`), which never calls `onProgress`, so a bar or a
          // percentage tied to that path would sit frozen at 0% for the ~second an image takes —
          // reading as a stall for an operation that is in fact completing normally. Progress is
          // only meaningful, and only shown, for the video path.
          const isVideo = file.type.startsWith("video/");
          if (isVideo) setUploadProgress(0);
          path = await uploadDesignAsset(database, mediaUrl, projectId, file, {
            onProgress: isVideo ? setUploadProgress : undefined,
          });
        }
        if (path) setStagedArtwork(path);
        const designContent = {
          ...(action.kind === "edit-design" ? Object(action.design.content) : {}),
          headline: value("headline") || value("title"),
          body: value("body"),
          background: value("background"),
          foreground: value("foreground"),
          eyebrow: value("eyebrow"),
        };
        if (action.kind === "edit-design") {
          const payload = {
            title: value("title"),
            content: designContent,
            assetPath: path ?? action.design.assetPath,
          };
          const unchanged = await findUnchangedDesign(database, {
            id: action.design.id,
            ...payload,
          });
          if (unchanged.length) return;
          await updateWorkingDesign(database, {
            id: action.design.id,
            ...payload,
            previousTitle: action.design.title,
            previousContent: action.design.content,
            previousAssetPath: action.design.assetPath,
          });
        } else {
          const existing = path
            ? await findDesignByAsset(database, {
                versionId: action.version.id,
                assetPath: path,
              })
            : [];
          if (existing[0])
            await updateDesignContent(database, {
              id: existing[0].id,
              title: value("title"),
              content: designContent,
            });
          else
            await addDesign(database, {
              versionId: action.version.id,
              title: value("title"),
              content: designContent,
              internalAssetPath: path,
            });
        }
      } else if (action.kind === "publish") {
        const assets = await preparePublicationAssets(database, mediaUrl, action.version.id);
        try {
          await publishVersion(database, {
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
      } else if (action.kind === "submit") {
        await submitDesignVersion(database, { versionId: action.version.id });
      } else if (action.kind === "review") {
        await reviewPublication(database, {
          publicationId: action.version.id,
          decision: value("decision"),
          feedback: value("feedback"),
        });
      }
    },
    onSuccess: async () => {
      setUploadProgress(null);
      await invalidate();
      onClose();
    },
  });

  const current = action?.kind === "edit-design" ? action.design : null;
  const content =
    current?.content && typeof current.content === "object" && !Array.isArray(current.content)
      ? current.content
      : {};
  const field = (name: string, fallback = "") =>
    typeof content[name] === "string" ? (content[name] as string) : fallback;

  // The resumable transfer reports its own fraction up to exactly 1 (tus's `onProgress` fires
  // with `sent === total` on the last chunk); reaching 1 while the mutation is still pending
  // means the bytes are on `internal-assets` and control has moved into `sanitizeVideoAsset`,
  // which can run for several more minutes with no progress channel of its own. `uploadProgress`
  // is only ever set for the video branch (see the round-1 fix in `mutationFn`), so this can
  // never be true for an image upload. Once the mutation settles — success or failure —
  // `mutation.isPending` goes false and this reverts on its own; nothing here needs its own reset.
  const sanitizing = mutation.isPending && uploadProgress === 1;

  return (
    <>
      <Modal
        open={!!action && !suspended}
        initialFocusRef={returningFromPlayground ? playgroundTrigger : undefined}
        onClose={() => void close()}
        title={action ? titles[action.kind] : "Project action"}
        closeDisabled={mutation.isPending || closing}
      >
        {action && (
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(new FormData(event.currentTarget));
            }}
          >
            {action.kind === "version" && (
              <>
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
              </>
            )}
            {(action.kind === "design" || action.kind === "edit-design") && (
              <>
                <button
                  className="button quiet"
                  type="button"
                  disabled={mutation.isPending || closing}
                  ref={playgroundTrigger}
                  onClick={() => {
                    setReturningFromPlayground(true);
                    onOpenPlayground();
                  }}
                >
                  Open Playground
                </button>
                <label>
                  Design name
                  <input
                    name="title"
                    defaultValue={current?.title ?? ""}
                    required
                    maxLength={160}
                    placeholder="e.g. Hero — direction A"
                  />
                </label>
                <label>
                  Design file
                  <input
                    name="artwork"
                    type="file"
                    disabled={!!stagedArtwork || mutation.isPending}
                    accept={designUploadMimes.join(",")}
                  />
                  <small>
                    {uploadTypesLabel(designUploadMimes)}. Images up to{" "}
                    {uploadLimitMb(ARTWORK_MAX_BYTES)} MB, video up to{" "}
                    {uploadLimitMb(VIDEO_MAX_BYTES)} MB.
                  </small>
                </label>
                {uploadProgress !== null && (
                  <p className="upload-progress" aria-live="polite">
                    {sanitizing ? (
                      // No `value`: an indeterminate `<progress>` renders as an animated bar in
                      // every evergreen browser, which is the honest signal here — the transfer is
                      // done, the server is remuxing, and there is no percentage to report for that
                      // step. A bar pinned at 100% would say "done" for an operation that is not.
                      <progress max={1} aria-label="Processing video" />
                    ) : (
                      <progress value={uploadProgress} max={1} aria-label="Upload progress" />
                    )}
                    <span>
                      {sanitizing ? "Processing…" : `${Math.round(uploadProgress * 100)}%`}
                    </span>
                  </p>
                )}
                <details className="design-text-options">
                  <summary>Or compose a text concept</summary>
                  <label>
                    Brand label
                    <input name="eyebrow" defaultValue={field("eyebrow")} maxLength={80} />
                  </label>
                  <label>
                    Headline
                    <textarea
                      name="headline"
                      defaultValue={field("headline")}
                      rows={2}
                      maxLength={240}
                    />
                  </label>
                  <label>
                    Supporting copy
                    <textarea name="body" defaultValue={field("body")} rows={2} maxLength={1000} />
                  </label>
                  <div className="form-row">
                    <label>
                      Background
                      <input
                        type="color"
                        name="background"
                        defaultValue={field("background", "#f2f0e8")}
                      />
                    </label>
                    <label>
                      Text
                      <input
                        type="color"
                        name="foreground"
                        defaultValue={field("foreground", "#20231f")}
                      />
                    </label>
                  </div>
                </details>
              </>
            )}
            {action.kind === "publish" && (
              <>
                <p>
                  The client will receive a fixed copy of this version. Future studio edits remain
                  private.
                </p>
                <label>
                  A note for the client
                  <textarea
                    name="note"
                    rows={4}
                    placeholder="What should they look for?"
                    maxLength={2000}
                  />
                </label>
              </>
            )}
            {action.kind === "submit" && (
              <p>
                Send this version to the studio for an internal review. The client will see it after
                the studio shares it.
              </p>
            )}
            {action.kind === "review" && (
              <>
                <label>
                  Your decision
                  <select name="decision" defaultValue="approved">
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
              </>
            )}
            {(mutation.error || closeError) && (
              <FormError>{closeError || mutation.error?.message}</FormError>
            )}
            <div className="form-actions">
              <button
                className="button"
                type="button"
                onClick={() => void close()}
                disabled={mutation.isPending || closing}
              >
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? sanitizing
                    ? "Processing…"
                    : uploadProgress !== null
                      ? `Uploading… ${Math.round(uploadProgress * 100)}%`
                      : "Saving…"
                  : {
                      version: "Create version",
                      design: "Add design",
                      "edit-design": "Save working design",
                      publish: "Share version",
                      submit: "Send to studio",
                      review: "Send review",
                    }[action.kind]}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
