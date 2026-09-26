# Task 1: Miro mode rules and autoplay

- Updated: 2026-09-26T11:41:00-07:00 · Agent: Claude Haiku 4.5 · Model: Haiku
- State: verified
- Objective: Implement miro-mode.ts with version filtering/picking/labeling rules, URL state management for ProjectView, and autoplay in Miro embed URLs
- Owned paths: `apps/web/features/projects/miro-mode.ts`, `miro-mode.test.ts`, `miro-links.ts`, `miro-links.test.ts`, `miro-board-panel.test.tsx`

## Changes
- Created `miro-mode.ts`: linkedVersions, pickMiroVersion, miroVersionLabel, readProjectView, writeProjectView exports
- Created `miro-mode.test.ts`: 17 tests covering all Miro mode rules
- Modified `miro-links.ts` build function: live-embed paths now include autoplay=true parameter
- Modified `miro-links.test.ts`: updated embed URL expectations with autoplay=true
- Modified `miro-board-panel.test.tsx`: updated embed src expectation to include autoplay=true

## Decisions and interface changes
- None; all interfaces match the task brief exactly
- Later tasks (2, 3, 4, 5) will import linkedVersions, pickMiroVersion, miroVersionLabel, readProjectView, writeProjectView from this module

## Checks actually run
- `npx vitest run miro-mode.test.ts miro-links.test.ts miro-board-panel.test.tsx` — 27 passed (3 files)
- `npm run typecheck` — pass
- `npx eslint` on owned files — pass
- `npx prettier --check` on owned files — pass (auto-formatted miro-mode.ts)

## Risks and next action
- None; all tests pass, no blocked dependencies
- Ready for commit with included report
- Ownership: all owned paths released after commit
