import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@database";

const publicationSchema = z.object({ assets: z.record(z.string().uuid(), z.string().min(1)) });
const deliverySchema = z.object({
  id: z.string().uuid(),
  storagePath: z.string().min(1),
  mimeType: z.enum(["image/png", "application/pdf"]),
  fileSize: z.number().int().positive(),
});

async function requestMedia<T>(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  path: string,
  body: BodyInit,
  contentType: string,
  schema: z.ZodType<T>,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  if (!mediaUrl) throw new Error("File preparation is unavailable. Please contact the studio.");
  const {
    data: { session },
    error: sessionError,
  } = await database.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Sign in again to prepare this file.");
  const response = await fetch(`${mediaUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      ...extraHeaders,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": contentType,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    throw new Error(
      error.success ? error.data.error : "The file could not be prepared. Please try again.",
    );
  }
  const validated = schema.safeParse(result);
  if (!validated.success)
    throw new Error("The file service returned an incomplete response. Please try again.");
  return validated.data;
}

export async function preparePublicationAssets(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  versionId: string,
) {
  return (
    await requestMedia(
      database,
      mediaUrl,
      "/publications/prepare",
      JSON.stringify({ versionId }),
      "application/json",
      publicationSchema,
    )
  ).assets;
}

export async function prepareDelivery(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  projectId: string,
  file: File,
  name: string,
) {
  if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type))
    throw new Error("Choose a PNG, JPG, WebP, or PDF file.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Choose a file smaller than 50 MB.");
  return requestMedia(
    database,
    mediaUrl,
    `/deliveries/prepare?projectId=${encodeURIComponent(projectId)}`,
    file,
    file.type,
    deliverySchema,
    { "X-File-Name": encodeURIComponent(name) },
  );
}

export async function discardPreparedAssets(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  paths: string[],
) {
  if (!paths.length) return;
  await requestMedia(
    database,
    mediaUrl,
    "/assets/discard",
    JSON.stringify({ paths }),
    "application/json",
    z.object({ discarded: z.array(z.string()), retained: z.array(z.string()) }),
  );
}
