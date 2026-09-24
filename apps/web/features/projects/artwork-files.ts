import * as tus from "tus-js-client";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import {
  ARTWORK_MAX_BYTES,
  VIDEO_MAX_BYTES,
  isVideoUpload,
  uploadSizeMessage,
  uploadTypeMessage,
  videoUploadMimes,
} from "@/features/shared/upload-rules";
import { discardRawAsset, MediaRequestError, sanitizeVideoAsset } from "./media-client";

/**
 * The lifecycle of an uploaded design artwork: preparing the image, storing it, and removing one
 * that no design ended up referencing. The signed URL that displays a stored artwork is a read, and
 * lives with the feature's other read hooks in `project-data.ts`.
 */

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The tus fingerprint used for a video's resumable transfer, scoped so the same file never
 * resumes another project's or another user's upload. */
export function videoFingerprint(userId: string, projectId: string, file: File): string {
  return `dawes-video:${userId}:${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

/** Thrown when a person cancels an upload deliberately, so callers can tell it apart from a real
 * failure and skip both the automatic retry and any "please try again" messaging. */
export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
  }
}

/** Thrown when the resumable upload URL a previous attempt created is gone — the 24-hour Supabase
 * resumable window (or, in production, the R2 lifecycle rule) has passed. */
export class UploadExpiredError extends Error {
  constructor() {
    super("The upload expired; choose the file again.");
    this.name = "UploadExpiredError";
  }
}

export type UploadErrorKind = "cancelled" | "expired" | "transient" | "permanent";

/** Classifies a failure from the upload/processing path. A network-level rejection that never
 * reached the media service (a dropped connection, `AbortSignal.timeout` firing) carries no HTTP
 * status of its own and is treated the same as a 5xx: both deserve the one automatic retry. */
export function classifyUploadError(error: unknown): UploadErrorKind {
  if (error instanceof UploadCancelledError) return "cancelled";
  if (error instanceof UploadExpiredError) return "expired";
  // A cancel during the processing phase aborts `sanitizeVideoAsset`'s fetch directly, so the
  // rejection is a plain DOMException named "AbortError". `AbortSignal.timeout` firing on its own
  // (a genuine timeout, not a deliberate cancel) is named "TimeoutError" instead and must stay
  // transient. The name is checked rather than the class, because the rejection's DOMException can
  // come from another realm than this module's global (as it does under jsdom).
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  )
    return "cancelled";
  if (error instanceof MediaRequestError) {
    if (error.status === 410) return "expired";
    if (error.status === 408 || error.status === 429 || error.status >= 500) return "transient";
    return "permanent";
  }
  return "transient";
}

/** Deletes a raw upload the person cancelled mid-processing. Deleting an already-missing raw file
 * succeeds, so a repeated cancel is safe. */
export async function discardRawUpload(
  database: SupabaseDatabase,
  mediaUrl: string,
  input: { projectId: string; rawPath: string },
): Promise<void> {
  await discardRawAsset(database, mediaUrl, input);
}

/** Only `uploadArtwork` prepares an image, so this stays internal to the module. */
async function sanitizeArtwork(file: Blob): Promise<Blob> {
  if (!allowedImageTypes.has(file.type))
    throw new Error("Choose a PNG, JPG, or WebP image for the design preview.");
  // `ARTWORK_MAX_BYTES`, not the bucket limit: this check is the only guard in front of the
  // decode below, and the megapixel guard cannot run until the bitmap has already been allocated.
  if (file.size > ARTWORK_MAX_BYTES) throw new Error(uploadSizeMessage(ARTWORK_MAX_BYTES));
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("Please resize the image to fewer than 40 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the image."))),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}

export async function uploadArtwork(database: SupabaseDatabase, projectId: string, file: Blob) {
  const image = await sanitizeArtwork(file);
  const path = `${projectId}/${crypto.randomUUID()}.png`;
  assertResult(
    await database.storage
      .from("internal-assets")
      .upload(path, image, { contentType: "image/png", upsert: false }),
  );
  return path;
}

/**
 * Removes an artwork the dialog uploaded but never attached to a design.
 *
 * The reference check is what makes the removal safe: a second attempt at the same upload resolves
 * to the design row already holding this path, and closing the dialog afterwards must not delete
 * the file that design now points at.
 */
export async function discardUnreferencedArtwork(database: SupabaseDatabase, path: string) {
  const rows = assertResult(
    await database.from("designs").select("id").eq("internal_asset_path", path),
  );
  if (!rows.length) assertResult(await database.storage.from("internal-assets").remove([path]));
}

/** The shape `apps/media` accepts for a raw upload of this project, `<projectId>/<uuid>.raw`. */
function isRawVideoPath(projectId: string, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`${projectId}/`) &&
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.raw$/.test(path)
  );
}

/** Forgets every stored resume point for a fingerprint, so a cancelled transfer is never resumed. */
async function forgetResumePoints(fingerprint: string) {
  const storage = tus.defaultOptions.urlStorage;
  const stored = await storage.findUploadsByFingerprint(fingerprint);
  await Promise.all(stored.map((entry) => storage.removeUpload(entry.urlStorageKey)));
}

/**
 * Uploads through Supabase's TUS endpoint, resuming a previous attempt for the same file when one
 * exists, and resolves with the raw path the file landed on.
 *
 * The fingerprint scopes resume to this exact user, project, file name, size and modification
 * time, so the same file never resumes another project's or another user's upload, and a different
 * file for the same project never resumes this one's transfer. A resume point lives only in this
 * browser's storage and for the 24 hours Supabase keeps a resumable upload; a stored point whose
 * object name is not this project's raw-path shape is ignored and the upload starts fresh.
 *
 * `signal` cancels the transfer: it asks the server to terminate the partial upload (a partial the
 * server keeps expires within 24 hours) and forgets the resume point either way.
 *
 * A gigabyte over a single POST has no recovery at all: one network blip discards a ten-minute
 * transfer with nothing to show for it. Chunks are 6 MB because the storage service requires
 * exactly that size for every chunk but the last, and it must not be made configurable. There is
 * deliberately no fallback to a single POST.
 */
async function uploadResumable(
  database: SupabaseDatabase,
  bucket: string,
  projectId: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
  onResuming?: () => void,
): Promise<string> {
  async function currentSession(): Promise<{ token: string; userId: string }> {
    const { data, error } = await database.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data.session?.access_token;
    const userId = data.session?.user?.id;
    if (!token || !userId)
      throw new Error("Your sign-in is no longer valid. Sign out, sign in again, and retry.");
    return { token, userId };
  }

  if (signal?.aborted) throw new UploadCancelledError();
  // Fail before starting a transfer at all if there is no session to begin one with.
  const { userId } = await currentSession();
  const fingerprint = videoFingerprint(userId, projectId, file);
  // One object for the lifetime of the upload. When a stored upload URL has expired,
  // tus-js-client creates a new upload from these options on its own, so resuming rewrites the
  // object name here too: whichever way the transfer ends, it lands on the path this resolves with.
  const metadata = {
    bucketName: bucket,
    objectName: `${projectId}/${crypto.randomUUID()}.raw`,
    contentType: file.type,
  };

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      run();
    };
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { "x-upsert": "false" },
      // A token is fetched fresh for every request tus-js-client makes, rather than captured
      // once and baked into a static `headers` entry: `jwt_expiry` is 900 seconds, and a
      // gigabyte at a realistic connection speed takes far longer than that, so a token
      // captured at the start of the upload is expected to expire before the last chunk. A 401
      // from a stale token is also never retried — `tus-js-client`'s own
      // `defaultOnShouldRetry` (`node_modules/tus-js-client/lib/upload.js`) retries every
      // status except 4xx, with only 409 and 423 as exceptions — so a static header would turn
      // a routine token refresh into a hard failure partway through the transfer.
      // `onBeforeRequest` runs, and is awaited, before every request the library sends
      // (confirmed against `sendRequest` in the library's own source), which is what makes
      // fetching the token here instead of once up front actually work.
      onBeforeRequest: async (request) => {
        const { token } = await currentSession();
        request.setHeader("authorization", `Bearer ${token}`);
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata,
      fingerprint: async () => fingerprint,
      onError: (error) => {
        const status = (
          error as { originalResponse?: { getStatus(): number } | null }
        ).originalResponse?.getStatus();
        finish(() => reject(status === 404 || status === 410 ? new UploadExpiredError() : error));
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => finish(() => resolve(metadata.objectName)),
    });
    function onAbort() {
      finish(() => reject(new UploadCancelledError()));
      void forgetResumePoints(fingerprint).catch(() => {});
      // Supabase does not document tus termination; a partial it keeps expires within 24 hours.
      void upload.abort(true).catch(() => {});
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    void (async () => {
      try {
        const previous = (await upload.findPreviousUploads()).find((candidate) =>
          isRawVideoPath(projectId, candidate.metadata.objectName),
        );
        if (settled) return;
        if (previous) {
          metadata.objectName = previous.metadata.objectName;
          upload.resumeFromPreviousUpload(previous);
          onResuming?.();
        }
        upload.start();
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    })();
  });
}

/** A transient processing failure is retried once automatically, with the same raw path. Invalid
 * content, an authorization refusal, an expired raw file or a cancel are never retried. */
async function sanitizeWithOneRetry(
  database: SupabaseDatabase,
  mediaUrl: string,
  input: { projectId: string; rawPath: string; mimeType: string },
  signal?: AbortSignal,
) {
  try {
    return await sanitizeVideoAsset(database, mediaUrl, input, signal);
  } catch (error) {
    if (classifyUploadError(error) !== "transient") throw error;
    return await sanitizeVideoAsset(database, mediaUrl, input, signal);
  }
}

export type UploadDesignAssetOptions = {
  onProgress?: (fraction: number) => void;
  onRawPath?: (rawPath: string) => void;
  /** Fires once, before the transfer starts, only when a previous attempt for this exact
   * fingerprint was found and is being resumed — never for a fresh transfer. */
  onResuming?: () => void;
  signal?: AbortSignal;
};

/**
 * Uploads a design asset, choosing the path its type requires.
 *
 * An image is prepared in the browser: `sanitizeArtwork` re-encodes it through a canvas, which
 * discards its metadata as a side effect and is why every stored image is already clean.
 *
 * A video cannot take that path — a canvas does not decode video — so it goes to storage as-is
 * under a `.raw` name through a resumable upload, and `apps/media` remuxes it into a clean object.
 * `options.onRawPath` fires once, right when the transfer finishes and processing is about to
 * start: from that point a cancel (`options.signal`) must also discard the raw file explicitly
 * (`discardRawUpload`), while a cancel before it only needs to abort the transfer.
 *
 * **If processing fails**, the raw object at `internal-assets/${rawPath}` is not deleted here: a
 * transient failure is retried once with the same raw path, and after that the person can retry
 * processing without sending the file again. The media service itself discards content it rejects
 * (422), and its 24-hour sweep removes any raw upload nobody came back for. The failure is logged
 * with the raw path, which is visible only in the uploader's browser devtools.
 */
export async function uploadDesignAsset(
  database: SupabaseDatabase,
  mediaUrl: string,
  projectId: string,
  file: File,
  options: UploadDesignAssetOptions = {},
): Promise<string> {
  // Routing is decided by the "video/" prefix, not by `isVideoUpload`: that helper answers "is
  // this an *accepted* video type", which is exactly what the next check needs, but reusing it
  // for the branch too would mean an unsupported video (`video/quicktime`, say) reports
  // `isVideoUpload` false and falls through to the image path below — which then rejects a video
  // with "Choose a PNG, JPG, or WebP image", a message about a file type nobody offered it.
  if (!file.type.startsWith("video/")) return uploadArtwork(database, projectId, file);

  if (!isVideoUpload(file.type)) throw new Error(uploadTypeMessage(videoUploadMimes));
  if (file.size > VIDEO_MAX_BYTES) throw new Error(uploadSizeMessage(VIDEO_MAX_BYTES));

  const rawPath = await uploadResumable(
    database,
    "internal-assets",
    projectId,
    file,
    options.onProgress,
    options.signal,
    options.onResuming,
  );
  options.onRawPath?.(rawPath);
  try {
    const sanitized = await sanitizeWithOneRetry(
      database,
      mediaUrl,
      { projectId, rawPath, mimeType: file.type },
      options.signal,
    );
    return sanitized.path;
  } catch (error) {
    if (classifyUploadError(error) !== "cancelled")
      console.error(
        `Video processing failed; the raw upload remains at internal-assets/${rawPath} for a retry until the 24-hour sweep removes it.`,
        error,
      );
    throw error;
  }
}
