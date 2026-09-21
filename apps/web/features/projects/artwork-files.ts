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
import { sanitizeVideoAsset } from "./media-client";

/**
 * The lifecycle of an uploaded design artwork: preparing the image, storing it, and removing one
 * that no design ended up referencing. The signed URL that displays a stored artwork is a read, and
 * lives with the feature's other read hooks in `project-data.ts`.
 */

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

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

/**
 * Uploads through Supabase's TUS endpoint, which resumes after a dropped connection.
 *
 * A gigabyte over a single POST has no recovery: one network blip discards a ten-minute
 * transfer with nothing to show for it. Chunks are 6 MB because the storage service requires
 * exactly that size for every chunk but the last, and it must not be made configurable.
 *
 * There is deliberately no fallback to a single POST. A silent fallback would reintroduce
 * exactly the fragility this replaces, and would do it invisibly.
 */
async function uploadResumable(
  database: SupabaseDatabase,
  bucket: string,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const { data } = await database.auth.getSession();
  const token = data.session?.access_token;
  if (!token)
    throw new Error("Your sign-in is no longer valid. Sign out, sign in again, and retry.");

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: bucket, objectName: path, contentType: file.type },
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

/**
 * Uploads a design asset, choosing the path its type requires.
 *
 * An image is prepared in the browser: `sanitizeArtwork` re-encodes it through a canvas, which
 * discards its metadata as a side effect and is why every stored image is already clean.
 *
 * A video cannot take that path — a canvas does not decode video — so it goes to storage as-is
 * under a `.raw` name and `apps/media` remuxes it into a clean object. Two objects exist only for
 * the length of one sanitisation; the service deletes the raw one once it has written the clean
 * copy.
 *
 * The upload is resumable because a gigabyte over a single POST has no way to recover from a
 * dropped connection, and losing a ten-minute transfer to one network blip is not acceptable.
 *
 * **If sanitisation fails**, the raw object at `internal-assets/${rawPath}` is not deleted here.
 * The upload that put it there just spent real time and real bandwidth; a failure at this last
 * step is often transient (an expired session, a dropped connection, the media service being
 * briefly unavailable) and should be answered by letting the person retry, not by discarding the
 * bytes they already sent. There is no equivalent of `discardUnreferencedArtwork` for video, so a
 * permanently failing sanitisation (for example, a container whose declared type does not match
 * its actual codec) leaves a real orphan in `internal-assets` that only an operator can remove.
 * That is recorded, not hidden: the failure is logged with the raw path before it is rethrown.
 */
export async function uploadDesignAsset(
  database: SupabaseDatabase,
  mediaUrl: string,
  projectId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  // Routing is decided by the "video/" prefix, not by `isVideoUpload`: that helper answers "is
  // this an *accepted* video type", which is exactly what the next check needs, but reusing it
  // for the branch too would mean an unsupported video (`video/quicktime`, say) reports
  // `isVideoUpload` false and falls through to the image path below — which then rejects a video
  // with "Choose a PNG, JPG, or WebP image", a message about a file type nobody offered it.
  if (!file.type.startsWith("video/")) return uploadArtwork(database, projectId, file);

  if (!isVideoUpload(file.type)) throw new Error(uploadTypeMessage(videoUploadMimes));
  if (file.size > VIDEO_MAX_BYTES) throw new Error(uploadSizeMessage(VIDEO_MAX_BYTES));

  const rawPath = `${projectId}/${crypto.randomUUID()}.raw`;
  await uploadResumable(database, "internal-assets", rawPath, file, onProgress);
  try {
    const sanitized = await sanitizeVideoAsset(database, mediaUrl, {
      projectId,
      rawPath,
      mimeType: file.type,
    });
    return sanitized.path;
  } catch (error) {
    console.error(
      `Video sanitisation failed; the raw upload remains at internal-assets/${rawPath} and will not be cleaned up automatically.`,
      error,
    );
    throw error;
  }
}
