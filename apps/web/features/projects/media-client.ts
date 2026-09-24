import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "@/lib/zod";
import type { Database } from "@database";
import {
  BUCKET_MAX_BYTES,
  standardUploadMimes,
  uploadSizeMessage,
  uploadTypeMessage,
} from "@/features/shared/upload-rules";

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

// 120 seconds fits every call through here except the two that pass their own `timeoutMs`:
// video-sanitise (`VIDEO_SANITIZE_TIMEOUT_MS` below) and publication preparation
// (`PUBLICATION_TIMEOUT_MS` below), the two routes whose server-side work is bounded by file
// transfer time rather than a small JSON round trip. `prepareDelivery` is the one exception that
// still uses this default despite sending a real file: it is bounded by `BUCKET_MAX_BYTES`
// (50 MB), two orders of magnitude below the video ceiling, and the media service answers it
// quickly. A longer default here for every other route would let one of those hang instead of
// failing fast. Mirrors the same reasoning `apps/media/src/supabase.js` states for its own
// 30-second default.
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

const sanitizedVideoSchema = z.object({
  path: z.string().min(1),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/**
 * The deadline for `sanitizeVideoAsset` alone — not `DEFAULT_TIMEOUT_MS`, which every other call
 * through `requestMedia` uses.
 *
 * `/designs/sanitize-video` (`apps/media/src/server.js`) runs **four** independently bounded
 * operations in sequence, not three — the probe and the remux are two separate `runMediaTool`
 * calls with two different budgets, not one "ffmpeg" step:
 *
 * 1. `downloadToFile` (`apps/media/src/supabase.js:84`) — bounded by `LIMITS.videoProcessMs`.
 * 2. `ffprobe`, inside `sanitizeVideo` (`apps/media/src/sanitize.js`) — bounded by the smaller
 *    `LIMITS.videoProbeMs`, since it only reads container/stream headers off a file already on
 *    local disk.
 * 3. `ffmpeg`'s `-c copy` remux, also inside `sanitizeVideo` — bounded by `LIMITS.videoProcessMs`.
 * 4. `uploadFile` (`apps/media/src/supabase.js:97`) — bounded by `LIMITS.videoProcessMs`.
 *
 * At the 1 GB ceiling (`VIDEO_MAX_BYTES`), the three `videoProcessMs`-bounded legs can plausibly
 * each take close to their full budget; the probe cannot, by design (see `videoProbeMs`'s own
 * comment in `sanitize.js`), but it still has to be counted, not ignored. The client's deadline
 * has to cover the sum of all four, not just the remux: `DEFAULT_TIMEOUT_MS` (120 s) would abort
 * a transfer the server is still completing successfully, leaving a clean object registered under
 * a path no design will ever reference and no way for the person to recover the upload short of
 * re-sending the whole file.
 *
 * This is exactly `3 × LIMITS.videoProcessMs + LIMITS.videoProbeMs` = `900_000 + 30_000` =
 * `930_000` ms (15 minutes 30 seconds), restated here rather than imported — `apps/media` is a
 * separate deployable with its own `package.json` and no shared module boundary with this app —
 * so raising either server-side budget is a signal to reconsider this arithmetic too, not an
 * automatic fix.
 */
const VIDEO_SANITIZE_TIMEOUT_MS = 3 * 300_000 + 30_000;

/**
 * Asks `apps/media` to remux a raw video upload into a clean object and delete the raw one.
 *
 * This function never removes the raw object at `input.rawPath` itself. The service deletes it
 * once the clean copy is written, or at once for content it rejects (422); a transient failure
 * or a hang-up keeps it for a retry; a cancel removes it through `discardRawAsset`; and the
 * service's 24-hour sweep removes whatever is left. `signal` aborts the request when the person
 * cancels, and the rejection is then the fetch's own `AbortError`.
 */
export async function sanitizeVideoAsset(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  input: { projectId: string; rawPath: string; mimeType: string },
  signal?: AbortSignal,
) {
  return requestMedia(
    database,
    mediaUrl,
    "/designs/sanitize-video",
    JSON.stringify(input),
    "application/json",
    sanitizedVideoSchema,
    { timeoutMs: VIDEO_SANITIZE_TIMEOUT_MS, signal },
  );
}

const discardRawSchema = z.object({ discarded: z.boolean() });

/** Deletes a raw video upload the person cancelled during processing. Deleting a raw file that is
 * already gone succeeds, so a repeated cancel is safe. */
export async function discardRawAsset(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  input: { projectId: string; rawPath: string },
): Promise<void> {
  await requestMedia(
    database,
    mediaUrl,
    "/designs/discard-raw",
    JSON.stringify(input),
    "application/json",
    discardRawSchema,
  );
}

/**
 * The deadline for `preparePublicationAssets` alone.
 *
 * Final whole-branch review, Important 1: this call used to fall through to `DEFAULT_TIMEOUT_MS`
 * (120 s), which was correct when every design was an image -- `sanitizeRaster` is in-memory and
 * fast -- and became wrong the moment Task 10 added a video branch to the same server route
 * without anyone carrying the deadline rule Task 7 had already established for
 * `sanitizeVideoAsset`. `/publications/prepare` (`apps/media/src/server.js`) loops over up to 20
 * designs in one request (a separately deferred concurrency question, not addressed here), and
 * for each video design it runs two network legs against Storage, not zero: `downloadToFile`
 * (`apps/media/src/supabase.js`) and `uploadFile`, each bounded by `LIMITS.videoProcessMs`
 * (300 s) — publication does not re-run `ffmpeg`, it copies the object `/designs/sanitize-video`
 * already sanitised, so there is no remux leg here the way there is in
 * `VIDEO_SANITIZE_TIMEOUT_MS`. `registerCopied`'s own attestation RPC is a third, much smaller
 * leg, bounded by `apps/media/src/supabase.js`'s generic 30-second request default.
 *
 * The throughput assumption behind `videoProcessMs` itself (a separately deferred item this
 * closes for free while already here): 300 s for a file up to `VIDEO_MAX_BYTES` (1 GiB) assumes
 * roughly 3.4 MiB/s of sustained throughput is enough headroom for a Storage read or write over
 * the deployment's own network, not the person's upload link -- this leg moves bytes the media
 * service already holds, between itself and Storage, not bytes coming from a browser.
 *
 * Worst case, treating every one of the 20 designs as video (the bound has to hold for that case
 * even though a typical publish mixes image and video): `20 × (2 × 300_000 + 30_000)` =
 * `20 × 630_000` = `12_600_000` ms (210 minutes). Restated here rather than imported, for the
 * same reason `VIDEO_SANITIZE_TIMEOUT_MS` is: `apps/media` is a separate deployable with no
 * shared module boundary with this app, so raising `videoProcessMs` is a signal to reconsider
 * this arithmetic too, not an automatic fix.
 */
const PUBLICATION_TIMEOUT_MS = 20 * (2 * 300_000 + 30_000);

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
      { timeoutMs: PUBLICATION_TIMEOUT_MS },
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
