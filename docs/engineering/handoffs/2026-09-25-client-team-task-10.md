# Task 10: Documentation

- Updated: 2026-09-26T00:00:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and checked
- Objective/paths: document client people/requester/reviewer per task-10-brief.md — 6 feature
  READMEs + 6 `docs/architecture/*.md` files (exact list in the brief).

## Changes

- `apps/web/features/{team,settings,briefings,reviews,workspace,projects}/README.md` — People
  dialog, Team section, `client-people.ts`, requester, reviewer, notification routing — brief's text.
- `docs/architecture/{backend,permissions,data-access,sitemap,design-system,acceptance-matrix}.md`
  — new RPC rows, "Client people" section, rule-5 example, 2 route purposes, "Client people and
  attribution" section, dated family-C amendment.

## Decisions and interface changes

- None. Every claim checked against code/migrations first; no brief discrepancy found. Re-wrapped
  2 new prose blocks (projects/reviews) to ~100 cols by hand (prettier's `proseWrap: preserve`
  left one over-length line each).

## Checks actually run

- `npx prettier --write`/`--check` on the 6 feature READMEs — pass, stable.
- `npm run check` from `apps/web` — typecheck/lint/format/vitest: **101 files / 1114 tests pass**.
- Existence check for the 7 brief-cited paths — no output; no new relative links added.

## Risks and next action

- None known. Ready to commit as listed in the brief.
