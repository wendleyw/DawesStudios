# Task 7: Browser checks for every role

- Updated: 2026-09-25T17:22:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: browser-check every role's Overview/home against the database;
  owned `apps/web/tests/e2e/overview.spec.ts`.

## Changes
- `apps/web/tests/e2e/overview.spec.ts` — new spec, 4 tests, written verbatim from the task brief.

## Decisions and interface changes
- None; no product code touched.

## Checks actually run
- `npx playwright test tests/e2e/overview.spec.ts --output=../outputs/pw-overview` — 4 passed.
  Page vs DB: Active projects client 45=45 (SABRE, 50 projects/5 delivered), Credits 463=463,
  Active projects designer 30=30 (of 35 assigned), Active projects studio-view-of-SABRE 45=45.
  Axe 0 violations; no designer name or internal-comment text (172 notes ≥20 chars) leaked to the
  client Overview; Reviews-tab `.review-card` count matched the "Needs your review" tile; phone +
  dark viewport kept 3 panels with no horizontal scroll.
- `npx playwright test tests/e2e/client-navigation.spec.ts tests/e2e/client-pages-layout.spec.ts
  tests/e2e/console-errors.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/theme.spec.ts
  --output=../outputs/pw-overview-suites` — 15 passed.
- `npm run check` — PASS (typecheck, lint, format:check, vitest 1037/1037).

## Risks and next action
- None; no dashboard number disagreed with the database and no internal data leaked. The 45/30
  figures reflect the confirmed 50-project SABRE overlay, not a regression.
- Ownership: `apps/web/tests/e2e/overview.spec.ts` released; no active writer or process.
