"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import {
  classifyUploadError,
  discardRawUpload,
  discardUnreferencedArtwork,
  UploadCancelledError,
  uploadDesignAsset,
} from "./artwork-files";
import {
  discardPreparedAssets,
  preparePublicationAssets,
  sanitizeVideoAsset,
} from "./media-client";
import {
  addDesign,
  clearMiroLink,
  createDesignVersion,
  findDesignByAsset,
  findUnchangedDesign,
  publishVersion,
  reviewPublication,
  setMiroLink,
  submitDesignVersion,
  updateDesignContent,
  updateWorkingDesign,
  useInvalidateProject,
  useLatestMiroLink,
  type CanvasDesign,
  type CanvasVersion,
  type ProjectChannel,
} from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl } from "./miro-links";
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
  | { kind: "edit-design"; version: CanvasVersion; design: CanvasDesign }
  | { kind: "miro"; version: CanvasVersion; channel: ProjectChannel };
const titles = {
  version: "A fresh version.",
  design: "Add a design.",
  "edit-design": "Edit working design.",
  publish: "Share with the client.",
  submit: "Ready for the studio?",
  review: "Your thoughts make it better.",
} as const;
// Not "Link a Miro frame." — the Modal's close button aria-label prefixes the title with
// "Close ", and that exact phrase collides with the field's own `/Miro frame/` query in tests.
// Same reason for "Change the Miro link.": neither variant says "frame".
function miroTitle(hasLink: boolean) {
  return hasLink ? "Change the Miro link." : "Add a Miro link.";
}

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
  // `null` means no video transfer or processing is running; once one begins it is set to 0 and
  // tracks `uploadDesignAsset`'s `onProgress` fraction up to 1, where processing takes over. A
  // video's own resumable transfer can run for many minutes, so this is what turns "Saving…"
  // into an honest, moving number instead of a hang.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Distinguishes "Continuing from N%" from "Sending N%"; set only by `onResuming`, which fires
  // when the transfer resumes an earlier attempt at the same file.
  const [continuing, setContinuing] = useState(false);
  // The running attempt's abort handle, and the raw file its transfer produced. `storedVideo`
  // outlives a transient processing failure, so "Try processing again" can reprocess the stored
  // raw file without sending it again.
  const controllerRef = useRef<AbortController | null>(null);
  const rawPathRef = useRef<string | null>(null);
  const [storedVideo, setStoredVideo] = useState<{
    projectId: string;
    rawPath: string;
    mimeType: string;
  } | null>(null);
  function forgetVideo() {
    rawPathRef.current = null;
    setStoredVideo(null);
    setContinuing(false);
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
  // What a new Miro link starts from: a client link only from an earlier publication, an internal
  // link only from an earlier internal version. The hook runs on every render; `enabled` scopes it.
  const miroChannel: ProjectChannel = action?.kind === "miro" ? action.channel : "client";
  const miroTarget = action?.kind === "publish" || action?.kind === "miro" ? action.version : null;
  const latestMiro = useLatestMiroLink(
    miroTarget?.deliverableId ?? "",
    miroChannel,
    action?.kind === "miro"
      ? { excludeId: action.version.id, enabled: !action.version.miro }
      : { enabled: action?.kind === "publish" },
  );
  const miroPrefill =
    action?.kind === "miro" && action.version.miro
      ? miroBoardUrl(action.version.miro)
      : latestMiro.data
        ? miroBoardUrl(latestMiro.data)
        : "";
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
          // "Try processing again": the last attempt's transfer finished but its processing
          // failed transiently even after the automatic retry, so the stored raw file is
          // reprocessed without sending it again. Any other failure (invalid content, an expired
          // or cancelled upload, a failed transfer) starts a full attempt, which resumes the
          // transfer where it can.
          const retry =
            isVideo &&
            storedVideo &&
            mutation.error &&
            classifyUploadError(mutation.error) === "transient"
              ? storedVideo
              : null;
          if (!retry) forgetVideo();
          const controller = new AbortController();
          controllerRef.current = controller;
          if (isVideo) setUploadProgress(retry ? 1 : 0);
          path = retry
            ? (await sanitizeVideoAsset(database, mediaUrl, retry, controller.signal)).path
            : await uploadDesignAsset(database, mediaUrl, projectId, file, {
                onProgress: isVideo ? setUploadProgress : undefined,
                onResuming: isVideo ? () => setContinuing(true) : undefined,
                onRawPath: isVideo
                  ? (rawPath) => {
                      rawPathRef.current = rawPath;
                      setStoredVideo({ projectId, rawPath, mimeType: file.type });
                    }
                  : undefined,
                signal: controller.signal,
              });
          // A cancel that lands just after processing answered must still leave no design behind.
          if (controller.signal.aborted) throw new UploadCancelledError();
          // The file is stored; only the design itself is saved from here, which Cancel does not
          // interrupt, the same as every other action.
          forgetVideo();
          setUploadProgress(null);
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
      } else if (action.kind === "miro") {
        const miroUrl = value("miro");
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
    // Nothing is transferring or processing any more, so the progress line and the unload
    // warning go away; a retained raw file stays in `storedVideo` for "Try processing again".
    onError: () => setUploadProgress(null),
  });

  // A video transfer or its processing is running: the one pending state Cancel can stop.
  const uploading = mutation.isPending && uploadProgress !== null;

  /** Stops the running video upload and returns the dialog to choosing a file. */
  function cancelUpload() {
    controllerRef.current?.abort();
    const rawPath = rawPathRef.current;
    forgetVideo();
    // A failed discard leaves the raw file to the media service's 24-hour sweep.
    if (rawPath) void discardRawUpload(database, mediaUrl, { projectId, rawPath }).catch(() => {});
  }

  async function close() {
    // Saving a design, a version, a publication or a review cannot be stopped midway, so closing
    // waits for it; only a video upload can be abandoned, and closing then stops it first.
    if (closing || (mutation.isPending && !uploading)) return;
    controllerRef.current?.abort();
    const rawPath = rawPathRef.current;
    setClosing(true);
    setCloseError("");
    try {
      if (rawPath)
        await discardRawUpload(database, mediaUrl, { projectId, rawPath }).catch(() => {});
      if (stagedArtwork) await discardUnreferencedArtwork(database, stagedArtwork);
      forgetVideo();
      setUploadProgress(null);
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }

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
  const uploadErrorKind =
    mutation.error && (action?.kind === "design" || action?.kind === "edit-design")
      ? classifyUploadError(mutation.error)
      : null;
  // Only a video whose transfer finished can be reprocessed without sending it again.
  const canRetryProcessing = uploadErrorKind === "transient" && storedVideo !== null;

  return (
    <>
      <Modal
        open={!!action && !suspended}
        initialFocusRef={returningFromPlayground ? playgroundTrigger : undefined}
        onClose={() => void close()}
        title={
          action
            ? action.kind === "miro"
              ? miroTitle(!!action.version.miro)
              : titles[action.kind]
            : "Project action"
        }
        closeDisabled={closing || (mutation.isPending && !uploading)}
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
                    onChange={() => {
                      forgetVideo();
                      if (mutation.error) mutation.reset();
                    }}
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
                      {sanitizing
                        ? "Processing…"
                        : `${continuing ? "Continuing from" : "Sending"} ${Math.round(uploadProgress * 100)}%`}
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
                <MiroField
                  prefill={miroPrefill}
                  loading={latestMiro.isPending && latestMiro.fetchStatus !== "idle"}
                  hint="The client opens this frame from the version. Copy the frame's link in Miro."
                />
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
            {action.kind === "miro" && (
              <>
                <p>
                  {action.channel === "client"
                    ? "The client opens this frame from the shared version."
                    : "Assigned designers open this frame from the version. The client never sees it."}
                </p>
                <MiroField
                  prefill={miroPrefill}
                  loading={latestMiro.isPending && latestMiro.fetchStatus !== "idle"}
                  hint="Leave empty to remove the link."
                />
              </>
            )}
            {uploadErrorKind === "cancelled" && !closeError && (
              <p className="upload-progress" aria-live="polite">
                <span>Upload cancelled.</span>
              </p>
            )}
            {uploadErrorKind === "expired" && !closeError && (
              <FormError>The upload expired; choose the file again.</FormError>
            )}
            {((mutation.error &&
              uploadErrorKind !== "cancelled" &&
              uploadErrorKind !== "expired") ||
              closeError) && <FormError>{closeError || mutation.error?.message}</FormError>}
            <div className="form-actions">
              <button
                className="button"
                type="button"
                onClick={() => (uploading ? cancelUpload() : void close())}
                disabled={closing || (mutation.isPending && !uploading)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? sanitizing
                    ? "Processing…"
                    : uploadProgress !== null
                      ? `${continuing ? "Continuing from" : "Sending"} ${Math.round(uploadProgress * 100)}%`
                      : "Saving…"
                  : canRetryProcessing
                    ? "Try processing again"
                    : {
                        version: "Create version",
                        design: "Add design",
                        "edit-design": "Save working design",
                        publish: "Share version",
                        submit: "Send to studio",
                        review: "Send review",
                        miro: "Save link",
                      }[action.kind]}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/**
 * The Miro link input; remounted once its prefill arrives so `defaultValue` takes it. It is a text
 * input, not `type="url"`, so the dialog's own message (not the browser's) explains a bad link.
 */
function MiroField({
  prefill,
  loading,
  hint,
}: {
  prefill: string;
  loading: boolean;
  hint: string;
}) {
  return (
    <label>
      Miro frame (optional)
      <input
        key={loading ? "loading" : prefill}
        name="miro"
        type="text"
        inputMode="url"
        defaultValue={prefill}
        disabled={loading}
        placeholder="https://miro.com/app/board/…/?moveToWidget=…"
      />
      <small>{hint}</small>
    </label>
  );
}
