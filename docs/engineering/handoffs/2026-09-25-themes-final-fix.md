# Themes and canvas: final fix wave

- Updated: 2026-09-25T09:44:48-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective and owned paths: apply final-fix-brief.md's 7 items; touched `apps/web/features/{projects,playground,workspace,shared}`, `tests/e2e/project-feedback.spec.ts`, `docs/architecture/design-system.md`.

## Items (done / deviation)
1. done — `ProjectToolBar` moved before `<ReactFlow>` in `.project-canvas`; Tab-order test added.
2. done — `.playground-item-status` dark colour → `#a09f98` (4.62:1); 10-case feature-text contrast gate added.
3. done — design-system.md now states the compiled `--lightningcss-*`/`color-scheme` fallback (verified: `/login`'s served CSS has 0 native `light-dark(`, 40+ fallback vars) + CSP sha256-hash note.
4. deviation — `TOOL_BAR_SPACE=70` reserved in `onFit`; new poll passes 3/5 widths, genuinely fails at 320×640 & 844×390 (pre-existing `minZoom:0.2` floor can't shrink enough once the wrapped header alone takes 192–363px of a ≤640px pane). Not weakened — see Risks.
5. done — `themeScript` now also binds a `storage` listener so every page follows another tab, not only pages with `ThemeToggle` mounted.
6. done — stylesheet discovery is now a recursive `cssUnder()` walk of `app/`+`features/`; "finds every stylesheet" test added (19 found; no natural RED — flat scan already found all 19).
7. done — task-2 handoff trimmed 36→24 lines; "steps aside"→"hides" (projects/README.md, design-system.md, projects.css); playground-board.test.tsx title "upward"→"downward"; `textOnDark` light target `#ffffff`→`#f5f6f8`.

## RED/GREEN (items 1, 4, 5)
- 1: RED ("Project details" inactive, not focused) → moved bar → GREEN.
- 4: RED (old code, all widths) → `TOOL_BAR_SPACE` → GREEN@1600×1000/1024×700/390×844, still RED@320×640/844×390 (real).
- 5: RED (`expected undefined to be 'dark'`) → rewrote `themeScript` → GREEN, 7/7.

## Checks actually run
- `npx vitest run features/shared features/workspace features/projects features/playground` — 37 files/468 tests PASS.
- `npx playwright test project-feedback theme playground --output=../outputs/pw-final-fix` — 17/18 PASS (1 fail = item 4's residual).
- `npm run check` — PASS: typecheck/lint/format:check clean, 86 files/1013 tests.

## Risks and next action
- Item 4: Fit View can still tuck the last row under the bar on panes ≤640px tall; the brief's fixed-constant fix can't close that under the existing 0.2 zoom floor. Next: orchestrator decides accept-as-is vs. follow-up (lower floor or a more compact header at that size).
- Ownership: paths released; no active writer/process left.
