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
- `apps/web/app/globals.css` — `--canvas-grid` light side `#dcdfe4` → `#c5c9d0` (dark unchanged).
- `apps/web/features/playground/playground.css` — `--canvas-grid` → `light-dark(#bdbdb2, #333438)`.
- `shared/README.md`, `board/README.md`, `playground/README.md`, `docs/architecture/design-system.md` — "line grid" → "dot grid" wording; token table rows gained dark values.

## Decisions and interface changes
- None. `CanvasBackground()` signature unchanged; consumers unaffected.

## Checks actually run
- RED `npx vitest run features/shared/canvas-background.test.tsx` — 1 failed as expected: received `variant: "lines"`, `lineWidth: 0.75` (no `size`).
- RED `npx playwright test tests/e2e/theme.spec.ts -g "dot grid" --output=../outputs/pw-dots` — failed as expected: `pattern circle` count 0 (pattern was a path).
- GREEN `npx vitest run features/shared/canvas-background.test.tsx features/shared/theme-colors.test.ts` — 44/44 passed.
- GREEN `npx playwright test tests/e2e/theme.spec.ts --output=../outputs/pw-dots` — 3/3 passed.
- `npm run check` (typecheck, lint, format:check, vitest) — PASS, 993/993 tests, 84 files.

## Risks and next action
- None known. Next: Task 7 in the theme-and-canvas series.
- Ownership: all listed paths released; no active writer or background process left running.
