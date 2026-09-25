# Themes Task 2: Sidebar theme switch

- Updated: 2026-09-25T00:31:01-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective and owned paths: add a System/Light/Dark switch to the sidebar footer, consuming Task 1's `theme.ts`. Owned (all under `apps/web/features/workspace/`): `theme-toggle.tsx`, `theme-toggle.test.tsx`, `app-shell.tsx` (one import + one line), `README.md` (new section).

## Changes
- `theme-toggle.tsx` — new `ThemeToggle()`, `useSyncExternalStore` over `theme.ts`, cycles System → Light → Dark on click, follows other tabs via `storage`.
- `theme-toggle.test.tsx` — 3 tests: cycle + persistence, initial state from `data-theme`, cross-tab `storage` event.
- `app-shell.tsx` — imports `ThemeToggle`; renders it in `sidebar-footer`, directly before Help & support.
- `README.md` — new "Theme" section after "Visual layout and active navigation", before "Data access".

## Decisions and interface changes
- None. Brief's code used verbatim; no CSS changes (collapsed-rail span hiding already generic).

## Checks actually run
- RED: `npx vitest run features/workspace/theme-toggle.test.tsx` — failed, `Failed to resolve import "./theme-toggle"` — expected, component not yet created.
- GREEN: same command after writing `theme-toggle.tsx` — 1 file / 3 tests passed.
- `npx prettier --write` on the 4 touched files — all reported "unchanged".
- `npm run check` (typecheck, lint, format:check, test) — PASS: 82 files / 949 tests passed, no stray warnings.

## Risks and next action
- None known. Next: Task 3.
- Ownership: paths released; no active writer/process left.
