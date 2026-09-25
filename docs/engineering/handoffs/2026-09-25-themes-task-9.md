# Task 9: Playground rises from the bottom

- Updated: 2026-09-25T06:24:19Z · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: reverse the Playground slide so it rises from the bottom (matching its Task 8 button in the project's bottom bar); `playground.css`, `playground.spec.ts`, and the docs describing its slide direction.

## Changes
- `apps/web/features/playground/playground.css` — swapped `playground-layer-enter`/`-exit` keyframes from `translateY(-100%)` to `translateY(100%)`; names, durations, easing, `data-phase` and reduced-motion rule unchanged.
- `apps/web/tests/e2e/playground.spec.ts` — updated the two `toEqual` keyframe expectations to `translateY(100%)`.
- `apps/web/features/playground/README.md`, `apps/web/features/projects/README.md`, `docs/architecture/design-system.md`, `docs/architecture/sitemap.md` — brief's Step 5 wording, applied verbatim.
- Extra consistency edits (found via the brief's grep sweep, not in Step 5): `apps/web/README.md`, `docs/architecture/project-playground-and-video-optimization.md` (two sentences: "Current user direction" and acceptance item 2), `docs/architecture/playground-and-board-widgets.md`, and one more sentence in `sitemap.md` ("...reopens it after the layer slides back down") beyond the brief's single specified replacement.
- Left `apps/web/features/workspace/README.md:37` (notification popover, unrelated) and `project-playground-and-video-optimization.md:17` (explicitly `(historical)`-labeled section) unchanged.

## Decisions and interface changes
- None. Keyframe names unchanged; `use-playground-close-lifecycle.ts` and `playground-board.test.tsx` untouched.

## Checks actually run
- RED: `npx playwright test tests/e2e/playground.spec.ts -g "slides over the entire viewport" --output=../outputs/pw-rise` — failed as predicted, received `["translateY(-100%)", "translateY(0px)"]`.
- GREEN: same command minus `-g` (full file) — 11/11 passed, incl. focus return to the bottom-bar button and reduced-motion duration.
- `npx vitest run features/playground` — 6 files / 91 tests passed.
- `npx prettier --write <5 touched apps/web files>` — all unchanged.
- `npm run check` (typecheck, lint, format:check, test) — PASS: 86 files / 1000 tests passed, zero lint errors.

## Risks and next action
- None outstanding. Next action: none for this task; Task 10 is next in the plan.
- Ownership: all owned paths released; no active writer or process left.
