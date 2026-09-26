# Task 9: Two people at one client, in a browser

- Updated: 2026-09-26T05:05:00Z · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Owned paths: `apps/web/tests/e2e/client-team.spec.ts`, `apps/web/tests/e2e/project-fixture.ts`.

## Changes
- `project-fixture.ts` — `createProductionFixture` takes optional `requestedBy` (brief Step 1).
- `client-team.spec.ts` — new spec (brief Step 2), plus both fix-round items below.

## Decisions and interface changes
- `fitsWidth` reads became `expect.poll(...)`: the shell's real `transition:180ms` on resize raced a
  single-shot read (confirmed via a temporary probe, removed); test-sync fix only, verbatim otherwise.
- Fix round 1: added `expect(designers.length).toBeGreaterThan(0)` before the "no designer name
  leaks" loop, so an empty seed fails instead of passing vacuously.
- Fix round 1: `finally` now runs the briefing delete, `cleanupTestProject`, an explicit
  `notify_all: false` restore, and each context close as independent try/catch steps, collecting
  errors and rethrowing only the first once every step has run. `project-fixture.ts` left untouched.

## Checks actually run
- `playwright test client-team.spec.ts` — 5 green runs total (3 round 0 + 2 round 1); counts
  (`auth.users,clients,projects,sabre briefings,sabre memberships`) `13|10|68|59|1` before/after each.
- Round 0 also ran team-management/briefing-modal/production-workflow/overview/console-errors: 18/18.
- `prettier --write`; `npm run check` (typecheck, lint, format, vitest 1114/1114) PASS both rounds.

## Risks and next action
- Pre-existing unrelated residue, not touched: `workspace_settings.studio_name` = "Offline probe"
  (default "Dawes Studio"), likely left by another suite/session on this shared stack.
- Next: none; ready for integration. Both owned paths released, no active writer.
