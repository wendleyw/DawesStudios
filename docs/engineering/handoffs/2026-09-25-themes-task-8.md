# Task 8: Project tool bar at the bottom of the canvas

- Updated: 2026-09-25T01:53:15-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: verified
- Objective/paths: move Project details/Conversation/Playground into a bottom tool bar;
  `apps/web/features/projects/{project-tool-bar.tsx*,project-header.tsx,project-page.tsx,projects.css,README.md}`,
  `apps/web/tests/e2e/project-feedback.spec.ts`, `docs/architecture/design-system.md`.
## Changes
- `project-tool-bar.tsx`(new)/`.test.tsx`(new) — group "Project actions": details+conversation, divider, `children`;
  3 RTL tests (button order, open/close toggle, disabled while Playground is open).
- `project-header.tsx` — dropped `panel`/`onPanel`/`quickActions`; actions row now holds only the filter.
- `project-page.tsx` — mounts `<ProjectToolBar>` in `.project-canvas` after the empty-canvas hint.
- `projects.css` — removed `.project-header-actions .icon-button/.selected`; added `.project-tool-bar` + phone rule.
- `project-feedback.spec.ts` — chrome check reads `.project-header-actions` only; added a poll keeping `.project-tool-bar`
  inside `.project-canvas` and clear of `.canvas-zoom`, a Playground-visibility check, and two `toHaveCount(0)` assertions.
- `README.md`, `design-system.md` — documented the bottom tool bar per brief Step 10.
## Decisions and interface changes
- `ProjectHeader` loses `panel`/`onPanel`/`quickActions` (brief-specified); only `project-page.tsx` consumed them.
## Checks actually run
- RED `npx vitest run features/projects/project-tool-bar.test.tsx` — `Failed to resolve import "./project-tool-bar"`.
- GREEN same command — 3/3 passed. `npx vitest run features/projects` — 15 files / 219 tests passed.
- `npx playwright test tests/e2e/{project-feedback,playground,sabre-demo,workspace-actions}.spec.ts
  --output=../outputs/pw-toolbar` — 22 passed, 1 failed: `workspace-actions.spec.ts:14` expects 8
  `.react-flow__node-project`, got 51 — the known SABRE-overlay count mismatch, not a button/layout failure.
- Screenshots `outputs/verification/screenshots/project-floating-header-{1600,1024,844,390,320}.png`: bar sits
  bottom-centre on desktop widths, bottom-right on 390/320 phones, clear of the zoom pill in every shot.
- `npm run check` — typecheck/lint/format/tests all pass; 86 files / 1000 tests.
## Risks and next action
- None outstanding; every brief step implemented and verified as written, no deviations.
- Ownership: paths above released; no background process left running.
