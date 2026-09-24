# Video upload lifecycle — 2026-09-23

Orchestrator: Claude Code (session `a375ed7c`), executing the
[plan](../superpowers/plans/2026-09-23-video-upload-lifecycle.md) for the
[design](../superpowers/specs/2026-09-23-video-upload-lifecycle-design.md) on `main`
(`fdb9a2f..f00f364`, then this record). Every check below was run in this session, on the local
stack with the SABRE overlay active (10 clients / 68 projects), finishing on 2026-09-24 00:40 EDT.

## What changed

- **Database** (`202609230014_video_upload_lifecycle.sql`): `register_sanitized_video` records the
  raw `source_path`; `find_sanitized_video_by_source` (idempotent retry) and
  `list_stale_video_uploads` (the 24-hour sweep) are service_role only. Both age an output by its
  storage object's `created_at`, so the retry lookup and the sweep never claim the same output, and
  the lookup never offers an attestation whose object is gone. The sweep spares outputs a design or
  a project asset references.
- **Media service**: status classes 422/415/410/503/504 (a tool killed by its time budget is a 504,
  not a content verdict); the idempotent retry; a disconnect aborts the download, the tools and the
  upload but keeps the raw object; `POST /designs/discard-raw`; the hourly and startup sweep of stale
  raw uploads and orphaned outputs.
- **Web**: a user/project/file-scoped tus fingerprint with resume, one Cancel for the transfer and
  for processing, one automatic retry for a transient failure, **Try processing again** without a
  second transfer, and the dialog states **Sending N%**, **Continuing from N%**, **Processing…**,
  **Upload cancelled.** and **The upload expired; choose the file again.**

## Checks

| Check | Result |
| --- | --- |
| `supabase test db supabase/tests/database/video_upload_lifecycle.test.sql` | 14/14 pass: source_path recorded, service_role-only grants, lookup inside/outside 24 hours and for a missing object, sweep of stale raw and unreferenced outputs, design and project-asset exclusions, the exact 24-hour boundary |
| `npm run db:test` | Files=20, Tests=424. 19 files pass; `access_and_workflows.test.sql` fails its known 6 SABRE-overlay assertions (2, 4, 9, 18, 32, 54), unchanged |
| `npm --prefix apps/media test` | 70/70 across 3 files (`sanitize` 19, `server` 34, `supabase` 17) |
| `npm run check` (web typecheck, lint, format, unit) | 651 tests / 55 files pass |
| `npx playwright test tests/e2e/video-designs.spec.ts` | 6 passed: the original three-role scenario plus five lifecycle scenarios |
| Dialog-affected specs (video-designs, video-loading, project-creation-cards, project-feedback, production-workflow, project-recovery, playground) | 23 passed. The whole browser suite was not run |
| `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/projects/*.tsx` | 0 for every production `.tsx`; only `project-asset-url.test.tsx` (test doubles) matches |

The browser runs used the compose `media` container rebuilt from this tree at 04:27 UTC
(`docker compose -p dawes-studios-app up -d --build --no-deps media`, with the container's existing
environment). Against the previous image, the cancel-during-processing scenario failed as expected:
the raw object remained, because that image had no `discard-raw` route.

## Success criteria

| Criterion | Demonstrated by |
| --- | --- |
| **Cancel** during the transfer | Browser: cancelling a held transfer leaves no design and no raw object. Unit: `upload.abort(true)`, the resume point forgotten even when termination fails, no transfer after a cancel during the session lookup |
| **Cancel** during processing | Browser: the raw object exists while processing is held, then disappears through `discard-raw` after Cancel, and no design is registered. Unit: a cancel that lands after processing answered registers nothing; the media service keeps the raw object on a disconnect and kills `ffmpeg` |
| **Resume** | Browser: a 13 MB file is reloaded between chunks and choosing it again shows **Continuing from**. Unit: fingerprint scoping, the stored object name reused, malformed or foreign resume points ignored |
| **Retry** | Browser: one forced 503 recovers automatically; two forced 503s offer **Try processing again**, which succeeds with no second transfer. Unit and media: 422/415 never retried, 410 reads as expired, the idempotent retry returns the attested output without `ffmpeg` |
| **Cleanup** | pgTAP: the sweep lists raw uploads and unreferenced outputs older than 24 hours only. Media: the attested and raw discard paths, and the startup sweep call. The rebuilt container's startup sweep logged no failure. No object was aged 24 hours in a browser run |

## Visual check

The dialog's Sending, Upload cancelled, Try processing again and Processing states were captured at
1600 × 1000 and 390 × 844 into the ignored `outputs/video-upload-lifecycle/` directory. The
progress line, the notice and the single Cancel stay aligned with the existing form, with no
overflow at phone width. No images are committed.

## Open risks

- **tus termination on Supabase is unverified.** In the transfer-cancel scenario the creation
  request was still held when Cancel ran, so no upload URL existed and no termination was
  attempted. A partial upload the server keeps is covered by the 24-hour resumable window.
- **R2's incomplete-multipart rule** is proven only on a real R2 staging run; MinIO cannot stand in
  for it. The production guide now asks for a one-day rule.
- **Resume depends on browser storage.** A private window or cleared site data starts over from
  zero, which was the behaviour before this work.
