# Theme tokens: Task 3 — dark values, colour gate, contrast check

- Updated: 2026-09-25T00:40:28-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: give every `:root` colour token a `light-dark()` dark value plus a colour gate; owned `apps/web/app/globals.css`, `apps/web/features/shared/theme-colors.test.ts`.

## Changes
- `apps/web/app/globals.css` — every `:root` colour token converted to `light-dark(light, dark)` per the brief's table; added `--on-ink`; `color-scheme: light dark` plus `[data-theme="light"|"dark"]` overrides; replaced remaining literals (`.button.primary`, placeholder/disabled text, `.form-error`, `.topbar`, `.modal-backdrop`, `.modal`); added `img.client-mark` light-plate rule.
- `apps/web/features/shared/theme-colors.test.ts` — new: colour-literal gate + WCAG AA contrast check over 14 token pairs, verbatim from the brief.

## Decisions and interface changes
- None beyond the brief. `--on-ink` is now available for Task 4 (`var(--on-ink)`).

## Checks actually run
- RED `npx vitest run features/shared/theme-colors.test.ts` — 15 failed: gate listed 36 literals (e.g. `--background: #f7f8fa`); every contrast case threw `Expected light-dark(#hex, #hex)` — expected, pre-edit.
- GREEN same command — 15 passed (1 gate + 14 contrast).
- `npx vitest run features/shared/theme-colors.test.ts features/shared/stylesheet-boundary.test.ts` — 40 passed (2 files).
- Step 8: Playwright screenshot of `/login` (not signed in), `emulateMedia({colorScheme:"dark"})` → `outputs/pw-task3/login-dark.png`. Looked correct: dark form card, readable text, `.button.primary` inverts via `--on-ink`; always-dark brand panel unaffected (Task 4's scope).
- `npm run check` — PASS: typecheck, lint, format:check clean; 964/964 tests across 83 files.

## Risks and next action
- Feature stylesheets still carry literal colours — Task 4's scope, not touched here.
- Ownership: both owned paths released; no active writer/process left running.
