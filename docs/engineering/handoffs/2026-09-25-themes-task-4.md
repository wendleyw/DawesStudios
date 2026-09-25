# Task 4: Dark values for every feature stylesheet

- Updated: 2026-09-25T04:55:22Z · Agent: Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: dark colours for every feature stylesheet; owns `theme-colors.test.ts` + the 10 listed feature stylesheets.

## Changes
- `shared/theme-colors.test.ts` — gate now scans all 19 stylesheets, extended `themeIndependent`, added an 8-bar/9-case contrast block.
- `board/board.css`, `board/timeline.css` — literals to `light-dark()`; all 8 timeline bar variants get dark fill/edge/ink.
- `briefings.css`, `competitors.css`, `credits.css`, `settings.css`, `team.css` — literals to `light-dark()` or `var(--ink)`/`var(--on-ink)` per table.
- `playground.css` — added `--playground-accent`/`--playground-on-accent` to `.playground-board`; every listed rule converted.
- `projects.css` — `.canvas-hint`, `.send-comment` to `var(--ink)`/`var(--on-ink)`.
- `workspace.css` — `.sidebar-backdrop` to `var(--overlay-scrim)`; sidebar gets a dark-only inset `box-shadow` edge.

## Decisions and interface changes
- None beyond the brief. Controller-corrected 19 stylesheets (not 20) confirmed via `find app features -name '*.css'`.

## Checks actually run
- RED `npx vitest run features/shared/theme-colors.test.ts` — 18 failed/24 passed; failures were per-stylesheet literal lists and `Expected light-dark(#hex,#hex)` on all 8 bars, as expected pre-edit.
- GREEN `npx vitest run features/shared/theme-colors.test.ts features/shared/stylesheet-boundary.test.ts` — 67/67 passed (19 gate + 14 contrast + 9 timeline + 25 boundary).
- `npm run check` — PASS (typecheck, lint, format:check, 991/991 tests).
- Step 9: screenshots in `outputs/pw-task4/` via throwaway script (password read from `DEMO_PASSWORD`, never printed/logged/written). SABRE board Timeline view, project canvas and Playground all render dark and clean, **except** a real light patch: the `react-flow__controls` zoom/fit dock is pure white in dark mode on the project canvas (`ProjectCanvasControls` renders undocked, zero CSS) and in Playground (`.playground-canvas .react-flow__controls-button` sets no `background`/`color`). Board's own `.board-zoom-dock` is correctly dark (explicit `var(--surface)`/`var(--muted)`). None of this is in Task 4's brief tables, so it was reported, not fixed.

## Risks and next action
- Route the zoom-dock finding to whichever task owns canvas controls (likely Task 6/7); it's invisible to the literal-colour gate since no hex is hardcoded — the override is simply absent.
- Ownership: all 11 files released; no active writer.
