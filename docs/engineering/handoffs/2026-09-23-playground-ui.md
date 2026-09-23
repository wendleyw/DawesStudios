# Playground UI implementation

- Updated at: 2026-09-23T06:16:56Z
- Reporting agent and tool: Playground UI / Codex
- State: implemented and unit/component tested; real browser verification owned by the orchestrator
- Objective: deliver a persistent, private, accessible brainstorming canvas with uploads, editable notes, movement/resizing, downloads and recoverable failures.
- Owned paths: `apps/web/features/playground/` excluding `playground-data.ts` and `playground-types.ts`; this report.
- Dependencies: the backend worker owns the data/type contract, private Storage, revisions and durable cleanup; the orchestrator owns consumers, migrations/types integration, live services and browser/visual verification.
- Acceptance criteria: agreed dialog API and labels; real backend writes through the feature data layer; stable retries; no silent loss of failed drafts; keyboard/mobile canvas controls; meaningful tests and documentation.

## Completed work and changed files

- `playground-dialog.tsx`: exports `PlaygroundDialog({ clientId, projectId?, onClose, returnLabel? })`. Native dialog with focus restoration; xyflow canvas with pan/zoom/fit, selection and group movement; three-transfer batch queue; inspector with editable notes/title/description and numeric position/size fields; explicit save and signed download; guarded removal and close; in-flight status, per-file rejection messages, retryable local drafts and server cleanup errors.
- `playground-node.tsx`: note/image/document rendering, private/blob image previews, selected-item resize handles, edit control and per-item save/error status.
- `playground-model.ts`: file/extension validation using backend MIME and size constants, safe bounded names, batch layout, payload validation, item snapshots and draft reconciliation. No data access.
- `playground-viewport.tsx`: refits a clipped selected item using explicit geometry after actual canvas size changes or pan/zoom readiness; handles asynchronous item loading, skips already-visible nodes and never responds to note typing.
- `playground.css`: feature-owned desktop canvas, restrained notes/cards, inspector, transfer/error surfaces and mobile bottom editor.
- `playground-model.test.ts`, `playground-dialog.test.tsx` and `playground-viewport.test.tsx`: 33 tests covering validation, layout, stable upload/save retries, file expiration, individual batch rejections, conflicting changes, latest revision use, remote deletion, failed deletion cleanup, responsive framing and closing during actual saves.
- `README.md`: feature behavior, limits, recovery, consumer responsibility and verification boundaries.

No shared primitives, consumer files, migrations, services, fixtures or credentials were modified by this worker. No dependencies were added. Earlier startup work was preserved.

## Decisions and interface changes

The interface follows the specification and was coordinated with the backend/orchestrator before implementation. Supported files are PNG/JPEG/WebP/GIF, PDF, text/CSV, Word/Excel/PowerPoint (legacy and OOXML), and RTF, using the backend's 25 MiB limit. Empty/generic MIME types may be inferred from the supported extension; an explicit unsupported MIME cannot be relabeled. Storage names always begin with an ASCII letter/digit and preserve a bounded safe filename under the stable board/item path.

Notes save explicitly. Drag/resize saves on gesture completion; keyboard geometry saves through the inspector. Transfers and retries retain stable IDs/paths and expected revisions. Uploaded files remain staged after a failed item save; only a missing-stage error changes that state so retry can upload the retained file again. Existing local edits survive query refresh and conflicts. A confirmed fresh read retires committed overlays, while failed deletion stays locally visible until cleanup completes.

The exact primary labels are **Playground**, **Add note**, **Add files**, **Add files to Playground** (file input), **Note title**, **Note text**, **Save note**, **Position and size**, **Horizontal position**, **Vertical position**, **Width**, **Height**, **Retry save**, **Retry removal**, **Download file**, **Remove item**, and **Confirm removal**. The return button uses `returnLabel`, defaulting to **Back to board**. Consumer integration passes **Back to upload** where appropriate.

The installed project-structure/testing skills guided colocation and behavior-oriented verification; update-project guided the scoped README/report. No tooling installation was needed.

## Checks actually executed

| Command or scenario                                                                                                                                                                                                                                                                                                             | Environment and time        | Observed result                                                          | Evidence                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `npx vitest run features/playground/playground-model.test.ts features/playground/playground-dialog.test.tsx features/playground/playground-viewport.test.tsx`                                                                                                                                                                   | `apps/web`, 2026-09-23      | PASS, 33 tests across three files                                        | Last run at 06:16 UTC after the measured browser diagnosis and viewport correction |
| `npx eslint features/playground/playground-dialog.tsx features/playground/playground-node.tsx features/playground/playground-model.ts features/playground/playground-viewport.tsx features/playground/playground-model.test.ts features/playground/playground-dialog.test.tsx features/playground/playground-viewport.test.tsx` | `apps/web`, 2026-09-23      | PASS, no findings                                                        | Exit 0                                                                             |
| `npx tsc --noEmit --pretty false`                                                                                                                                                                                                                                                                                               | `apps/web`, 2026-09-23      | PASS after the orchestrator generated current database types             | Exit 0                                                                             |
| Scoped Prettier writes, then checks                                                                                                                                                                                                                                                                                             | `apps/web`, 2026-09-23      | Implementation and tests formatted; documentation checked before handoff | Owned paths only                                                                   |
| `.from(` / `.rpc(` / `.storage.` scan of Playground `.tsx` files                                                                                                                                                                                                                                                                | Repository root, 2026-09-23 | No Supabase matches; only `Array.from` matched the broad scan            | Database operations remain in backend-owned data module                            |

The initial component run failed because jsdom does not implement native `showModal`; the tests now provide a narrow dialog polyfill. An initial ESLint check caught a render-time ref assignment; it was removed. The first full TypeScript check preceded generated Playground/widget database types and failed in those integrations, not the UI; the later full check passed. These earlier failures are corrected and not presented as passing evidence.

## Browser feedback integrated

The orchestrator reported a first real-browser pass with all three role persistence cases and the dropped image/document bundle passing. Its desktop visual case passed axe, then measured 20 px of dialog overflow. This worker inspected the supplied screenshot and traced the excess width to the hidden file picker: the global input selector overrode its class's `width: 1px`, so an absolutely positioned 100%-wide input began at the toolbar's 20 px inset. The picker now uses native `hidden` and has no positioning/opacity workaround; the visible **Add files** button still opens it. The 24 tests, scoped ESLint and full TypeScript check passed again after this change. Remeasurement on the rebuilt app belongs to the orchestrator.

The in-app browser runtime was unavailable in this worker's tool session (`No browser is available`; browser discovery returned an empty list). The orchestrator later explicitly authorized the existing repository Playwright runner for the mobile diagnosis below. The earlier browser outcomes remain explicitly the orchestrator's report.

Conflict handling was updated to recognize the backend's `PT409` business-conflict code, retaining `40001` compatibility. The component conflict test now uses `PT409`.

## Review corrections after the rebuilt browser run

The orchestrator reported that the rebuilt app now passed the overflow and drag/resize cases. It then requested two additional UI corrections. Both were reproduced in component/DOM regressions before the implementation changed:

1. A deletion rejected with `PT409` retained `failedAction: delete` but never marked the conflict. The editor remained locked, reload was missing, and discard/close repeated the stale deletion. The error now carries conflict state and offers explicit saved-item reload; an impossible same-revision removal retry is suppressed. Discard/close abandons a rejected removal locally, preserving the collaborator's item. Tests verify resumed editing uses the newer revision and closing sends no second deletion.
2. Playwright's exact label lookup failed after note save/retry even though its accessibility snapshot showed **Note text**. The installed label engine reads implicit label text including the textarea's DOM text children. The new regression observed `Note textKeep my draft` directly. The textarea now has an explicit stable `id` with a separate `label htmlFor`, keeping its label independent of content while preserving layout and accessible naming.

The first regression run failed in exactly these three assertions; after the fixes, **26 tests** across two files passed. Scoped ESLint, full `tsc --noEmit`, and scoped Prettier checks also passed. A temporary test typing error (`exact` on Testing Library's role options) was removed and the full typecheck rerun successfully. The orchestrator owns the next rebuilt E2E run; no services or parent-owned tests were changed by this worker.

## Final reconciliation and mobile framing hardening

A final independent review found that `reloadSaved()` retained a committed local copy, and an automatic query update could omit a remotely deleted item while that copy remained visible. Explicit reload now removes the local copy immediately. Other committed overlays record the query snapshot current when they were saved; every later successful canonical snapshot supersedes them, including when the row is absent. Dirty, failed-save and pending-cleanup drafts retain priority. New component regressions cover automatic deletion after conflict reload without a manual refresh, and preservation of an unsaved edit after its remote item disappears.

This worker inspected `docs/verification/screenshots/playground-390.png` and confirmed that the selected note was outside the visible mobile canvas after desktop resizing. `PlaygroundViewport` now responds to real canvas dimensions, node initialization and selection changes. It fits a clipped selected node, or the board on initial opening, and skips an already-visible selected node so inspector opening does not move a node under the pointer. Note text is not a dependency. Three tests cover desktop-to-mobile dimensions, waiting for initialized nodes on fresh open, and uninterrupted typing without recentering.

After these changes, **32 tests across three files passed**, scoped ESLint passed, and the full TypeScript check passed. One temporary mock tuple typing error was fixed before the final green check. The source was released to the orchestrator for rebuilding and to the independent reviewer for retesting. Parent-owned browser assertions will measure selected-node visibility on the rebuilt mobile canvas; this worker's screenshot diagnosis and hook tests do not substitute for that measurement.

## Measured mobile diagnosis and final correction

The rebuilt mobile assertion still failed after the first hook-based fix. The orchestrator authorized a temporary Playwright diagnostic using the existing guarded `createPlaygroundFixture()` and `finally` cleanup. Two diagnostic runs passed and completed fixture cleanup; the temporary test was removed. No baseline clients/projects, services or parent-owned test assertions were changed.

The browser measured these values before any manual canvas action:

| State                          | Canvas size   | Viewport translation         | Note position and size     | Result        |
| ------------------------------ | ------------- | ---------------------------- | -------------------------- | ------------- |
| Desktop                        | 1258 × 767.31 | 591, 225.5 at zoom 1         | x660, y451.69, 280 × 220   | Visible       |
| Resized mobile                 | 390 × 250.70  | Still 591, 225.5 at zoom 1   | x639, y453.5, 280 × 220    | Fully clipped |
| Mobile after built-in Fit View | 390 × 250.70  | 7.85, -32.78 at zoom 0.99545 | x55.64, y195, 278.73 × 219 | Visible       |

A read-only inspection of the actual ReactFlow store confirmed that width/height updated correctly to `390`/`251`, `fitViewQueued` was false, but `nodesInitialized` stayed false. The installed xyflow `adoptUserNodes` recreates measurements from each new controlled node object; Playground supplies explicit width/height without a `measured` copy, so the `useNodesInitialized()` gate suppressed the responsive effect indefinitely. Clicking built-in Fit View proved the navigation controls worked and briefly restored the measured flag.

The corrected helper waits for `panZoom`, obtains the explicit item bounds and applies `getViewportForBounds` through `setViewport` directly. A node-count subscription also fits stored items arriving after initial canvas readiness. It leaves visible selected items stationary and does not subscribe to note content or transient measurement state. Built-in controls remain intact. Four regressions cover persistently unmeasured controlled nodes during a desktop-to-mobile resize, fresh mobile readiness, late remote items far from origin, and recreated node objects during uninterrupted typing. Bounds assertions use the installed xyflow calculation rather than a fake fit result.

After this correction, the scoped suite passed **33 tests**, scoped ESLint passed, and full `tsc --noEmit --pretty false` passed. Source was released for the orchestrator's rebuild at 06:16:56 UTC. This worker's diagnostic reproduced the failure and verified its cause; the post-fix browser visibility assertion remains the orchestrator's next check.

## Remaining risks and next action

The orchestrator must validate the rebuilt app in a real browser: all role/scope entries, multi-file drop, persistence after reopen/reload, drag/resize/group movement, signed previews/downloads, keyboard geometry and focus, nested upload return, 390 px layout and visual inspection. The component suite substitutes the canvas renderer and data boundary; it is not browser or authorization evidence. Backend pgTAP/HTTP isolation belongs to its owner and final integration.

Unsaved local text/files survive failures while the dialog remains mounted. Closing explicitly discards them only after confirmation/cleanup, and browser navigation warns first. There is no durable browser draft store; leaving despite the warning loses uncommitted browser memory. Committed items persist in Supabase, and abandoned staged files have backend cleanup.

## Ownership at handoff

Owned files are ready for orchestrator integration and browser feedback. Only the two explicitly authorized, guarded browser diagnostic fixtures mutated local acceptance data, and both completed cleanup. No server process, commit or deployment was started by this worker. The orchestrator owns final acceptance and the shared checkpoint.
