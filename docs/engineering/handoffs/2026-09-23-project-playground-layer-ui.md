# Project Playground layer UI

- Updated at: 2026-09-23T07:32:32Z
- Reporting agent and tool: Playground UI / Codex
- State: implemented and component tested; rendered browser acceptance belongs to the orchestrator
- Objective: replace the former modal Playground with a project-contained board that enters downward and exits upward while preserving all existing draft/file recovery behavior.
- Owned paths: `apps/web/features/playground/` excluding backend-owned data/types and their tests; this report.
- Dependencies: orchestrator-owned project surface, underlay inert state, upload-dialog suspension/resume, entry points and browser tests; backend-owned required project scope and authorization migration.
- Acceptance criteria: required project scope; named nonmodal region; completed entry/exit/reduced-motion behavior; local focus/Escape; retained upload/retry/conflict/viewport behavior; meaningful regressions and current documentation.

## Completed work and changed files

- Renamed `playground-dialog.tsx` to `playground-board.tsx`, exporting `PlaygroundBoard` with required `clientId` and `projectId`. The default return label is **Back to project**. `onClose` runs once after upward exit, with reduced-motion and missing-animation-event fallbacks.
- The root is a named `section`/`region`, with `.playground-board` and `data-phase="entering|active|exiting"`. It uses no dialog, backdrop, global focus trap or body scroll mutation. The heading receives initial focus. Escape is handled when focus is inside the board or has fallen to the body after a disabled action. Focused project/navigation controls remain independent. Exit makes the layer inert; focus restoration respects navigation or an upload form that already took focus.
- `playground.css` positions the layer absolutely within the project surface. Entry translates from -100% to zero over 240 ms; exit translates upward over 180 ms. Reduced-motion styling disables animation. The mobile inspector is capped relative to available work-area height instead of viewport height.
- Existing local drafts, stable IDs/revisions, uploads, retry/conflict recovery, deletion cleanup, downloads, group movement, resizing and responsive viewport behavior remain in place. The designer privacy copy now refers to the project.
- While dirty or busy, a document capture listener guards same-origin, same-tab links to another path/search. It displays **Save or discard your Playground changes before leaving this project.** with existing keep/discard controls and a specific in-flight explanation. It permits clean navigation, modified/new-tab clicks, downloads and same-page anchors, and is removed when no longer needed or on unmount. It never resumes a destination automatically.
- Renamed the colocated recovery suite to `playground-board.test.tsx`; preserved all 13 prior recovery scenarios and added nine layer/navigation scenarios. `README.md` now documents the project-only integration, controls, limits and current test command.

No data/type files, backend tests, migrations, consumer files, services, environment files or saved user content were changed by this worker. No dependencies were added. All earlier uncommitted work was preserved.

## Decisions and interface changes

The required interface was reported to the orchestrator before implementation: `PlaygroundBoard({ clientId, projectId, onClose, returnLabel? })`. The parent owns the clipping project surface and marks the covered work area inert while keeping header/navigation accessible. It owns upload-dialog suspension and reopening after `onClose`; the upload form remains mounted. The board never changes body scroll or global focus behavior.

The orchestrator explicitly requested a bounded link guard after the new nonmodal interaction exposed client-side navigation that does not trigger `beforeunload`. Browser Back/Forward and arbitrary programmatic router transitions are not patched; this limitation is documented rather than hidden. The parent also owns a stable header opener ref because disabling that opener on the mounting render can move focus before the child captures it.

Animation end is filtered by both root target and animation name, so child animations cannot close the board. A 300 ms fallback covers canceled/missing animation events. Reduced motion uses a zero-delay completion. Close/discard remains gated by real transfer/save state, and cleanup must succeed before exit begins.

The project-structure, testing and update-project skills guided colocation, behavior-focused component regressions and documentation. Existing npm/Vitest/Testing Library tooling was reused.

## Checks actually executed

| Command or scenario                                                                                                                                                                                                                                                                                                           | Environment and time             | Observed result                                                                              | Evidence                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| New layer regressions against the old dialog                                                                                                                                                                                                                                                                                  | `apps/web`, 2026-09-23           | Expected failures: missing region, body lock, old return label and Escape/animation behavior | Initial red component run, 7 failed / 11 passed                                                  |
| `npx vitest run features/playground/playground-model.test.ts features/playground/playground-board.test.tsx features/playground/playground-viewport.test.tsx`                                                                                                                                                                  | `apps/web`, 2026-09-23 07:32 UTC | PASS, 42 tests / 3 files                                                                     | Existing recovery retained plus region, focus, exit, fallback, motion and link-guard regressions |
| `npx eslint features/playground/playground-board.tsx features/playground/playground-board.test.tsx features/playground/playground-node.tsx features/playground/playground-model.ts features/playground/playground-model.test.ts features/playground/playground-viewport.tsx features/playground/playground-viewport.test.tsx` | `apps/web`, 2026-09-23 07:32 UTC | PASS, exit 0                                                                                 | Owned source/test scope                                                                          |
| `npx tsc --noEmit --pretty false`                                                                                                                                                                                                                                                                                             | `apps/web`, 2026-09-23 07:32 UTC | PASS, exit 0                                                                                 | Combined current tree, including parent integration                                              |
| Scoped Prettier and `git diff --check`                                                                                                                                                                                                                                                                                        | Repository, 2026-09-23           | Checked before handoff                                                                       | Owned files and report                                                                           |

An intermediate implementation exposed two useful regressions: focus had already moved to `body` by unmount, and jsdom caused React to register the prefixed animation event. Exit now records focus ownership before becoming inert, and the test dispatches the standard and jsdom fallback animation events. A temporary native-anchor test warning was removed by safely preventing jsdom navigation after observing whether capture intercepted it; the final run has no such warning.

## Browser feedback correction

The orchestrator reported that real desktop/mobile layout and accessibility passed, but Escape after save failed because Chromium moved focus from the newly disabled Save button to the page body. A scoped document listener now accepts Escape only when focus belongs to the board or body, and ignores already-handled events. The local root handler still stops propagation, so close is not duplicated. `beginExit` records body focus for opener restoration as well. A regression explicitly recreates browser focus loss; all **42 tests** passed after this correction. Scoped source/test ESLint and full TypeScript also passed at 07:32 UTC. The orchestrator owns verification of this correction in the next rebuilt app.

## Remaining risks and next action

The orchestrator must verify the rebuilt app's measured project containment, visible downward/upward animation, reduced motion, underlying project viewport/state preservation, header/navigation usability, keyboard underlay exclusion, desktop/mobile geometry and the real upload round trip. Existing authorization, role persistence, bundle/drop/download and conflict/delete E2E cases must remain green. Component mocks do not establish those outcomes.

Browser history traversal and programmatic router transitions can still unmount an unsaved in-memory board. The scoped link guard and full-page `beforeunload` warning cover the ordinary supported navigation actions; there is no persistent browser draft store. Legacy workspace content is preserved and handled by backend/orchestrator ownership, not reassigned by this UI.

## Ownership at handoff

Initial UI source was released at 07:28:48 UTC. The browser-feedback Escape correction was released at 07:32:32 UTC; only README/report edits followed that final release. No live-service mutations, runtime rebuilds, fixture mutations, commits or deployment were performed by this worker for this task. The orchestrator owns integration, browser acceptance, final documentation checkpoint and the subsequent video work.
