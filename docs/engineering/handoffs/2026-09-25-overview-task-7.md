# Task 7: Browser checks for every role

- Updated: 2026-09-25T17:52:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: browser-check every role's dashboard against the database; owned `apps/web/tests/e2e/overview.spec.ts`.

## Changes
- `apps/web/tests/e2e/overview.spec.ts` — 4 tests from the brief; fix round 1 tightened the studio, leak and designer-rows checks per controller rulings (no product code touched).

## Decisions and interface changes
- None.

## Checks actually run
- Initial `npx playwright test tests/e2e/overview.spec.ts --output=../outputs/pw-overview` — 4 passed. Page vs DB: client/designer/studio Active projects 45=45 / 30=30 / 45=45, Credits 463=463 (SABRE: 50 projects/5 delivered, 35 designer-assigned).
- Fix round 1 (same command) — 4 passed. Studio test now polls all 3 tiles (Credits remaining, Active projects, Needs your review) against a second, signed-in-as-client browser context — all 3 matched.
- Fix round 1 leak check: full-body comparison (not a 40-char slice) of every internal comment ≥12 chars, 172 of 175 on SABRE's projects, guarded by `designers.length>0`/`notes.length>0` — none leaked.
- Fix round 1 designer check: every `.overview-row` href's project id matched the designer's own `id,status` query (id-based, not title-based) — all matched.
- `npx playwright test tests/e2e/client-navigation.spec.ts tests/e2e/client-pages-layout.spec.ts tests/e2e/console-errors.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/theme.spec.ts --output=../outputs/pw-overview-suites` — 15 passed (initial round; untouched by fix round 1).
- `npm run check` — PASS both rounds (typecheck, lint, format:check, vitest 1037/1037).

## Risks and next action
- None; no dashboard number ever disagreed with the database and no internal data leaked, in either round.
- Ownership: `apps/web/tests/e2e/overview.spec.ts` released; no active writer or process.
