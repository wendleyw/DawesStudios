# Briefing acceptance date fix and one-primary-budget-button UI

- Updated: 2026-09-23T21:45:28-0400 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: verified
- Objective and owned paths: fix `accept_briefing` studio-local start_date + show one primary budget button at a time. Owned: `supabase/migrations/202609230013_*`, `supabase/tests/database/briefing_acceptance_dates.test.sql`, `apps/web/features/briefings/briefing-detail.tsx`, `briefing-detail.test.tsx`, `README.md`, `docs/architecture/backend.md`.

## Changes
- `supabase/migrations/202609230013_studio_local_acceptance_dates.sql` — `create or replace` `accept_briefing`, same signature; inserts `start_date` as workspace-local date (`workspace_settings.timezone`, default UTC), clamped to `due_date` when already past. Column default and all locks/idempotency/debit/status logic unchanged.
- `supabase/tests/database/briefing_acceptance_dates.test.sql` — new pgTAP file (rolled back), timezone `Etc/GMT+12`, proves local-today start_date, past-due clamp, exactly one project/debit, and idempotent retry.
- `apps/web/features/briefings/briefing-detail.tsx` — `BudgetReview`: "Confirm budget" hidden once `budget_confirmed && !unconfirmedEdit`; "Accept & create project" hidden while `unconfirmedEdit`. No copy/disabled/pending/accessibility change.
- `apps/web/features/briefings/briefing-detail.test.tsx` — new; asserts exactly one button in each of the 3 states.
- `apps/web/features/briefings/README.md`, `docs/architecture/backend.md` — documented both behaviors.

## Decisions and interface changes
- None. `accept_briefing` grants confirmed unchanged via `information_schema.routine_privileges`/`has_function_privilege` (authenticated only, anon still revoked); `prosecdef=t`, `search_path=""` preserved.

## Checks actually run
- `supabase migration up` — applied 202609230013 cleanly.
- `npm run db:test` — new file passes in full; `access_and_workflows.test.sql` fails its known 6 assertions under the SABRE overlay (pre-existing); all other 17 files pass.
- `cd apps/web && npx vitest run features/briefings` — 4 files / 94 tests pass.
- `npm run typecheck`, `npm run lint` — clean.
- `npx prettier --check app features` — clean (after `--write` on the new test file once).
- `npx playwright test tests/e2e/intake-admin.spec.ts --workers=1 --reporter=line` against the already-running dev server on 3003 — 6/6 pass.

## Risks and next action
- None known. Did not commit, per instructions.
- Ownership: all listed paths released, no background process left running by this task.
