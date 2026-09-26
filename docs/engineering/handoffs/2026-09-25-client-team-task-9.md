# Task 9: Two people at one client, in a browser

- Updated: 2026-09-26T04:50:00Z · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Owned paths: `apps/web/tests/e2e/client-team.spec.ts`, `apps/web/tests/e2e/project-fixture.ts`.

## Changes
- `project-fixture.ts` — `createProductionFixture` takes optional `requestedBy`, forwarded as
  `p_requested_by` only when given (brief Step 1, verbatim).
- `client-team.spec.ts` — new spec (brief Step 2, verbatim except one fix below).

## Decisions and interface changes
- Two `expect(await fitsWidth(page)).toBe(true)` became `await expect.poll(() =>
  fitsWidth(page)).toBe(true)`. Root cause (via a temporary debug probe, removed before commit):
  `.workspace`/`.sidebar` correctly collapse under `@media (max-width:900px)` (confirmed in the live
  CSS bundle and `matchMedia`), but animate over `transition: 180ms`; the single-shot read raced it
  every run. A manual repro outside the runner confirmed a settle delay fixes it — test-sync only, no
  assertion/wording/recipient changed, no other consumer.

## Checks actually run
- `playwright test client-team.spec.ts` — 3 consecutive runs, all passed.
- Counts (`auth.users,clients,projects,sabre briefings,sabre memberships`): `13|10|68|59|1`, unchanged
  before and after all 3 runs.
- `playwright test team-management/briefing-modal/production-workflow/overview/console-errors` — 18/18.
- `prettier --write` both files; `npm run check` (typecheck, lint, format, vitest 1114/1114) PASS.

## Risks and next action
- Pre-existing unrelated residue, not touched: `workspace_settings.studio_name` = "Offline probe"
  (default "Dawes Studio"), likely left by another suite/session on this shared stack.
- Next: none; ready for integration. Both owned paths released, no active writer.
