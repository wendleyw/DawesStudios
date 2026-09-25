# Task 10 Step 4 — Theming documentation

- Updated: 2026-09-25T06:41:59Z · Agent: Claude Code · Model: Sonnet 5
- State: implemented
- Objective and owned paths: document the light/dark theme system in `docs/architecture/design-system.md` (Task 10, Step 4 only); owned path: that one file.

## Changes
- `docs/architecture/design-system.md` — added a Dark column to the "Shared tokens" table (values
  copied from `apps/web/app/globals.css`), added a new `--on-ink` row (`#fff` / `#131416`), added the
  "Light and dark themes" subsection after the token table's own prose, and appended "Both themes
  keep that rule; neither recolours artwork." to the monochrome-artwork sentence in "Brand and
  visual direction".

## Decisions and interface changes
- `color.textOnDark` / `color.textMutedOnDark` dark values mapped to `--sidebar-text` /
  `--sidebar-muted` (not `--on-ink`, which got its own new row for the filled-button case) — the
  closest exact-match tokens in `globals.css`. Documentation only; no consumers affected.
- Non-color rows (radius, text sizes, spacing, `border.default`, `shadow.surface`) get `—` in the
  Dark column since `globals.css` has no theme-varying value for them.

## Checks actually run
- Manual re-read of every edited section against `globals.css`, `theme.ts`, `theme-toggle.tsx`,
  `app/layout.tsx` and `theme-colors.test.ts` — every Dark-column hex and the `--on-ink` /
  `shadow.overlay` values match the `light-dark()` source exactly.
- `grep -in` for "light-only" style claims on the file before and after editing — none present.
- No code/test/build check applies; Markdown-only change outside `apps/web`'s `npm run check` scope.

## Risks and next action
- The `color.textOnDark` / `color.textMutedOnDark` → sidebar-token mapping is an editorial inference
  (the pre-existing table never named the CSS variable); flag if a later pass finds another intent.
- Next action: Task 10 Steps 1-3 and 5-7 (capture, audit, verification record, handoff update,
  commit) remain for the controller.
- Ownership: `docs/architecture/design-system.md` released; no active writer.
