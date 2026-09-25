# Task 10 Step 4 — Theming documentation

- Updated: 2026-09-25T06:48:24Z · Agent: Claude Code · Model: Sonnet 5
- State: implemented
- Objective and owned paths: document the light/dark theme system in `docs/architecture/design-system.md` (Task 10, Step 4); owned path: that one file.

## Changes
- `docs/architecture/design-system.md` — added a Dark column to the "Shared tokens" table (values
  from `globals.css`), a new `--on-ink` row, the "Light and dark themes" subsection, and "Both
  themes keep that rule; neither recolours artwork." in "Brand and visual direction".

## Decisions and interface changes
- `color.textOnDark`/`color.textMutedOnDark` map to `--sidebar-text`/`--sidebar-muted` (the exact
  light-side matches in `globals.css`); `--on-ink` owns filled-control text on its own row.
- Non-color rows (radius, text sizes, spacing, `border.default`, `shadow.surface`) get `—` in Dark.

## Checks actually run
- Initial pass: every Dark-column hex re-read against `globals.css`, `theme.ts`, `theme-toggle.tsx`,
  `app/layout.tsx`, `theme-colors.test.ts`; grep for "light-only" claims — none found.
- Fix round 1 (review finding): reworded `color.textOnDark`'s Basis to drop "filled buttons" (wrong
  polarity vs. `--on-ink`, globals.css:23-24) and point to `--on-ink`; split the timeline-bar
  contrast sentence into its real 4.5:1 (text/fill) and 3:1 (edge/lane) thresholds
  (theme-colors.test.ts:183-186); re-checked every other Dark-column row against `globals.css` for
  the same polarity issue — none found.
- No code/test/build check applies; Markdown-only change outside `apps/web`'s `npm run check` scope.

## Risks and next action
- Next action: Task 10 Steps 1-3 and 5-7 remain for the controller.
- Ownership: `docs/architecture/design-system.md` released; no active writer.
