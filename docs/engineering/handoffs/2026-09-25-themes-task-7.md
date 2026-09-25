# Task 7: Horizontal zoom pill

- Updated: 2026-09-25T01:39:25-04:00 · Agent: Claude Code · Model: Sonnet
- State: tested
- Objective and owned paths: build the shared horizontal zoom pill (bottom-left, live zoom %) and dock it on the board; paths per brief.

## Changes
- `features/shared/canvas-controls.tsx` — horizontal `Controls` (Zoom Out, live `%`, Zoom In, divider, fit), `.canvas-zoom` class, `fitIcon` default 16px.
- `features/shared/canvas-controls.test.tsx` — new: pill markup, live zoom text, disabled states, custom fit label.
- `app/globals.css` — `.canvas-zoom` pill styling after `.react-flow .react-flow__attribution a`, mapping `--xy-controls-*` to theme tokens.
- `features/board/board.css` — `.board-tool-dock` spans top/bottom, `flex-start`; `.board-zoom-dock{margin-top:auto}` replaces the old card CSS; mobile media query re-adds `align-items:center`.
- `features/board/board-canvas-controls.tsx` — fit icon 13→16px.
- `features/playground/playground.css` — removed `.react-flow__controls` overrides (now shared).
- `tests/e2e/board-views.spec.ts` — added `zoomAtBottomLeft` geometry check + assertion.
- Docs: `features/shared/README.md`, `features/board/README.md` (brief's sentence + one more stale "immediately below toolbar" claim in the Floating-tools paragraph), `docs/architecture/design-system.md` (brief's two sentences + one more stale claim in the geometry table; fixed "honor"→"honors" for the new singular subject).

## Decisions and interface changes
- Beyond the brief's exact doc edits, corrected two more instances of the now-false "zoom sits immediately below the main toolbar" claim in the same two files (board/README.md, design-system.md), per CLAUDE.md's documentation-maintenance rule. No other file touched beyond the brief's list.

## Checks actually run
- RED: `npx vitest run features/shared/canvas-controls.test.tsx` → 2 failed/2 passed (pill null, no `.canvas-zoom-level`), as expected.
- GREEN: same command → 4 passed.
- `npx vitest run features/shared features/board features/playground` → 29 files, 390 passed.
- `npx playwright test tests/e2e/board-views.spec.ts tests/e2e/brand-canvas-final.spec.ts tests/e2e/project-creation-cards.spec.ts tests/e2e/playground.spec.ts --output=../outputs/pw-zoom` → 27 passed.
- `npm run check` (after `npx prettier --write` on touched files) → typecheck/lint/format/tests all pass, 85 files/997 tests.
- Visual check: throwaway script (scratchpad, `require`s `apps/web/node_modules/@playwright/test`), password read from `supabase/.env.local` via `parseEnv`, never logged. Screenshots in `outputs/pw-task7/{project,playground,board}-{dark,light}.png`. Viewed all 6: pill buttons are monochrome in both themes (no white in dark), percentage legible (100%, 90%, 40%), board pill sits bottom-left, clearly separated from the icon rail above it.

## Risks and next action
- None outstanding. Studio's board view restored to List after the check, as instructed.
- Ownership: all listed paths released; no active writer.
