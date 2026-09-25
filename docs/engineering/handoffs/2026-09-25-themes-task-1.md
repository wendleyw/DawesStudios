# Themes Task 1: Theme preference and pre-paint script

- Updated: 2026-09-25T00:23:00-03:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective/paths: theme-preference module + pre-paint script. Owns `theme.ts`, `theme.test.ts`, `app/layout.tsx`.

## Changes

- `theme.ts` — new: `ThemePreference`, `THEME_STORAGE_KEY`, `THEME_CHANGE_EVENT`,
  `parseThemePreference`, `nextThemePreference`, `currentThemePreference`, `applyThemePreference`,
  `saveThemePreference`, `themeScript` — verbatim from the brief.
- `theme.test.ts` — new, 6 tests, verbatim from the brief.
- `app/layout.tsx` — imports `themeScript`; `<html suppressHydrationWarning>`; head `<script
  dangerouslySetInnerHTML>` runs it pre-paint. No CSP change needed.

## Decisions and interface changes

- None beyond the brief. Task 2 can import the named exports in its Interfaces section.

## Checks actually run

- RED then GREEN `npx vitest run features/workspace/theme.test.ts` — failed as expected (`Failed
  to resolve import "./theme"`, module not yet created), then 1 file / 6 tests passed.
- `curl -s http://localhost:3003/login | grep -o 'dawes-theme'` → `dawes-theme` (existing dev
  server, not restarted). `npm run check` — all green: 81 files / 946 tests, 0 lint errors.

## Risks and next action

- None; self-review confirmed names, scope and file boundaries match the brief exactly.
- Ownership: paths above released, no active writer or process left running.
