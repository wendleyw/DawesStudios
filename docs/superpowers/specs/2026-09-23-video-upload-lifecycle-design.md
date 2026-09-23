# Video upload lifecycle

Date: 2026-09-23

Status: design approved in chat, section by section; awaiting written-spec review

## Objective

Agency and assigned designers add video designs of up to 1 GiB to a version through the
**Add design** dialog. Today that upload cannot be cancelled, a reload or dropped connection
restarts it from zero, a processing failure forces the whole file to be sent again, and the raw
files that failures and abandoned attempts leave in `internal-assets` are never removed. This
design closes those four gaps.

Success means all of the following hold:

1. **Cancel** works at any moment, during the transfer and during processing, and leaves no
   design and no stored object behind (immediately, or within 24 hours when the server cannot
   terminate a partial transfer).
2. **Resume:** after a reload or a dropped connection, choosing the same file again continues
   the transfer where it stopped, within the 24-hour window.
3. **Retry:** a transient processing failure is retried once automatically. After a second
   failure the person can retry processing without re-uploading. A file that is invalid is never
   retried.
4. **Cleanup:** raw files and orphaned processed videos older than 24 hours are removed
   automatically.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Resume after reload | By choosing the same file again. No project-level "interrupted upload" notice. |
| Processing failure | One automatic retry for transient failures, then a "Try processing again" button. Invalid files are discarded with an explanation. |
| Retention window | 24 hours for interrupted transfers, raw files and orphaned outputs. |
| Cancel scope | One Cancel button that works during the transfer and during processing. |
| Approach | Storage conventions plus one service-role cleanup RPC (A). A server-side attempts table (B) was rejected as unneeded state; bucket lifecycle expiry (C) was rejected because it would leave dangling `storage.objects` rows. |

## Non-goals

- No project-level list of interrupted uploads, and no server-side attempt records.
- No change to accepted formats (MP4, WebM), the 1 GiB ceiling, the 5-minute processing budget,
  scratch space, attestation, metadata sanitization, permissions, or image uploads.
- No resume across browsers or devices. The browser only exposes a file the person chooses again,
  and resume state lives in that browser's storage.
- Mixed-workload scheduling in the media service remains deferred.

## Current state

- `apps/web/features/projects/artwork-files.ts` uploads the raw file with tus-js-client to
  `internal-assets/{projectId}/{uuid}.raw`, using `removeFingerprintOnSuccess: true` and never
  calling `findPreviousUploads`. A new UUID is generated for every attempt.
- `project-action-dialog.tsx` blocks closing while the upload runs, because nothing can abort it.
- `apps/media` `POST /designs/sanitize-video` downloads the raw file, runs ffprobe and an ffmpeg
  remux, uploads the clean object, attests it with `register_sanitized_video`, then deletes the
  raw file. On failure the raw file stays, with nothing to reuse or remove it.
- The media service's hourly `cleanStaleAssets` sweeps `list_stale_sanitized_assets`, which
  deliberately excludes `internal-assets`.
- `register_sanitized_video` does not record `source_path` for videos.
- Supabase documents that a resumable upload URL stays valid for up to 24 hours. Upload
  termination (tus `DELETE`) is not documented.

## Design

### 1. Browser: the Add design dialog

**Scoped resume.** The tus fingerprint is
`dawes-video:{userId}:{projectId}:{name}:{size}:{lastModified}`, so the same file never resumes
another project's or another user's upload. When a video is chosen, `findPreviousUploads()` looks
for an unexpired previous upload with that fingerprint. If one exists, the transfer resumes from
it, the dialog shows **Continuing from N%**, and the raw path is taken from the stored upload's
`objectName` metadata instead of a new UUID. `removeFingerprintOnSuccess` stays on.

**One Cancel.** Closing is no longer blocked by an upload in flight.

- During the transfer, Cancel calls `upload.abort(true)` to request termination and removes the
  fingerprint. If the server does not terminate the partial upload, it expires within 24 hours
  (Supabase's resumable window, plus the production R2 lifecycle rule for incomplete multipart
  uploads).
- During processing, Cancel aborts the request to the media service, then calls
  `POST /designs/discard-raw` to delete the raw file.
- After a cancel, nothing is registered, and the dialog returns to file selection with
  **Upload cancelled**.

**Retry.** A transient processing failure (network error, timeout, HTTP 408, 429 or 5xx) is
retried once automatically with the same raw path. If it fails again, the dialog shows **Try
processing again**, which reprocesses the stored raw file without uploading it again. A permanent
failure (HTTP 415 or 422) shows its message and offers only choosing another file.

**States.** The dialog shows **Sending N%**, **Continuing from N%**, **Processing…**, **Upload
cancelled**, and **The upload expired; choose the file again** (when the raw file or the resumable
upload is gone). The existing `beforeunload` warning remains while a transfer or processing runs.

**Code placement.** Upload, resume, abort and retry logic live in `artwork-files.ts`, which
receives an `AbortSignal` and returns a handle. Dialog states live in `project-action-dialog.tsx`.
Both follow the data-access boundary, and their tests stay colocated.

### 2. Media service

**A disconnect is not a cancel.** In `sanitize-video`, an `AbortController` tied to the client
connection aborts the download, kills the ffmpeg child process, aborts the upload, and deletes any
partial output. It **keeps the raw file**, because the disconnect may be a network blip that the
automatic retry will follow.

**Explicit discard.** `POST /designs/discard-raw { projectId, rawPath }` deletes a raw file. It
applies the same authorization as processing (`canProduce` for the project) and the same path
validation (`RAW_VIDEO_PATH`, first segment equal to the project). Deleting an already-missing raw
file succeeds, so repeated cancels are safe.

**Idempotent retry.** Before processing, the service looks for an attested clean output whose
`source_path` equals the raw path and that is younger than 24 hours. If one exists, it returns
that output's path without running ffmpeg again. This recovers a response lost after a successful
run, when the raw file has already been deleted.

**Error classes.** Content that ffprobe or ffmpeg rejects returns **422**, and the service deletes
the raw file, because it can never succeed. The type check keeps **415**, and access keeps
**403/404**. Download, storage and upload failures and timeouts return **503** or **504**. A
missing raw file with no attested output returns **410**, which the dialog shows as expired.

### 3. Database and cleanup

A forward migration, numbered after the latest migration at implementation time:

- `register_sanitized_video` records `source_path` (the raw path) for new video attestations. The
  existing uniqueness of the attested output is unchanged.
- `public.list_stale_video_uploads()` is `SECURITY DEFINER` with `search_path = ''`. Execute is
  revoked from `public`, `anon` and `authenticated` and granted to `service_role` only. It returns
  `(bucket_id, storage_path, attested)` for:
  - (a) objects in `internal-assets` whose name ends in `.raw` and that are older than 24 hours;
  - (b) attested video outputs in `internal-assets` older than 24 hours that no
    `designs.internal_asset_path` references.

Age is always measured by the object's `storage.objects.created_at`, so both branches use one rule.
(`private.sanitized_assets` also has a `created_at`; an earlier draft of this spec wrongly said it
did not.) Before writing case (b), the implementation
must confirm that `designs.internal_asset_path` is the only column that references video objects
in `internal-assets`. Any other referencing column joins the exclusion.

The media service's hourly `cleanStaleAssets` also processes this list. It deletes each object
through Storage, then removes the attestation row for case (b).

**No race between retry and cleanup.** The idempotent lookup returns only outputs younger than 24
hours, and the sweep only touches outputs older than 24 hours, so the two sets never overlap. A
design created from an output always references it, which excludes it from case (b).

## Error handling summary

| Situation | Result |
| --- | --- |
| Cancel during transfer | Transfer aborted, fingerprint removed, partial expires within 24 hours if not terminated. |
| Cancel during processing | Request aborted, raw file discarded (or swept within 24 hours if the discard fails). |
| Connection drops during processing | Work stopped, raw file kept, automatic retry once. |
| Response lost after success | Retry returns the existing attested output. |
| Invalid video content | 422, raw file deleted, message shown, no retry. |
| Raw file or resumable upload older than 24 hours | 410 or tus expiry, **The upload expired; choose the file again**. |
| Same file chosen for another project | Different fingerprint, so a fresh upload. |

## Verification

- **Web unit tests** with tus mocked: fingerprint scoping, resume using the stored `objectName`,
  abort in both phases, transient versus permanent classification, one automatic retry, and the
  manual retry reusing the raw path.
- **Media unit tests:** a disconnect kills ffmpeg and keeps the raw file; `discard-raw`
  authorization and path validation; idempotent retry by `source_path` inside and outside the
  24-hour window; 422 deletes the raw file; 410 for a missing raw file.
- **pgTAP:** only `service_role` can execute `list_stale_video_uploads`; it lists stale raw files
  and unreferenced outputs, and never lists referenced outputs or anything younger than 24 hours;
  `register_sanitized_video` records `source_path`.
- **Browser (Playwright):** with a throttled network, cancel mid-transfer leaves no design and no
  object; reload mid-transfer, choose the same file, and see **Continuing from**; a forced 503 on
  the first processing call is recovered automatically; two forced failures show **Try processing
  again**, which succeeds without a second transfer.
- **Gate:** `npm run check`, media tests, `npm run db:test` (the canonical-count file stays
  expected-failing under the SABRE overlay), and the video browser specs.

### Definition of done

All four success criteria are demonstrated by the checks above. The project and media READMEs,
the production guide, the acceptance matrix and a verification record under `docs/verification/`
are updated. Every integrated task is committed.

## Risks

- **tus termination support is unknown.** Mitigated by the 24-hour expiry and the R2 lifecycle
  rule. The browser test records which path actually happened.
- **Resume depends on browser storage.** Private windows or cleared site data lose resume. The
  upload then starts from zero, which is today's behaviour.
- **MinIO cannot reproduce R2's tagging limit**, so TUS on R2 is proven only on a real R2
  staging run.
