# Playground independent review

- Updated at: 2026-09-23T06:22:53Z
- Reporting agent and tool: team_navigation / Codex
- State: initial recovery findings closed at source/unit level; documentation integrated; later project-node integration defect diagnosed and source fix inspected, rebuilt browser retest pending
- Objective: independently inspect Playground retry, concurrent update/delete, upload-modal return and private file boundaries against the active feature specification.
- Owned paths: this report, plus `docs/architecture/backend.md`, `sitemap.md`, `permissions.md` and `design-system.md` for the subsequent bounded documentation integration. Read-only scope: `apps/web/features/playground/`, `apps/web/features/projects/project-action-dialog.tsx`, and migrations `202609230003_playground.sql`, `202609230005_playground_staged_cleanup.sql`, `202609230006_playground_conflict_response.sql`.
- Dependencies: [feature specification](../../architecture/playground-and-board-widgets.md); the orchestrator owns implementation fixes, browser/HTTP/database execution and final acceptance.
- Acceptance criteria: report concrete reproductions and evidence; do not mutate application source, database state or runtime; distinguish inspection from executed checks.

## Completed work and changed files

The initial review wrote only this report. Applied the codebase-review and first-principles-review skills within the assigned scope. The feature's purpose is role-specific brainstorming that remains separate from production and preserves the current production form. The review traced how local drafts, server revisions, file staging and nested dialogs support that purpose. A subsequent assignment applied update-project to the four architecture documents listed below, without changing implementation files.

### Finding 1 — stale removal trapped the recovery flow (P2, corrected during review)

The original `removeItem` catch set `failedAction: "delete"` without setting the conflict flag. A revision conflict therefore disabled editing but did not expose **Discard my edits and load saved item**. Retry and **Discard unsaved changes and close** sent the same stale delete again.

Reproduction: two same-role viewers load revision 1; B saves revision 2; A removes revision 1. The backend correctly returns `PT409`, but A could neither reconcile that error nor abandon it through the dialog's close flow.

The finding was delivered to the orchestrator before source changes. The current `playground-dialog.tsx` classifies `PT409`/`40001` in the removal catch and lets close discard a rejected conflicting removal without another mutation. Two new component tests cover loading revision 2 and closing without a second delete. Both passed in the independent rerun recorded below. This closes the source/unit finding; actual browser execution remains with the orchestrator.

### Finding 2 — automatic refresh preserved a remotely deleted item after conflict recovery (P2, corrected and retested)

At initial review, `reloadSaved()` wrote the confirmed server item into the local draft map with `status: "saved"`. `mergePlaygroundDrafts()` then added that overlay when the remote list lacked the item. Cleanup in the dialog's `refresh()` wrapper only ran when that wrapper was called; the query's independent 60-second polling did not call it.

Reproduction:

1. A edits an item while B saves a newer revision.
2. A encounters the conflict and chooses **Discard my edits and load saved item**. A now has a saved local overlay of the canonical item.
3. B removes the item.
4. A's automatic query refresh receives an empty item list, but the saved local overlay remains visible. A manual **Refresh Playground** or reopening the dialog removes it.

This violated the feature README's claim that successful refetches retire committed overlays. A direct execution of the then-current merge function confirmed an empty remote list plus the revision-2 saved overlay yielded one visible saved item. This execution is historical model evidence, not an end-to-end reproduction.

The UI worker corrected `reloadSaved()` to forget the local draft once the query owns the canonical response. Other committed overlays record the query snapshot timestamp in `savedAfterRead`; the merge retires them after a newer successful query read, including an absent remote row. Dirty/error/deletion drafts remain available for recovery. The independent rerun passed the component reproduction without manual Refresh, the unsaved-edit preservation regression and the model timestamp regression. Finding 2 is closed at source/unit level; real mobile viewport behavior is a separate orchestrator-owned browser concern.

### Documentation integration

Updated only these architecture files, preserving earlier Team changes:

- [backend.md](../../architecture/backend.md): six private buckets and the Playground filename exception; role/client/project isolation; RPC revisions and retryable tombstone/staging cleanup; supported file bounds; polling/signing intervals; private per-user/client widget preferences and RPC entries.
- [sitemap.md](../../architecture/sitemap.md): independent Timeline/Kanban choices in Canvas and List; project navigation rather than an embedded Planning project; client/project Playground entry, persistence and upload-form return.
- [permissions.md](../../architecture/permissions.md): role-separated Playground content, attachment access/cleanup, private widget preference ownership, and signing expiry limits. The production-file row is named explicitly so it does not incorrectly exclude client Playground files.
- [design-system.md](../../architecture/design-system.md): removed the obsolete single collapsible Planning frame and mutually exclusive modes; documented current widget composition, shared selection and project destination, Playground canvas/recovery, and the specialized native-dialog boundary.

Source checks included the feature READMEs, widget registry/render/layout, board/project entry points, data functions and migrations. No project instruction changed, so `AGENTS.md` and `CLAUDE.md` remain untouched. Shared implementation plan, feature specification, verification documents and checkpoint remain owned by the orchestrator.

## Decisions and interface changes

### Later integration diagnosis — project nodes hidden after successful upload

The orchestrator's full browser run failed `upload form survives Playground and still creates the final design` after **Add design** closed the form. The failure screenshot shows the project toolbar and an empty dotted canvas. Read-only inspection used the preserved `trace.zip`, `error-context.md` and `test-failed-1.png` under `/tmp/dawes-playground-failures-20260923-0621/playground-upload-form-sur-4b51e-ll-creates-the-final-design-chromium/` so the orchestrator could rerun without destroying the evidence.

The trace establishes that this attempt did not lose its design:

- The file upload and `POST /rest/v1/rpc/add_design` returned HTTP 200; the RPC returned a design UUID.
- Subsequent `GET /rest/v1/designs` responses returned exactly one row titled **A considered final direction**, attached to the expected version/project. The signed image request and image bytes also returned HTTP 200.
- At snapshot timestamp `119704.577`, the expected **Open A considered final direction** button is in the DOM beneath the version node. Both version and deliverable nodes have inline `visibility: hidden`, with CSS dimensions of `426 × 261` and `426 × 64` respectively. Playwright's role locator excludes that hidden subtree.

The original `ProjectPage` rebuilt controlled nodes on render with dimensions only in `style.width`/`style.height`. In the installed `@xyflow/react` 12.11.6, `NodeWrapper` uses `visibility: hasDimensions ? 'visible' : 'hidden'`; `nodeHasDimensions` reads `measured`, top-level `width`/`height`, or `initialWidth`/`initialHeight`, not CSS style. `adoptUserNodes` resets measurements from the newly supplied user node. A recreated node with no dimension fields therefore becomes hidden pending another measurement. The trace already shows this hidden/visible pattern in project rerenders before Playground opens; it is not evidence that the new Playground viewport code erased project data.

A read-only execution of the installed library reproduced the relevant transition: after simulating an observer measurement, `nodeHasDimensions` was `true`; rebuilding the same controlled node with CSS dimensions only changed it to `false` and `measured: { width: undefined, height: undefined }`; adding explicit top-level geometry kept it `true`.

No shared-store or viewport collision was established. `ProjectActionDialog` and its Playground are siblings outside the project's `ReactFlow`, and no application-level `ReactFlowProvider` wraps them. The library creates independent stores in that arrangement. The project viewport remained `translate(363px, 24px) scale(1)` while Playground separately used `translate(591px, 225.5px) scale(1)`. `CanvasOpeningView` places the project once from its own provider; it does not set node visibility. The default repeated flow identifier does not select a shared store and does not explain this visibility condition.

The orchestrator reproduced the failure in isolation and applied the minimal fix: both deliverable and version nodes now receive `width: frame.width` and `height: frame.height` alongside the same frame-derived CSS. This reviewer inspected those four added properties. No source was edited by this reviewer. Rebuilt upload/project browser regressions remain the orchestrator's next check; the prior unit count does not verify this later integration fix.

No interfaces changed in this review. Findings were sent directly to the orchestrator for integration.

No additional concrete authorization or modal-return defect was identified in the inspected scope:

- Board access combines the authenticated role with current client/project access. Table writes are RPC-only for authenticated callers, and Storage predicates require the same accessible board.
- Upload paths include immutable board/item IDs. Storage provides no overwrite policy. Save/delete use item locks, immutable attachment references and revision checks; tombstone cleanup is retryable. The staged cleanup function limits abandoned uploads to their uploader after 24 hours and relies on the delete predicate's item lock to recheck live attachment status.
- The upload form remains mounted while the sibling Playground dialog opens. Closing Playground changes only its local open state; the input DOM and selected file remain. The dialog restores focus and body scrolling and intercepts its native cancellation event.

These are source-review conclusions, not fresh database, HTTP, browser or visual proofs. No production authorization was weakened, and no unrelated project-upload or video behavior was changed.

## Checks actually executed

| Command or scenario                                                                                     | Environment and time                                                                           | Observed result                                                                    | Evidence                                                                              |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `./node_modules/.bin/vitest run features/playground`                                                    | `apps/web`, initial review on 2026-09-23                                                       | 24 tests / 2 files passed before the orchestrator's stale-removal fix              | Colocated `playground-model.test.ts` and `playground-dialog.test.tsx`; command exit 0 |
| `./node_modules/.bin/vitest run features/playground`                                                    | `apps/web`, 2026-09-23 06:01 UTC                                                               | 26 tests / 2 files passed, including both new stale-removal regressions            | Same colocated suites; command exit 0, 1.11 seconds                                   |
| Read-only Node execution of `mergePlaygroundDrafts([], { id: { item, revision: 2, status: "saved" } })` | `apps/web`, 2026-09-23 06:01 UTC; actual module transpiled in memory with installed TypeScript | Reproduced Finding 2: `{"remoteItems":0,"visibleItems":1,"visibleStatus":"saved"}` | No source or database write; command exit 0                                           |
| Source trace of RPCs, Storage policies, retry data functions, dialog recovery and upload integration    | Working tree, 2026-09-23                                                                       | Findings and boundaries described above                                            | Scoped paths listed at the start of this report                                       |

Additional checks after the UI worker released its fixes:

| Command or scenario                                                                                                                                 | Environment and time                  | Observed result                                                                          | Evidence                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `./node_modules/.bin/vitest run features/playground`                                                                                                | `apps/web`, 2026-09-23 06:09 UTC      | 32 tests / 3 files passed; 1.26 seconds                                                  | Model, dialog and viewport suites; exit 0   |
| Read-only relative-link validator over the four architecture docs and this report                                                                   | Repository root, 2026-09-23 06:09 UTC | All 50 relative file targets exist; new backend heading anchor exists; no empty sections | Python `pathlib`/Markdown-link scan; exit 0 |
| `git diff --check -- docs/architecture/backend.md docs/architecture/sitemap.md docs/architecture/permissions.md docs/architecture/design-system.md` | Repository root, 2026-09-23 06:09 UTC | No whitespace errors                                                                     | Exit 0                                      |

Unit runs emitted Node's existing `DEP0205` deprecation warning. Live browser, database, HTTP, build and application visual-audit checks were not run by this reviewer; the later failure-artifact inspection is recorded separately below. The viewport unit suite alone does not close a mobile viewport issue observed in the browser.

The later integration diagnosis executed only read-only checks: Python `zipfile`/JSON parsing of the preserved network and DOM snapshots (without exposing authorization headers or signed tokens), visual inspection of the failure PNG, source inspection of the project/Playground providers and installed xyflow implementation, and an in-memory Node script invoking `adoptUserNodes`/`nodeHasDimensions` (exit 0; `true → false → true` as described above). It did not open a live browser, mutate fixtures, run database commands or modify runtime state. An initial source read used the repository-relative path from the web directory and failed; the corrected repository-root read then confirmed the orchestrator's explicit dimensions.

## Remaining risks and next action

Both original recovery findings are corrected and independently unit-tested. The later upload integration failure is explained by hidden project nodes despite successful persistence; its explicit-dimension source fix is inspected but still needs the orchestrator's rebuilt browser regression. The orchestrator subsequently reported the mobile geometry/accessibility/save/Escape scenario passing after waiting for **All changes saved**; that is supplied evidence, not a browser run by this reviewer. Final authorization, cleanup, visual and complete-suite evidence remain with the orchestrator. No claim here approves release.

## Ownership at handoff

This report and the four architecture documents are released to the orchestrator. This reviewer has no active application writer, database mutation or background process. All implementation paths remain under orchestrator ownership.

## Orchestrator integration follow-up — 2026-09-23

Codex rebuilt the inspected explicit-dimension fix and executed the upload-return and mobile scenarios: both passed. The subsequent complete browser run passed **49/49**, including real final design creation, retained upload fields/file, mobile geometry/save/Escape and all prior project workflows. Final source checks passed **558 tests / 45 files**, with TypeScript/formatting and no lint errors. This is the orchestrator's execution evidence, separate from the reviewer's earlier read-only work. All three concrete findings in this report are closed for the integrated feature; the [final feature report](../../verification/playground-and-widgets-2026-09-23.md) records visual, backend and cleanup evidence and the separate whole-product release limits.
