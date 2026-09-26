# Notification routing and client removal in the database

- Updated: 2026-09-25T22:51:22-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: Task 2/11 of the client-team plan — route `private.notify_client` to a project's requester/`notify_all`/conversation participants, add `public.remove_client_member`. Owned: `supabase/migrations/202609250003_client_notification_routing.sql`, `supabase/tests/database/client_team.test.sql`, `supabase/database.types.ts`.

## Changes
- `supabase/tests/database/client_team.test.sql` — appended the brief's 10-case block verbatim before `finish()`/`rollback`; file uses `no_plan()`, so no `plan(n)` count to update.
- `supabase/migrations/202609250003_client_notification_routing.sql` — `create or replace private.notify_client` (requester ∪ `notify_all` ∪ studio-reply conversation authors, fallback to everyone with no live requester or no project) and new `public.remove_client_member(p_client_id, p_profile_id) returns boolean`.
- `supabase/database.types.ts` — regenerated (stdout-only redirect); diff is only the 4-line `remove_client_member` entry.

## Decisions and interface changes
- Live `private.notify_client` and `public.remove_team_member` bodies matched the brief's quoted originals exactly (Step 3); migration written verbatim, no live-vs-brief divergence.
- `notify_client`'s signature and its six callers (`accept_briefing`, `publish_version`, `mark_project_delivered`, `post_comment`, `fulfill_credit_request`, `reject_credit_request`) are untouched — confirmed via grep.

## Checks actually run
- `supabase test db supabase/tests/database/client_team.test.sql` — RED first (case 1 failed, halted on `remove_client_member does not exist`, as expected), then GREEN 91/91 ok.
- `supabase test db` (full) — 550 tests; only `access_and_workflows.test.sql`'s known 2,4,9,18,32,54 fail (overlay counts).
- `npx playwright test tests/e2e/production-workflow.spec.ts tests/e2e/project-feedback.spec.ts --output=../outputs/pw-client-team-2` — 5/5 passed.
- `npm run check` (apps/web) — PASS: typecheck, lint, format:check, vitest 93 files/1048 tests.

## Risks and next action
- None outstanding; migration, types and tests are consistent and green.
- Ownership: all owned paths released, no active writer. Task 3 (the Auth removal route and People dialog) builds on `remove_client_member`'s `true`/`false` return.
