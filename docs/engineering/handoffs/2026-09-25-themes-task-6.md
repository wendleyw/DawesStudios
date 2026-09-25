# Task 6: Dot grid on every canvas

- Updated: 2026-09-25T05:19:28Z · Agent: Claude Code · Model: Claude Sonnet 5
- State: tested
- Objective and owned paths: draw every xyflow canvas as a dot grid instead of lines;
  `canvas-background.tsx`+test, `tests/e2e/theme.spec.ts`, `globals.css`/`playground.css`
  `--canvas-grid`, and the four docs the brief names.

## Changes
- `apps/web/features/shared/canvas-background.tsx` — `Background` now draws `BackgroundVariant.Dots`, `gap={24}`, `size={1.5}` (was `Lines`/`lineWidth={0.75}`).
- `apps/web/features/shared/canvas-background.test.tsx` (new) — asserts the dot props and per-instance pattern IDs.
- `apps/web/tests/e2e/theme.spec.ts` — 3rd test renamed "...and dot grid", asserts `pattern circle` count 1.
- `apps/web/app/globals.css` / `features/playground/playground.css` — `--canvas-grid` → `#c5c9d0`/`#363739` and `#bdbdb2`/`#333438`.
- `shared/`, `board/`, `playground/README.md`, `design-system.md` — "line grid" → "dot grid"; token table gained dark values.
- Fix round 1: `projects/README.md:72`, `workspace/README.md:27` — same wording fix, found outside Step 7's list.

## Decisions and interface changes
- None. `CanvasBackground()` signature unchanged; consumers unaffected.

## Checks actually run
- RED `npx vitest run features/shared/canvas-background.test.tsx` — 1 failed: received `variant: "lines"`, `lineWidth: 0.75` (no `size`).
- RED `npx playwright test tests/e2e/theme.spec.ts -g "dot grid" --output=../outputs/pw-dots` — failed: `pattern circle` count 0.
- GREEN vitest (canvas-background + theme-colors) 44/44 passed; GREEN playwright theme.spec.ts 3/3 passed.
- `npm run check` — PASS, 993/993 tests, 84 files.
- Fix round 1: `grep -rn "line grid\|line-grid" apps/web docs/architecture docs/operations README.md --include='*.md'` (excludes history/verification/ref/superpowers) — 0 hits remain after the two edits above. `npm run check` — PASS, 993/993 tests, 84 files.

## Risks and next action
- None known. Next: Task 7 in the theme-and-canvas series.
- Ownership: all listed paths released; no active writer or background process left running.
