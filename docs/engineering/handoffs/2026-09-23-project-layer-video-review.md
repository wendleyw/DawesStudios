# Independent project layer and video review

- Updated at: 2026-09-23T07:55:24Z
- Reporting agent and tool: team_navigation / Codex
- State: source review and independent scoped regressions complete; one material finding corrected; rebuilt integration validation remains with the orchestrator
- Objective: independently review the project-only nonmodal Playground, upload round trip and bounded video optimizations for material correctness, privacy and regression gaps.
- Owned paths: this report only. Source and runtime are read-only for this assignment.
- Dependencies: [current objective](../../architecture/project-playground-and-video-optimization.md), [project layer UI report](2026-09-23-project-playground-layer-ui.md), [backend report](2026-09-23-project-playground-backend.md), [video baseline](2026-09-23-video-optimization-baseline.md).
- Acceptance criteria: actionable findings with source evidence, independently executed scoped checks, clear separation of inherited limitations and new defects, and no unsupported release or performance claims.

## Completed work and changed files

Applied first-principles-review and codebase-review to the assigned seams. The objective is to keep project brainstorming private and persistent without obstructing project navigation, then remove demonstrably unnecessary video work without changing publication, metadata or feedback guarantees. No goal-level redesign is needed.

Only this report was written. No feature, migration, fixture, service, environment or shared integration file was changed. No browser, database mutation or runtime lifecycle test was started by this review. One new timed-feedback race was reported during video review and corrected by the implementation owners; no unresolved material source defect was found in the final assigned changes.

## Project-layer review

No new material defect was found in the project-only change after tracing the implementation and rerunning the focused component/data suite.

| Contract                   | Source evidence and reasoning                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project-only authorization | `202609230007_project_playground.sql:9–14` joins a matching project/client, requires the same active role, and checks both client and project access. Existing SELECT, item mutation/cleanup RPCs and Storage policies call this helper; possessing a legacy board/item UUID does not bypass it. The resolver rejects a missing project at lines 27–32. Anonymous execution remains revoked at lines 44–47. |
| Legacy preservation        | Migration 007 lines 4–5 add the project CHECK as `NOT VALID`: old null scopes remain stored, while future null inserts/updates are refused. This is deliberate preservation, not an incomplete attempt to validate old rows. No migration deletes or assigns legacy content.                                                                                                                                |
| Correct cache scope        | `playground-data.ts:31–32` keys reads by authenticated user, role, client and project, and disables automatic reads without the required project. It sends the project explicitly. The cache is not used as an authorization boundary.                                                                                                                                                                      |
| Nonmodal integration       | `project-page.tsx:242` makes the obscured work area inert; the header/navigation sit outside it. The Playground remains a sibling layer within the clipping project surface, not a modal or a nested dialog. The underlying canvas stays mounted.                                                                                                                                                           |
| Upload round trip          | `project-action-dialog.tsx:237` changes only the native dialog's open state when suspended. Its form remains mounted, and `project-page.tsx:349–357` keeps the same action key during the round trip. Opening Playground is disabled during a save/cleanup; close refuses those states at `project-action-dialog.tsx:81`. The form returns only after the layer invokes its completed-exit callback.        |
| Exit/focus and recovery    | `playground-board.tsx` filters animation events by root target and animation name, uses a bounded fallback/reduced-motion completion, and invokes close once. Focus restoration does not override a separately focused navigation control. Saves, revision conflicts, lost upload responses, staged cleanup, stale removal recovery and refreshed canonical items retain the prior tested behavior.         |

The actual browser cases in `tests/e2e/playground.spec.ts:29` and `:139` assert animation keyframes, exact surface bounds, nonmodal DOM, inert underlay, retained viewport, reduced motion, preserved file/name and a real saved design. They are stronger than checking whether a dialog merely appears. This reviewer inspected those assertions but did not rerun browser fixtures concurrently with the orchestrator.

## Known limits, distinct from new findings

- Browser Back/Forward and arbitrary programmatic router transitions can unmount unsaved in-memory Playground drafts. Ordinary same-tab app links are guarded, and full document unloads warn. This boundary is already explicit in the UI README/report and is not presented as a newly discovered regression or complete navigation protection.
- Existing signed private URLs retain their original expiry. Migration 007 denies new legacy reads/signing; it cannot revoke a previously issued URL. The backend report documents that limit.
- The earlier video retry/cleanup findings remain separate from this bounded optimization: full browser reupload after a processing failure, lost sanitize-response replay and staged-video cleanup are not automatically repaired by deferring thumbnails or combining upload/hash reads. The baseline report supplies their evidence. The comment retry/remount concern was already fixed before this assignment and is not reopened.
- No new browser history store, upload cancellation mechanism, public poster service or broad processing queue is proposed by this review.

## Checks actually executed

| Command or scenario                                                                                                                                                                                                      | Environment and time                               | Observed result                                                            | Evidence                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `./node_modules/.bin/vitest run features/playground/playground-model.test.ts features/playground/playground-board.test.tsx features/playground/playground-viewport.test.tsx features/playground/playground-data.test.ts` | `apps/web`, 2026-09-23 07:35 UTC                   | PASS, 48 tests / 4 files, 1.96 seconds                                     | Existing scoped tests; only the existing Node `DEP0205` warning                       |
| Source tracing: project/layer/upload/modal, migrations 003/005/006/007, data hook and acceptance tests                                                                                                                   | Repository working tree                            | No new material defect in the assigned project-layer seams                 | Evidence table above                                                                  |
| Integrated Playground gate                                                                                                                                                                                               | Reported by orchestrator, not rerun by this worker | 574 unit tests, 9 browser cases, 337 DB assertions and 8 HTTP cases passed | Await final orchestrator verification artifact for complete command/image attribution |

## Video review

### Media stream and attestation

The media worker released source for inspection. No new material correctness/security defect was found in `apps/media/src/supabase.js:103–187` or its `server.js` callers.

- `uploadFile` hashes and counts the same chunks it forwards to Storage. Its demand-driven Web stream (`highWaterMark: 0`) avoids another file-sized buffer and the second file read. The final check at line 139 requires outgoing EOF, nonempty bytes and an uncancelled body in addition to a successful HTTP response, so early success cannot return prefix attestation metadata.
- Cancellation, source read failures, oversized streams, early HTTP rejection and lost responses do not return a digest for registration. The `finally` block destroys the source and awaits descriptor cleanup. `supabase.test.js` checks the closed descriptor, not only promise rejection.
- Both registration functions now accept an internally produced frozen `{ sha256, fileSize }`, not browser-supplied metadata or a local path they reopen. The source design/path, preparer and database attestation RPCs remain intact. Registration failure retains the existing reference-aware discard path.
- `server.js:119–128` adds best-effort cleanup for the publication target when its upload fails before entering the prepared `assets` map. This closes the baseline's specific unregistered publication-target gap. It does not claim a general durable cleanup/retry mechanism for every older staged-video failure.
- The sanitizer, raw-source authorization, agency publication boundary, immutable publication RPC and timed-feedback contracts are unchanged by this optimization.

Independently reran `./node_modules/.bin/vitest run src/supabase.test.js src/server.test.js` from `apps/media` at 07:39 UTC: **31 tests / two files passed in 396 ms**. Two expected fixture startup cleanup messages appeared. The inner Storage HTTP transport is mocked by these unit tests; the orchestrator's real media integration remains necessary to confirm actual fetch/Storage behavior.

After the worker added an explicit cancellation flag, independently reran `./node_modules/.bin/vitest run src/supabase.test.js` at 07:41 UTC: **10 tests passed in 179 ms**, including cancellation followed by HTTP 200. The [worker's repeatable benchmark artifact](../../verification/media-upload-io-2026-09-23.json) was inspected, not independently regenerated: both sanitize and publication move from two streams/eight MiB of application reads to one stream/four MiB for a four-MiB file, with identical hashes and sizes. Its stated boundary is correct: mocked transport and upload-plus-attestation application bytes, not physical disk traffic, latency, peak memory or the entire sanitize pipeline.

### Main board video tiles

The orchestrator requested review of its additional board seam correction. `board-data.ts:133–160` excludes verified video extensions from the batch-signing list and retains the selected video version without a URL. `project-thumbnail.tsx:229` renders a passive Video indicator, and `board-nodes.tsx:97` forwards that distinction. Images still use their existing signed URLs and role-appropriate buckets. The shared extension helper moved to `shared/upload-rules.ts`, with the existing `video-pins.ts` export retained for its consumers.

Independently reran `./node_modules/.bin/vitest run features/board/board-artwork.test.tsx features/board/project-thumbnail.test.ts features/projects/video-pins.test.ts` from `apps/web` at 07:39 UTC: **23 tests / three files passed in 634 ms**. No new material defect found. The board data regressions explicitly exercise agency, designer and client branches, including an image alongside a video; they establish that video filtering does not disable image signing or switch buckets.

### Project tiles and player

The final UI source was reviewed after the worker's ready notice. `artwork.tsx` disables the signing observer for passive video tiles, renders no media element for that case, and keeps image behavior. `useDesignAssetUrl` retains user/channel/path cache separation, expiry and bucket selection; a disabled observer also disables its interval.

The full viewer's `VideoPlayer` is keyed by channel/design/path, preserving one media element across signed URL renewal. `replaceSource` captures the current playhead/playing/rate before `load()`, retains that original snapshot across overlapping renewals, and restores it on metadata. Existing volume/muted properties survive because the element is retained. Callback rerenders with the same URL do not load again. Terminal source failures keep explicit retry; background signing failure with cached data and transient buffered range errors leave usable playback in place. A refused automatic `play()` is surfaced with a usable native Play control.

Independently reran `./node_modules/.bin/vitest run features/projects/artwork.test.tsx features/projects/artwork-files.test.ts features/projects/video-pins.test.ts features/shared/upload-rules.test.ts` from `apps/web` at 07:44 UTC: **46 tests / four files passed in 551 ms**. This includes renewal, overlapping renewal, retry, design switching, element identity, volume/rate/muted state, callback stability and the readiness regression below.

### Finding P2 — timed actions could read the reset playhead during renewal — corrected

**Original evidence:** `VideoPlayer.replaceSource()` intentionally called `video.load()` while retaining the intended playback snapshot. The new overlapping-renewal unit test already showed `video.currentTime === 0` until metadata returned. Meanwhile, `DesignViewer.placePin()` read `videoRef.current.currentTime` directly, and timed marker/sidebar handlers wrote that same element's time. The player ignored transient remember events while `pending` existed and restored the earlier snapshot later. During a delayed renewal, a person could create a pin at zero or have a requested seek/pause superseded by restoration. This was source-confirmed across the actual consumer boundary; it was not inferred merely from the existence of asynchronous code.

**Correction reviewed:** the worker added `onVideoReadyChange(false)` before source replacement and terminal failure, then reports true only after metadata and any restoration seek have completed (`video-player.tsx:58`, `:115–147`). The orchestrator added a synchronous readiness ref plus visible state in `design-viewer.tsx:133–141`; `placePin` and marker/sidebar time handlers require that ref, actual metadata and `!video.seeking`. Add pin and time markers are disabled while unavailable, pin mode and frame overlays are suppressed, and readiness resets on design change. Ordinary paused/playing renewal still preserves the original session.

**Independent regression:** `artwork.test.tsx` now starts at 64 seconds, replaces the URL, verifies readiness stays false through metadata while seeking, verifies the restored 64-second time, and only accepts ready after `seeked`; terminal media failure disables readiness again. That case passed in the 46-test run above. The orchestrator subsequently reported that its rebuilt browser case, delaying the renewed media response and checking disabled pin actions before restoration, also passed. This reviewer did not run that browser fixture concurrently.

**Final assessment:** corrected in source and the independent player regression, with the real integrated consumer scenario additionally confirmed by the orchestrator. No other new material bug/security regression was found in this bounded review.

### Orchestrator-reported browser confirmation

Root reported **two targeted browser tests passed** after rebuilding: real video upload/sanitization/publication, all three roles, timed pins and network privacy; plus loading, paused/playing renewal, held-metadata pin protection and the main board Video/V4 card without media signing/downloads. The durable [after artifact](../../verification/video-loading-after-2026-09-23.json) was inspected by this reviewer. It records zero pre-open signatures, video elements, media GETs and response bytes, compared with 20 signatures/GETs and 553,640 bytes in the original baseline. Opening a design makes one signature and one GET for 27,682 bytes. The fixture is still a tiny four-second clip; neither that reduction nor its 51 ms metadata result establishes representative large-file latency.

These browser outcomes are explicitly orchestrator-reported. The later complete browser run and the final visual correction below were not yet reported complete when this addendum was written.

### Final visual correction — resize-only artwork framing

Root's actual screenshot review found the video mostly outside the canvas after changing from 1600 to 390 px, even though the document had no horizontal overflow. Root added `DesignViewport` and explicit artwork node dimensions in `apps/web/features/projects/design-viewer.tsx`. This reviewer inspected only that new helper, its geometry/dependencies, matching feature CSS and the associated browser assertion; no source or runtime was changed.

No material regression was found in the correction:

- `DesignViewport` subscribes to its own ReactFlow store's width, height and ready pan/zoom state. The initial positive measurement is remembered without an imperative move, leaving initial `fitView` responsible for opening. Later calls require an actual canvas width/height change. Time updates, comments, ordinary node recreation and manual viewport movement do not themselves trigger another fit.
- The supplied bounds use the actual single node's position `(0, 0)` and explicit dimensions. Width remains the existing 440 px for portrait or 620 px otherwise; height is `width / ratio`, matching the stage's CSS aspect ratio. Top-level node dimensions remove the dependency on xyflow's asynchronously measured fields after controlled-node recreation. The `design.id` ReactFlow key resets helper state when changing design.
- The final `getViewportForBounds` call uses the same 0.15 minimum zoom as the canvas and a fixed maximum of 1. Each actual resize intentionally computes an appropriate fit; zoom may increase again when the canvas grows. Ordinary renders and manual viewport changes still do not refit because the remembered width/height equality guard returns first.
- The initial review inspected a version capped by the current zoom. Its arithmetic fit probes passed but were insufficient to prove readability during a CSS width transition. Root's screenshot review caught cumulative shrink: an intermediate narrow canvas reduced the zoom, which remained too small at the final mobile width. The final fixed maximum removes that dependency on intermediate zoom. A second read-only Node probe imported the installed helper with a 620 × 348.75 artwork and 498 px canvas height: a 170 px intermediate width yields 158 px of artwork; the final 390 px width independently grows it to 362 px. Both fit their canvas. This numerical check does not substitute for the browser screenshot.
- The updated browser test calculates the actual video/canvas rectangle intersection and requires more than 98% of the video area inside the canvas after resize, plus video width greater than 300 px on mobile. The second condition prevents a tiny but fully visible frame from passing. Root owns execution against the rebuilt image and screenshot inspection.

The helper reframes only when the canvas changes size, which matches this bounded correction. It does not introduce a viewport state store or change media sources, playback state, pin normalization or project authorization. Final visual browser results were still in progress at this handoff.

## Remaining risks and next action

The orchestrator should finish the final resized-video browser/visual check and complete suite against the new image. Final type/build/media gates, preservation checks, documentation integration and acceptance remain with root; the already reported targeted video loading/renewal/pin checks are recorded above. No new broad scope is required by this review. The preexisting retry/cleanup limits above remain explicit; the bounded changes do not establish that those older concerns are resolved. This report does not approve a production release.

## Ownership at handoff

This report is released to the orchestrator. No source writer or runtime process remains active under this worker. All implementation files were read-only throughout this assignment.
