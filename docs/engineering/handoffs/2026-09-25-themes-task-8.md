# Task 8: Project tool bar at the bottom of the canvas

- Updated: 2026-09-25T02:12:00-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: verified (fix round 1 applied)
- Objective/paths: move details/Conversation/Playground into a bottom tool bar; `apps/web/features/projects/*`
  (`project-tool-bar.tsx*`, `project-header.tsx`, `project-page.tsx`, `projects.css`, `README.md`), `tests/e2e/project-feedback.spec.ts`, `docs/architecture/design-system.md`.
## Changes
- `project-tool-bar.tsx`(new)/`.test.tsx`(new) — group "Project actions": details+conversation, divider, `children`;
  3 RTL tests. `project-header.tsx` drops `panel`/`onPanel`/`quickActions`; `project-page.tsx` mounts the bar.
- `projects.css` — `.project-tool-bar` pill + phone rule; removed dead `.project-header-actions .icon-button/.selected`.
- `project-feedback.spec.ts` — chrome check reads `.project-header-actions`; polls `.project-tool-bar` vs `.canvas-zoom`.
- `README.md`, `design-system.md` — documented the bottom tool bar (brief Step 10).
- **Fix round 1** (open panel covered the bar) — `projects.css`: `.project-workspace:has(> .project-inspector)
  .project-tool-bar` re-centres between the zoom pill and panel; `@container board (max-width: 799px)` hides it
  when too narrow. `project-feedback.spec.ts` asserts clearance; docs corrected the false "width the panel leaves" claim.
## Decisions and interface changes
- `ProjectHeader` loses `panel`/`onPanel`/`quickActions` (brief-specified); only `project-page.tsx` consumed them.
## Checks actually run
- RED/GREEN `npx vitest run features/projects/project-tool-bar.test.tsx` — import failure, then 3/3 passed.
- `npx playwright test tests/e2e/{project-feedback,playground,sabre-demo,workspace-actions}.spec.ts
  --output=../outputs/pw-toolbar` — 22 passed, 1 known SABRE-overlay count failure, not button/layout.
- `npm run check` (both rounds) — typecheck/lint/format/tests pass; 1000/1000 tests.
- **Fix round 1**: `npx vitest run features/projects features/shared/{stylesheet-boundary,theme-colors}.test.ts`
  — 17 files / 286 passed. `npx playwright test project-feedback.spec.ts playground.spec.ts
  --output=../outputs/pw-toolbar-fix` — 15/15 passed. Manual script (1024×700, 1600×1000, Conversation open):
  `elementFromPoint` at the Playground button's centre hit the button's own icon both times (`hitButton: true`,
  bar not hidden); screenshots in `outputs/pw-toolbar-fix/manual-panel-clear-*.png` confirm no overlap.
## Risks and next action
- None outstanding; reviewer's Important defect fixed and verified live at the cited width (1024×700) and 1600×1000.
- Ownership: paths above released; no background process left running.
