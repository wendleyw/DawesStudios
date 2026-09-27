# Video optimization baseline

- Updated at: 2026-09-23T07:28:45Z
- Reporting agent and tool: team_navigation / Codex
- State: audit and browser baseline tested; optimization proposals are not implemented
- Objective: identify concrete loading/processing costs and provide a repeatable before/after measurement while the orchestrator completes the project-only Playground phase.
- Owned paths: this report; subsequently authorized `apps/web/tests/e2e/video-loading.spec.ts` and `docs/verification/video-loading-baseline-2026-09-23.json`.
- Dependencies: [current objective](../../architecture/project-playground-and-video-optimization.md), [earlier video handoff](2026-09-21-video-designs-and-feedback.md), existing local role accounts, canonical web/Supabase services and guarded acceptance cleanup.
- Acceptance criteria: source-backed findings; a reusable browser baseline with temporary data fully removed; no video implementation changes or unsupported performance claims.

## Completed work and changed files

Applied codebase-review and first-principles-review to the current browser, media and cleanup paths. The initial audit was read-only. The orchestrator then explicitly authorized a browser performance fixture before rebuilding the old running web image. Only the test, aggregate baseline JSON and this report were written; no video feature, media service, migration or runtime configuration was changed.

The new test creates one uniquely named **Acceptance video loading** client/project, one deliverable, four versions and five distinct video paths per version. It uses the existing agency account and directly inserts service-role fixture records; this tests loading, not production upload/sanitization. The 20 objects contain the same tracked `campaign-clip.mp4` bytes. Cleanup runs in `finally`, uses the existing UUID/title-guarded `cleanupTestProject`, verifies the exact temporary client name, then removes that client. No original membership, design or file is replaced. A follow-up SQL read found zero temporary video clients/projects.

The historical test was `apps/web/tests/e2e/video-loading.spec.ts` (available before its retirement in commit `13b11bb`); the Miro migration removed this legacy video-loading scenario. The aggregate results were copied out of transient `test-results` before the orchestrator's next run to [video-loading-baseline-2026-09-23.json](../../verification/video-loading-baseline-2026-09-23.json). It contains counts and timings only, without tokens, signed URLs or private fixture identifiers.

## Measured browser baseline

Command, from `apps/web`:

```sh
VIDEO_LOADING_PHASE=baseline ./node_modules/.bin/playwright test video-loading.spec.ts --reporter=line
```

This passed in **3.6 seconds** against `http://localhost:3003`, Chromium at the configured 1600 × 1000 viewport, before the orchestrator rebuilt the project-only Playground source. Baseline completion was reported before 07:27 UTC on 2026-09-23. The orchestrator supplied its retained pre-rebuild Docker evidence: `sha256:8d21d8756d68777999a7671fd1ef43e980e1b2aaae6aadb0e98a6df22ed8e617`, created at 2026-09-23 02:23:37 -04:00. That attribution is orchestrator-reported; this reviewer's own later inspection saw the replacement container started at 07:28:12 and is not used as the baseline image.

| Measurement                   |      Before opening any design |   After opening the first design |
| ----------------------------- | -----------------------------: | -------------------------------: |
| Video elements                |                             20 |                One active player |
| `preload="metadata"` previews |                             20 |                                — |
| Assigned preview sources      |                             20 |                                — |
| Signing requests              |                             20 |                    20 cumulative |
| Media GET requests            |                             20 |                    20 cumulative |
| Media response bytes          |                        553,640 |               553,640 cumulative |
| Observation window            | 2,113 ms, including navigation |                                — |
| Viewer metadata readiness     |                              — |              58 ms after opening |
| Seek result                   |                              — | 2.0 seconds in a 4.0-second clip |

Each clip is 27,682 bytes, so this browser fetched all 20 small video files before playback was requested. The viewer reused cached bytes. The 58 ms figure is consequently a cached metadata readiness measurement, not a cold playback benchmark. This is one run, with no network throttling; it does not establish representative large-video latency or peak memory.

The same test supports `VIDEO_LOADING_PHASE=after`, which asserts zero video GETs and zero video response bytes before opening a design while retaining metadata/seek verification. With no phase set, it records measurements without enforcing a before/after request budget. A fixed two-second observation period is intentional for this measurement; element readiness uses Playwright assertions.

## Findings and bounded improvements

### 1. Preview cards load complete media sources before they are useful — highest priority

`projects/artwork.tsx` calls `useDesignAssetUrl` for every thumbnail and renders a real `<video src=... preload="metadata">`. There is no visibility gate. `project-nodes.tsx` renders up to five previews per version, and the project canvas renders every version. The browser baseline confirms 20 signatures and 20 media transfers for four versions without opening a design.

An additional source gap exists on the main board: `selectProjectArtwork` can choose an `.mp4`/`.webm` path, but `ProjectThumbnail` always renders an `<img>` and its data model carries no media-kind distinction. A video-aware lightweight preview should address this as well, rather than sending a video URL to an image element. This main-board case was source-inspected, not browser-reproduced in the baseline.

**Bounded next step:** render a clear video tile without assigning the full video source or signing it until the design opens. Preserve the design title, aspect ratio, open control and video indication. If actual poster frames are required, generate one small private image once during trusted processing and preserve role/publication isolation; that is an additional contract, not a prerequisite for eliminating eager video transfers. Do not replace deferred loading with hidden autoplaying videos.

**After measure:** the supplied test should retain 20 usable open controls but report zero pre-open video requests/bytes. Repeat one cold and one warm navigation at the same viewport. Report the first player's metadata and seek behavior separately so deferring a transfer is not presented as eliminating playback cost.

### 2. Processing failure causes a second complete browser upload — high priority

`uploadDesignAsset` generates `rawPath` inside each invocation, completes TUS upload, then calls sanitization. Its catch logs and rethrows without returning the attempt/path. `ProjectActionDialog` only retains `stagedArtwork` after the whole function resolves. Clicking submit again after a processing error therefore creates a new raw path and uploads the same file again. A read-only execution of the real function with mocked TUS/media boundaries produced **two processing attempts, two upload attempts and two distinct raw paths** after one simulated processing failure.

The media server also generates a new clean destination per sanitization request and deletes the raw input after success. A lost successful response needs a server-side completed-attempt lookup; merely retaining the raw path is insufficient once that raw object has already been deleted.

**Bounded next step:** retain an explicit upload attempt in the form, including its stable ID/path and uploaded state, then retry processing without resending bytes. Preserve typed retryable versus terminal processing errors. Add a scoped idempotent completion record/lookup so replay after a lost success resolves to the same clean result. Keep project access and uploader/preparer checks; never reuse another caller's attempt.

**After measure:** inject one transient sanitize failure after TUS success. Retry must show one raw upload, the same attempt, one surviving clean object and a final design. Inject a lost successful response separately and verify replay, then test cancel/discard cleanup. Use a disposable fixture rather than seed designs.

### 3. Playback source stability is traded for an hour-long URL

`useDesignAssetUrl` signs video URLs for 3,600 seconds and refreshes at 55 minutes. `Artwork` assigns query data directly to `video.src`, so a genuinely new URL replaces the player's source. Project/comment mutations deliberately do not invalidate `asset-url`, which already avoids frequent incidental resets. The remaining refresh behavior is source-backed; the short baseline did not wait 55 minutes or measure a reset.

**Bounded next step:** decouple the currently playing source from a background signing result. Adopt a refreshed URL deliberately, retaining time and paused/playing state, with an explicit recovery path for an expired range request. Measure this behavior before shortening the URL lifetime. Do not increase expiration further as a performance optimization.

**After measure:** force a new signed URL while the player is at a nonzero time, both playing and paused. Verify source/time continuity or intentional restoration, backward seeking, pin placement and time-marker seeking. Retain client/private-file isolation. A lightweight tile should not mint an hour-long playback credential at all.

### 4. Two long operations occupy every synchronous media slot

`createMediaServer` has one `active` counter for sanitize-video, publication preparation, delivery and prepared-file discard; `active >= 2` immediately returns 429. There is no queue or Retry-After response. Authentication and `/health` remain available, so describing the entire service as down would overstate the evidence. A publication processes up to 20 designs serially while holding a slot. Video transfer/remux stages each have 300-second limits; these are timeout budgets, not observed durations.

**Bounded next step:** first eliminate repeated transfers from Finding 2. Then measure a mixed workload before changing scheduling. Keep a bounded processing budget and let small authorized cleanup work complete without waiting behind long video copies. If waiting is introduced, expose an honest queued state and bounded admission; do not simply increase parallel ffmpeg jobs or add permanent worker infrastructure without evidence.

**Before/after measure:** two disposable video operations plus one small publication/discard, recording processing admission, 429 responses, queue wait, completion time, peak RSS and scratch use. Do this after the Playground gate; this reviewer did not occupy live media slots for a stress test.

### 5. Streaming is already present; target extra disk passes and cleanup gaps

The current video pipeline downloads to disk, remuxes with `-c copy` and strips format/stream metadata and chapters. MP4 uses faststart. Uploads and SHA-256 calculation use streams. Compose supplies disk-backed `/scratch`, and request `finally` blocks plus a startup sweep remove scratch directories. The claimed gigabyte-in-memory problem is not present in this code.

There is still a full extra read of each output file for hashing after upload. Publication performs download-to-file, upload-from-file, then another read for SHA-256. Computing the digest during an existing transfer could remove that extra pass while keeping identical attestation bytes. This is a bounded candidate to benchmark after the browser/retry improvements, not a claim of measured CPU or memory savings.

Cleanup needs explicit verification before throughput is increased:

- The browser's `discardUnreferencedArtwork` calls Storage directly, while service-written clean videos do not satisfy `internal_storage_delete`'s caller-owner condition. HTTP success alone would not prove object deletion; verify actual absence.
- Raw failures are not in `private.sanitized_assets`; the hourly sweep cannot find them. That sweep also explicitly excludes internal video attestations. Retained raw attempts and discarded clean staging need an authorized cleanup lifecycle, with checks that preserve attached designs and immutable publications.
- In publication's video branch, an `uploadFile` failure occurs before the target enters `assets`; the outer catch only discards entries in `assets`. An uncertain upload can therefore leave an unregistered published object. Sanitization already has a local upload-failure discard catch; publication lacks the equivalent in current source. Test this boundary with a response lost after storage commits.

Do not broaden cleanup to arbitrary old files. A retryable attempt must be distinguishable from abandoned staging, and deletion must recheck live design/publication references under the existing locking contract.

## Prior handoff reconciliation

The old report's comment-remount idempotency finding is already resolved in current source: `CommentAttempt` lives alongside the scoped draft in React Query, survives panel remount and clears on success. Existing tests passed; no new fix is proposed for it. Upload cancellation remains absent, but a full cancellation UX is not needed to prove the first loading improvement. The historical intermittent video-test observation is not a measured performance bottleneck and was not re-investigated here.

The supplied fixtures are functional samples, not throughput workloads: `campaign-clip.mp4` is H.264, 640 × 360, 4 seconds, 27,682 bytes; media's `tagged.mp4` is H.264, 320 × 240, 2 seconds, 12,150 bytes. Large-file claims require a separate fixed medium/large fixture, recorded size/hash, source and image revision, and at least three identical before/after runs reporting median/range. Capture download, probe/remux, upload/hash/attestation and total time separately; monitor peak RSS and scratch usage. Retain metadata/provenance checks and compare files after failure cleanup. No large-file timing was collected in this audit.

## Checks actually executed

| Check                                                                                                                                                                     | Result                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Scoped source/SQL/readme review                                                                                                                                           | Findings above; no video feature source changed                                                       |
| `ffprobe` on the two tracked MP4 fixtures, allowlisted codec/dimensions/duration/size output                                                                              | Values recorded above; metadata tags were not dumped                                                  |
| In-memory render of 20 actual Artwork thumbnails with mocked signing                                                                                                      | 20 video elements, 20 metadata preloads, 20 signing-hook invocations; no network calls                |
| In-memory upload retry probe using actual `uploadDesignAsset` and mocked boundaries                                                                                       | 2 uploads / 2 raw paths for 2 processing attempts                                                     |
| `vitest run features/projects/artwork-files.test.ts features/projects/comment-draft.test.tsx features/projects/video-pins.test.ts features/projects/media-client.test.ts` | 30 tests / 4 files passed in 495 ms; existing Node DEP0205 warning                                    |
| `VIDEO_LOADING_PHASE=baseline playwright test video-loading.spec.ts --reporter=line`                                                                                      | 1 browser test passed in 3.6 seconds; metrics preserved in the linked JSON                            |
| Read-only SQL counts for `Acceptance video loading %` client/project names                                                                                                | Both zero after cleanup                                                                               |
| Scoped ESLint and Prettier on `video-loading.spec.ts`                                                                                                                     | Passed                                                                                                |
| `tsc --noEmit`                                                                                                                                                            | Initial two fixture typing errors corrected (nullable Auth user and video DOM type); final run passed |

No media stress test, image rebuild, media/database integration mutation or optimization after-measure was performed by this reviewer. The browser fixture mutation was explicitly authorized later in the task and is separate from the initial read-only audit.

## Remaining risks and next action

The orchestrator should finish the project-only Playground acceptance before assigning video implementation. Start with deferred video previews and stable retry state, then use the supplied `after` mode and existing three-role video workflow to verify playback, seeking, timed feedback and publication privacy. Preserve the baseline JSON when subsequent tests clear transient output. One browser run with tiny clips and absent large-file processing measurements are the remaining baseline limitations; do not treat source-level I/O counts as measured latency gains.

## Ownership at handoff

The test, aggregate JSON and report are released to the orchestrator. No active writer, browser test, fixture, process or runtime change remains owned by this reviewer. This report does not approve release or claim the video optimizations are implemented.
