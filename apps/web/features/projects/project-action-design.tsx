"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  classifyUploadError,
  discardRawUpload,
  discardUnreferencedArtwork,
  UploadCancelledError,
  uploadDesignAsset,
} from "./artwork-files";
import { sanitizeVideoAsset } from "./media-client";
import {
  addDesign,
  findDesignByAsset,
  findUnchangedDesign,
  updateDesignContent,
  updateWorkingDesign,
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
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";
import { DesignTextOptions } from "./project-action-design-text-options";
import { UploadStatus } from "./project-action-design-upload-status";

export type DesignAction =
  | { kind: "design"; version: CanvasVersion }
  | { kind: "edit-design"; version: CanvasVersion; design: CanvasDesign };

const titles = { design: "Add a design.", "edit-design": "Edit working design." } as const;
const submitLabels = { design: "Add design", "edit-design": "Save working design" } as const;

/**
 * "Add a design."/"Edit working design." — design and edit-design share this component because
 * they share the same form and the same image/video upload path; see
 * `docs/architecture/playground-and-board-widgets.md` and this feature's README for the upload
 * lifecycle `uploadDesignAsset` and `sanitizeVideoAsset` implement.
 */
export function ProjectActionDesign({
  action,
  projectId,
  suspended,
  onOpenPlayground,
  onClose,
}: {
  action: DesignAction;
  projectId: string;
  suspended: boolean;
  onOpenPlayground: () => void;
  onClose: () => void;
}) {
  const { database, mediaUrl } = useAuth();
  const [stagedArtwork, setStagedArtwork] = useState<string | null>(null);
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
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
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
    },
    onSuccess: async () => {
      setUploadProgress(null);
      await closeOnSuccess();
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

  // Saving a design cannot be stopped midway, so closing waits for it; only a video upload can be
  // abandoned, and closing then stops it first.
  const { closing, closeError, closeDisabled, close } = useProjectActionClose({
    onClose,
    pending: mutation.isPending,
    uploading,
    beforeClose: async () => {
      controllerRef.current?.abort();
      const rawPath = rawPathRef.current;
      if (rawPath)
        await discardRawUpload(database, mediaUrl, { projectId, rawPath }).catch(() => {});
      if (stagedArtwork) await discardUnreferencedArtwork(database, stagedArtwork);
      forgetVideo();
      setUploadProgress(null);
    },
  });

  const current = action.kind === "edit-design" ? action.design : null;
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
  const uploadErrorKind = mutation.error ? classifyUploadError(mutation.error) : null;
  // Only a video whose transfer finished can be reprocessed without sending it again.
  const canRetryProcessing = uploadErrorKind === "transient" && storedVideo !== null;
  const showFallbackError =
    (mutation.error && uploadErrorKind !== "cancelled" && uploadErrorKind !== "expired") ||
    !!closeError;

  return (
    <ProjectActionShell
      open={!suspended}
      title={titles[action.kind]}
      initialFocusRef={returningFromPlayground ? playgroundTrigger : undefined}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => (uploading ? cancelUpload() : void close())}
      cancelDisabled={closeDisabled}
      submitLabel={
        mutation.isPending
          ? sanitizing
            ? "Processing…"
            : uploadProgress !== null
              ? `${continuing ? "Continuing from" : "Sending"} ${Math.round(uploadProgress * 100)}%`
              : "Saving…"
          : canRetryProcessing
            ? "Try processing again"
            : submitLabels[action.kind]
      }
      submitDisabled={mutation.isPending}
      error={showFallbackError ? closeError || mutation.error?.message : undefined}
    >
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
          {uploadTypesLabel(designUploadMimes)}. Images up to {uploadLimitMb(ARTWORK_MAX_BYTES)} MB,
          video up to {uploadLimitMb(VIDEO_MAX_BYTES)} MB.
        </small>
      </label>
      <UploadStatus
        uploadProgress={uploadProgress}
        sanitizing={sanitizing}
        continuing={continuing}
      />
      <DesignTextOptions field={field} />
      {uploadErrorKind === "cancelled" && !closeError && (
        <p className="upload-progress" aria-live="polite">
          <span>Upload cancelled.</span>
        </p>
      )}
      {uploadErrorKind === "expired" && !closeError && (
        <FormError>The upload expired; choose the file again.</FormError>
      )}
    </ProjectActionShell>
  );
}
