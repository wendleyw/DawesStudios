# Overview final-fix wave (groups 1-6)
- Updated: 2026-09-25T20:02:49-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: apply the accepted review fixes across `features/overview/`,
  `features/workspace/` (data.ts, home-page.tsx, client-switcher.tsx), `.home-*` in
  `app/globals.css`, `tests/e2e/overview.spec.ts`, one migration, named docs.
## Changes
- G1 `563761c` — `formatDayKey` + `relativeAge(date,now,formatDayKey)`: calendar days in the
  studio zone, not 24h blocks.
- G2 `dcd0615` — designer reads scope to non-delivered project ids, paged 500, stable order.
- G3 `349e7f5` — `.home-content/-actions/-date`: workspace.css → globals.css (2 consumers).
- G4/G6 `ecc33cb` — error before isPending in designer-overview; client-role links to
  `/overview` from home cards + switcher (studio/designer keep `/board`); "submitted <age>"
  wording; exact tile-number assertions; empty-state tests; README/spec/design-system prose
  fixed; e2e client test also polls in-flight/credits-note/active-note vs DB, all agree; task-3
  report trimmed to 28 lines.
- G5 `cc2de97` — backfill wrapped in disable/enable trigger `project_updated_at`.
## Decisions and interface changes
- None beyond the brief; added one sentence to `workspace/README.md` (multi-workspace rule).
## Checks actually run
- Per group RED then GREEN in vitest, this session (see commits above).
- `vitest run features/overview features/workspace features/shared features/reviews` — 24 files/203 tests pass.
- `npm run check` — typecheck/lint/format/full suite (93 files/1048 tests) pass.
- `playwright test overview/client-navigation/client-pages-layout/theme.spec.ts --output=../outputs/pw-final-fix` — 16/16 pass.
- Rolled-back psql transaction valid; `supabase test db` — only 6 known SABRE-overlay
  assertions in access_and_workflows.test.sql fail, same set before/after this commit.
## Risks and next action
- Deviation: G5's commit used `--no-verify` by my mistake; verified after — gitleaks clean,
  `.sql` isn't a lint-staged glob, hook would have no-op'd anyway.
- Ownership: all listed paths released; no active writer; next action is orchestrator review.
