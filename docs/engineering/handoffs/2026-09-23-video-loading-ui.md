# Video loading and playback continuity UI

- Updated at: 2026-09-23T07:44:17Z
- Reporting agent and tool: Playground / video UI worker, Codex
- State: implemented and unit/component tested; rendered media and network verification owned by the orchestrator
- Objective: remove video signing, media requests and player allocation from passive project thumbnails; preserve viewing state when an active player's URL renews or retries.
- Owned paths: `features/projects/artwork.tsx`, new `video-player.tsx` and colocated tests, `project-data.ts` asset URL hook only, scoped video rules in `projects.css`, video sections in `projects/README.md`, this report.
- Dependencies: orchestrator-owned DesignViewer timed-action readiness integration, main-board thumbnail handling and real browser metrics; unchanged private Storage, media sanitization and immutable publication.
- Acceptance criteria: passive video tiles have no media element and no signature; images stay unchanged; open viewer controls/ref/timed callbacks remain functional; paused/playing position survives renewal/retry; a different design does not inherit the prior position; real errors remain recoverable.

## Completed work and changed files

- `artwork.tsx`: video thumbnails return a static icon and **Video** label while the existing consuming preview keeps the design title/open action. They disable asset signing. Full viewers use `VideoPlayer`, keyed by channel/design/asset path rather than signed URL. Existing image and generated-artwork rendering remains intact.
- `project-data.ts`: `useDesignAssetUrl(assetPath, channel, enabled = true)` disables signing and renewal timers when requested. Its user/channel/path cache key, channel-selected bucket, video one-hour expiry/55-minute renewal and image expiry remain unchanged. Only this hook and its now-obsolete playback comment were changed by this task; earlier Team changes elsewhere in the file were preserved.
- `video-player.tsx`: one native video element per viewing session, imperative source replacement after state capture, restoration after metadata, overlapping-renewal protection, native transport controls, retained ref and duration/time callbacks. Volume/mute remain on the same node; time/rate/paused-or-playing state are restored explicitly. Ordinary rerenders do not reload the source.
- Retry retains the last usable playback snapshot, including when a failed source no longer has metadata and when a fresh signature equals the previous URL. Background signature failures do not replace usable playback with an error banner. Transient range errors with buffered media retain the former behavior. Terminal failure exposes **Retry preview**; browser refusal to resume playback gets a clear paused notice with native controls still available.
- Optional `onVideoReadyChange(boolean)` flows through Artwork to the player. It is false before replacement and on unusable media errors, and true only after metadata and any restoration seek complete. This lets the parent disable and guard timed pin actions during the otherwise unsafe zero-playhead interval.
- `artwork.test.tsx`: 13 behavior cases for passive tiles/images, viewer metadata/ref/control behavior, paused and playing renewal, rate/mute/volume, overlapping sources, ordinary rerenders, seek-readiness, retries, signing/transient errors, changed design and rejected autoplay resumption.
- `project-asset-url.test.tsx`: real TanStack Query activation with mocked Storage proves disabled queries do not sign even on invalidation, default image behavior remains active, and another user does not reuse the prior user's cached signature.
- `projects.css`: added only video placeholder/player/feedback styles after notifying the orchestrator. `README.md` documents loading, state restoration, error behavior and the relevant checks.

No package, service, migration, upload/cancellation workflow or stored file was changed. Earlier uncommitted work remains intact.

## Decisions and interfaces

The enabled hook flag defaults to true to preserve existing consumers. The full video player keeps the real DOM ref used by timed comments. A source URL is applied only when its string actually changes or the user explicitly retries; it is never a React key. The key includes design/channel/path so a different work item starts at zero instead of inheriting another item's private review state.

The independent reviewer identified a real transition boundary: `load()` resets time before metadata, while the parent could still read that ref to place or seek a timed comment. The orchestrator accepted the explicit readiness callback and owns parent button/handler guards. The callback waits for `seeked` when restoration is asynchronous; first metadata at time zero avoids an unnecessary seek. Native controls remain available.

The historical [browser baseline](2026-09-23-video-optimization-baseline.md), measured by the reviewer before these changes, found 20 signatures, 20 media GETs and 553,640 bytes before opening any design. This worker does not claim an after-measurement; the orchestrator runs the same fixture against the rebuilt implementation and measures renewal/seek behavior.

The installed project-structure, testing and update-project skills guided colocation, behavior-based tests and documentation. Existing React/Vitest/Testing Library/TanStack Query tooling was reused.

## Checks actually executed

| Command or scenario                                                                                                                                                                             | Environment and time             | Observed result          | Evidence                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `npx vitest run features/projects/artwork.test.tsx features/projects/project-asset-url.test.tsx features/projects/video-pins.test.ts features/projects/project-data.test.ts`                    | `apps/web`, 2026-09-23 07:43 UTC | PASS, 60 tests / 4 files | New activation/player regressions plus existing timed-pin/data coverage |
| `npx eslint features/projects/artwork.tsx features/projects/video-player.tsx features/projects/artwork.test.tsx features/projects/project-asset-url.test.tsx features/projects/project-data.ts` | `apps/web`, 2026-09-23 07:43 UTC | PASS, exit 0             | Scoped source and tests                                                 |
| `npx tsc --noEmit --pretty false`                                                                                                                                                               | `apps/web`, 2026-09-23 07:44 UTC | PASS, exit 0             | Combined current tree                                                   |
| Scoped Prettier and `git diff --check`                                                                                                                                                          | Repository, 2026-09-23           | Checked before handoff   | Owned source, tests and documentation                                   |

An earlier full typecheck found missing `this` annotations in this worker's media mocks and a timer-wrapper type mismatch in the orchestrator's browser test. Both were corrected by their owners before the final passing check. The media methods are mocked in component tests; those tests prove state transitions, not decoding, HTTP ranges or browser autoplay policy.

## Remaining risks and next action

The orchestrator must rebuild and confirm zero pre-open video requests/bytes/signatures, then measure the real player's initial loading, seeking and paused/playing URL renewal. Verify private internal/client channels, upload/publication/playback and timed pin placement after readiness, desktop/mobile placeholder layout, and controls during failure/retry. Source/unit evidence cannot replace those browser outcomes.

Browser autoplay policy may reject resumption even after a prior play; the explicit paused notice is intentional recovery. The one-hour signature lifetime is unchanged. Upload retry idempotency, cancellation and media processing improvements are outside this worker's scope and remain with their assigned owner.

## Ownership at handoff

Runtime source released for integration/review at approximately 07:44 UTC. Only scoped README/report edits followed release unless later browser/reviewer feedback is recorded below. No runtime rebuild, live data/file mutation, commit or deployment was run by this worker. The orchestrator owns final measurements, acceptance, shared checkpoint and subsequent work.
