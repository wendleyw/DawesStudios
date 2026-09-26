# System refactor R1 — stale-clock bug and three duplicated helpers

- Updated: 2026-09-26T02:57:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective/paths: fix the People-dialog stale-clock bug and 3 duplicated helpers from the
  read-only audit; `apps/web/features/{team,credits,overview,board,workspace,playground,projects,
  shared}` per `r1-brief.md`.

## Changes
- `team/team-data.ts` + new `use-now.ts` — `isInvitationPending(invitation, now)`/`useNow` replace
  the dialog's frozen `Date.now()` and the Team page's own clock; both callers share one rule.
- `credits/credit-model.ts` — `formatCredits(count)`, used by both credit chips and the Overview's
  per-project credit line.
- `shared/use-dismiss-on-outside-click.ts` (new) — used by the period picker, board toolbar and
  client switcher; each caller's focus/Escape extras kept as-is.
- `shared/concurrency.ts` (new) — `mapWithConcurrency` moved from `bulk-drop-model.ts`; also used
  by `use-playground-drop.ts`/`playground-albums.ts` (limit 3 unchanged; per-file try/catch kept in
  `copyAlbumFilesToBoard`). READMEs updated: `team`, `credits`, `shared`.
- Decision: `isInvitationPending`/`useNow` live in `features/team/`, not `settings-model.ts` — both
  consumers already import `team-data.ts`; avoids a new cross-feature dependency.

## Checks actually run
- Test-first: new fake-timer dialog test failed (RED) unfixed, passed (GREEN) after the fix.
- `npx vitest run` — 106 files / 1164 tests pass. `npm run check` — pass.
- `npx playwright test tests/e2e/{team-management,client-team,board-views,client-navigation,
  playground,project-credits}.spec.ts --output=../outputs/pw-r1` — 43/43 pass.

## Risks and next action
- None unresolved. `board-period-picker`/`board-toolbar` had no prior direct unit test; covered by
  `board-page.test.tsx` + Playwright. Commits: `5519811`, `e4804f4`, `7d22265`, `d207be2`.
