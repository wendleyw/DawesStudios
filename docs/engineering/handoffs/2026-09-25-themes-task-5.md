# Theme browser check (Task 5)

- Updated: 2026-09-25T01:10:52-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective and owned paths: write the theme browser test; owns `apps/web/tests/e2e/theme.spec.ts`.

## Changes
- `apps/web/tests/e2e/theme.spec.ts` — new: saved-theme-before-hydration, system-colour-scheme,
  and dark-canvas-colour tests, per the brief.

## Decisions and interface changes
- Fixed a timing bug in the brief's own test code (see Risks). No product code or other test file
  touched. No interface changes.

## Checks actually run
- `npx playwright test tests/e2e/theme.spec.ts --output=../outputs/pw-theme` — 3/3 passed, x3
  consecutive runs (9/9 total) after the fix.
- `npx playwright test tests/e2e/console-errors.spec.ts tests/e2e/client-navigation.spec.ts
  --output=../outputs/pw-theme-shell` — 8/8 passed; no console errors, no React `<script>` warning.
- `npm run check` — PASS (typecheck, lint, format:check, vitest 991/991).

## Risks and next action
- Brief's test 1 raced deterministically (5/5 debug runs) on `page.unroute(bundle)`: it finalizes
  any bundle request still queued (e.g. behind Chromium's per-origin connection limit) before our
  handler's own `route.continue()` reaches it, throwing "Route is already handled!". Fixed by
  wrapping that call in `.catch(() => {})` (comment in the test explains it) — smallest change,
  status DONE_WITH_CONCERNS per the brief's instruction for a bad timing assumption.
- Next: Task 6 (dots + extends the canvas-colour test).
- Ownership: `apps/web/tests/e2e/theme.spec.ts` released, no active writer.
