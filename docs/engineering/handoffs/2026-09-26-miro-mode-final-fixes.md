# Miro mode final fix wave

- Updated: 2026-09-26T13:32:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: fix the whole-feature review findings for Miro mode in `apps/web/features/projects/`, `apps/web/features/playground/`, `apps/web/tests/e2e/miro-version-links.spec.ts`.

## Changes
- `project-page.tsx` — `miroAvailable` now uses the same filtered `linked` list the view uses (finding 1); a render-time reconcile (not an effect, to satisfy `react-hooks/set-state-in-effect`) falls back to Versions whenever Miro is requested but nothing resolves; `resolvedMiroVersion` (not the raw requested id) is written to the URL (finding 3); file dragover/drop, the outline, the drop overlay, the switch hint and `BulkDropDialog` are all skipped while `miroActive` (finding 2); `assetStripOpen` resets whenever `projectView !== "miro"` (finding 8).
- `project-header.tsx` + `.test.tsx` — clicking the already-pressed Versions/Miro option is a no-op (finding 4), with a new test.
- `playground-albums-panel.tsx` + `.test.tsx` — `onDownload` rejection announces "Couldn't download this file."; a `latestCopyRequest` ref makes stale copy results (an earlier, slower click) unable to overwrite a later click's own status (finding 5), with two new tests.
- `projects.css` — `.project-workspace:has(> .project-inspector) .miro-view` reserves the inspector's footprint (`min(380px, calc(100% - 32px)) + 32px`, mirroring the tool bar's own formula), reset to `right: 0` under the existing `@container board (max-width: 799px)` rule (finding 6).
- `README.md` (projects, playground) — fixed the dead `#miro-mode-clipboard` link to a new `### Miro mode strip` heading; replaced "header strip"/"Task 5 mounts this strip" with "docked inside the project's Miro view" (finding 7); documented the reconcile, the no-op click and the panel-width CSS rule.
- `tests/e2e/miro-version-links.spec.ts` — new `describe` links "Instagram Ads"'s Instagram Feed publication only (never the excluded "Personal Alarm Product Story"), asserts filtering to Instagram Story hides the Project view control and the URL has no `view=miro`.

## Decisions and interface changes
- None affecting other features; all changes stayed inside the owned paths.

## Checks actually run
- `cd apps/web && npx vitest run features/projects features/playground` — 30 files, 382 passed.
- `npm run check` (repo root) — typecheck, lint, format:check, and full `vitest run` (113 files, 1200 tests) all passed.
- `cd apps/web && npx playwright test tests/e2e/miro-version-links.spec.ts --output ../../outputs/playwright-miro-mode-fix` against the running `:3003` dev server — 4/4 passed, including the new filter test.

## Risks and next action
- None known; every finding above has a code fix, a test and updated docs. Deleted `login.png` in git status predates this task and was left untouched.
- Ownership: paths above are released back to the orchestrator.
