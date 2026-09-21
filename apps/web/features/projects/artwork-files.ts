import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import { ARTWORK_MAX_BYTES, uploadSizeMessage } from "@/features/shared/upload-rules";

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
