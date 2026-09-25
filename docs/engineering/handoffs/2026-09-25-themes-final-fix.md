# Themes and canvas: final fix wave

- Updated: 2026-09-25T09:44:48-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective and owned paths: apply final-fix-brief.md's 7 items; touched `apps/web/features/{projects,playground,workspace,shared}`, `tests/e2e/project-feedback.spec.ts`, `docs/architecture/design-system.md`.

## Items (done / deviation)
1. done — `ProjectToolBar` moved before `<ReactFlow>` in `.project-canvas`; Tab-order test added.
2. done — `.playground-item-status` dark colour → `#a09f98` (4.62:1); 10-case feature-text contrast gate added.
3. done — design-system.md now states the compiled `--lightningcss-*`/`color-scheme` fallback (verified: `/login`'s served CSS has 0 native `light-dark(`, 40+ fallback vars) + CSP sha256-hash note.
4. done — `TOOL_BAR_SPACE=70` reserved in `onFit`; assertion gated to skip the 0.2 zoom floor per controller ruling (Fix round 1 below).
5. done — `themeScript` now also binds a `storage` listener so every page follows another tab, not only pages with `ThemeToggle` mounted.
6. done — stylesheet discovery is now a recursive `cssUnder()` walk of `app/`+`features/`; "finds every stylesheet" test added (19 found; no natural RED — flat scan already found all 19).
7. done — task-2 handoff trimmed 36→24 lines; "steps aside"→"hides" (projects/README.md, design-system.md, projects.css); playground-board.test.tsx title "upward"→"downward"; `textOnDark` light target `#ffffff`→`#f5f6f8`.

## RED/GREEN (items 1, 4, 5)
- 1: RED ("Project details" inactive, not focused) → moved bar → GREEN.
- 4: RED (old code) → `TOOL_BAR_SPACE` → GREEN@1600×1000/1024×700/390×844, RED@320×640/844×390 (0.2 zoom floor) → controller regated the assertion → GREEN, 18/18 (Fix round 1).
- 5: RED (`expected undefined to be 'dark'`) → rewrote `themeScript` → GREEN, 7/7.
## Fix round 1 (controller ruling)
- Replaced the Fit View poll with the DOMMatrix zoom-gated version (skip clearance when zoom ≤ 0.201). Zoom after Fit View: 1600×1000 → 0.926, 1024×700 → 0.499, 390×844 → 0.391 — all > 0.201, clearance stays asserted there.
- `npx playwright test project-feedback theme playground --output=../outputs/pw-final-fix` — 18/18 PASS. `prettier --write` — unchanged. `npm run check` — PASS.

## Checks actually run
- `npx vitest run features/shared features/workspace features/projects features/playground` — 37 files/468 tests PASS.
- `npm run check` (both rounds) — PASS: typecheck/lint/format:check clean, 86 files/1013 tests each time.
## Risks and next action
- None known.
- Ownership: paths released; no active writer/process left.
