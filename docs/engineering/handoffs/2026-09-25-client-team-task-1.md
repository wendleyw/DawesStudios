# People, requesters and reviewers in the database

- Updated: 2026-09-25T22:33:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: Task 1/11 of the client-team plan — `requested_by`/`reviewed_by`/`notify_all`, `client_team()`, `set_client_notifications`, `set_briefing_requester`, requester-aware `save_briefing`(`_revision`), `reviewed_by` in `review_publication`. Owned: `supabase/migrations/202609250002_client_team.sql`, `supabase/tests/database/client_team.test.sql`, `supabase/database.types.ts`, `supabase/scripts/build_seed.py`, `supabase/seed.sql`, the two typed test literals.

## Changes
- `supabase/tests/database/client_team.test.sql` — new pgTAP fixture, helpers and 52 assertions, per brief verbatim.
- `supabase/migrations/202609250002_client_team.sql` — columns/indexes/backfill, `private.is_active_client_person`, `client_team`, `set_client_notifications`, `save_briefing`/`save_briefing_revision` (dropped+recreated with `p_requested_by`), `set_briefing_requester`, `review_publication` (+`reviewed_by`).
- `supabase/database.types.ts` — regenerated; diff limited to the documented additions.
- `supabase/scripts/build_seed.py` + `supabase/seed.sql` — 3 briefing inserts now set `requested_by=customer`; seed regenerated.
- `apps/web/features/briefings/briefing-model.test.ts`, `apps/web/features/projects/canvas-versions.test.ts` — typed row literals gain `requested_by`/`reviewed_by`.

## Decisions and interface changes
- Live `save_briefing`/`save_briefing_revision`/`review_publication` bodies matched the brief's quoted originals exactly (Step 3); no live-vs-brief divergence.
- First `gen types` run leaked CLI stderr (connect/update-notice/plugin-hint lines) into the file via `2>&1`; redone with stderr to a scratch log — final diff is 41 clean lines.

## Checks actually run
- `supabase test db supabase/tests/database/client_team.test.sql` — RED first (`has_column`/`notify_all` failed, halted on `b.requested_by does not exist`, as expected), then GREEN 52/52 ok.
- `supabase test db` (full) — 511 tests; only `access_and_workflows.test.sql`'s known 2,4,9,18,32,54 fail (overlay counts); `authorization_matrix.test.sql` ok.
- `npm run typecheck` (apps/web) — PASS.
- `npx playwright test tests/e2e/production-workflow.spec.ts tests/e2e/briefing-modal.spec.ts --output=../outputs/pw-client-team-1` — 3/3 passed.
- `npm run check` (apps/web) — PASS: typecheck, lint, format:check, vitest 93 files/1048 tests.
- Backfill read: null/total `requested_by` on `briefings` → `1|80`, matching the brief's stated baseline.

## Risks and next action
- None outstanding; migration, types, seed and tests are consistent and green.
- Ownership: all owned paths released, no active writer. Task 2 appends to this test file's fixtures/helpers as planned.
