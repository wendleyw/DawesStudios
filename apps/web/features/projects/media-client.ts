import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@database";

/*
 * Identifiers are validated as UUID-shaped, not as RFC 4122 version 4.
 *
 * A `uuid` column holds any 128-bit value: `gen_random_uuid()` happens to produce version 4, but the
 * deterministic fixtures derive their ids from a hash, so their version and variant nibbles are
 * whatever the digest gave. `z.uuid()` rejects those, which turned a working publication into "The
 * file service returned an incomplete response" — the service had done its job and the client threw
 * the answer away. `z.guid()` checks the shape the database actually guarantees.
 */
export const publicationSchema = z.object({ assets: z.record(z.guid(), z.string().min(1)) });
export const deliverySchema = z.object({
  id: z.guid(),
  storagePath: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "application/pdf"]),
  fileSize: z.number().int().positive(),
});

/**
 * What a refused preparation should say to the person who asked for it.
 *
 * A session that no longer exists still carries a valid signature, so PostgREST keeps answering and
 * the workspace renders as normal while the media service — which resolves the session through the
 * auth server — refuses every file with its own wording, `Access denied.`. That is accurate and
 * useless: it names no cause and no next step. A refusal that carries a more specific reason, such
 * as a viewer without agency access, keeps that reason.
 */
export function mediaErrorMessage(status: number, payload: unknown): string {
  const parsed = z.object({ error: z.string() }).safeParse(payload);
  const reported = parsed.success ? parsed.data.error : "";
  if ((status === 401 || status === 403) && (!reported || reported === "Access denied."))
    return "Your sign-in is no longer valid. Sign out, sign in again, and retry.";
  return reported || "The file could not be prepared. Please try again.";
}

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
  if (!response.ok) throw new Error(mediaErrorMessage(response.status, result));
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
