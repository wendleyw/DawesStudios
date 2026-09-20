import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import { assertResult } from "@/lib/supabase";

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function sanitizeArtwork(file: Blob): Promise<Blob> {
  if (!allowedImageTypes.has(file.type))
    throw new Error("Choose a PNG, JPG, or WebP image for the design preview.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Please choose an image smaller than 25 MB.");
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

export async function uploadArtwork(
  database: SupabaseClient<Database>,
  projectId: string,
  file: Blob,
) {
  const image = await sanitizeArtwork(file);
  const path = `${projectId}/${crypto.randomUUID()}.png`;
  assertResult(
    await database.storage
      .from("internal-assets")
      .upload(path, image, { contentType: "image/png", upsert: false }),
  );
  return path;
}
