import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "@/lib/zod";
import type { Database } from "@database";
import {
  BUCKET_MAX_BYTES,
  clientBrandUploadMimes,
  standardUploadMimes,
  uploadSizeMessage,
  uploadTypeMessage,
} from "@/features/shared/upload-rules";

/*
 * Identifiers are validated as UUID-shaped, not as RFC 4122 version 4.
 *
 * A `uuid` column holds any 128-bit value: `gen_random_uuid()` happens to produce version 4, but the
 * deterministic fixtures derive their ids from a hash, so their version and variant nibbles are
 * whatever the digest gave. `z.uuid()` rejects those, which turned a working delivery into "The
 * file service returned an incomplete response" — the service had done its job and the client threw
 * the answer away. `z.guid()` checks the shape the database actually guarantees.
 */
export const deliverySchema = z.object({
  id: z.guid(),
  storagePath: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "application/pdf"]),
  fileSize: z.number().int().positive(),
});

/** Carries the media service's HTTP status, so a caller can classify a processing failure as
 * transient, permanent or expired without re-parsing the response body. */
export class MediaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MediaRequestError";
  }
}

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

// 120 seconds fits every call through here. `prepareDelivery` sends a real file but is bounded by
// `BUCKET_MAX_BYTES` (50 MB), and the media service answers it quickly. A longer default would let
// a hung request wait instead of failing fast. Mirrors the same reasoning
// `apps/media/src/supabase.js` states for its own 30-second default.
const DEFAULT_TIMEOUT_MS = 120_000;

async function requestMedia<T>(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  path: string,
  body: BodyInit,
  contentType: string,
  schema: z.ZodType<T>,
  {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  }: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {},
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
      ...headers,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": contentType,
    },
    body,
    signal: signal
      ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])
      : AbortSignal.timeout(timeoutMs),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new MediaRequestError(mediaErrorMessage(response.status, result), response.status);
  const validated = schema.safeParse(result);
  if (!validated.success)
    throw new Error("The file service returned an incomplete response. Please try again.");
  return validated.data;
}

export async function prepareDelivery(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  projectId: string,
  file: File,
  name: string,
) {
  if (!(standardUploadMimes as readonly string[]).includes(file.type))
    throw new Error(uploadTypeMessage(standardUploadMimes));
  if (file.size > BUCKET_MAX_BYTES) throw new Error(uploadSizeMessage());
  return requestMedia(
    database,
    mediaUrl,
    `/deliveries/prepare?projectId=${encodeURIComponent(projectId)}`,
    file,
    file.type,
    deliverySchema,
    { headers: { "X-File-Name": encodeURIComponent(name) } },
  );
}

/**
 * The `project-covers` bucket's own byte ceiling: `file_size_limit=10485760` in
 * `supabase/migrations/202609270001_project_covers.sql`. Restated here rather than in
 * `upload-rules.ts`, following the reasoning in that module's own header comment (a client
 * ceiling must agree with the bucket it precedes, not be collapsed into an unrelated one): no
 * other uploader shares this ceiling, so it belongs beside the one request that enforces it.
 */
const COVER_MAX_BYTES = 10 * 1024 * 1024;

const projectCoverSchema = z.object({ path: z.string().min(1), clientVisible: z.boolean() });

/**
 * Sends the cover image to `apps/media`, which re-encodes it to PNG, stores it under
 * `project-covers/<project-uuid>/<random-uuid>.png` and calls the authenticated
 * `set_project_cover` RPC with the caller's own token.
 *
 * `set_project_cover` defaults `p_client_visible` to `false` (see `202609270001_project_covers.sql`),
 * so `visible` must carry the *current* visibility on a Replace, not always `false` — a caller
 * replacing an already client-visible cover passes the row's own `clientVisible`, never a
 * hardcoded default, or the replace would silently hide a cover the agency never asked to hide.
 */
export async function prepareProjectCover(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  projectId: string,
  file: File,
  visible: boolean,
) {
  if (!(clientBrandUploadMimes as readonly string[]).includes(file.type))
    throw new Error(uploadTypeMessage(clientBrandUploadMimes));
  if (file.size > COVER_MAX_BYTES) throw new Error(uploadSizeMessage(COVER_MAX_BYTES));
  return requestMedia(
    database,
    mediaUrl,
    `/covers/prepare?projectId=${encodeURIComponent(projectId)}&visible=${visible}`,
    file,
    file.type,
    projectCoverSchema,
  );
}

const clearCoverSchema = z.object({ cleared: z.boolean() });

/** Clears the project's cover through `apps/media`'s `clear_project_cover` RPC and object delete.
 * `cleared` is `false` when the project already had no cover, so a repeated clear is safe. */
export async function clearProjectCover(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  projectId: string,
) {
  return (
    await requestMedia(
      database,
      mediaUrl,
      `/covers/clear?projectId=${encodeURIComponent(projectId)}`,
      "{}",
      "application/json",
      clearCoverSchema,
    )
  ).cleared;
}
