# Round comment notification scoping

- Updated: 2026-09-26T23:27:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: restrict `post_comment`'s internal-channel notification to a round's
  own board designer; `supabase/migrations/`, `supabase/tests/database/miro_workspace.test.sql`,
  `docs/architecture/backend.md`.

## Changes
- `supabase/migrations/202609260012_round_comment_notifications.sql` — `create or replace` of
  `public.post_comment`, identical body copied verbatim from `202609210007`, except the internal
  notification insert now restricts recipients to the round's `design_boards.designer_id` (still in
  `project_assignments`) when `p_version_id` is a round; unchanged for no-version/per-deliverable.
- `supabase/tests/database/miro_workspace.test.sql` — new assertions (both designers assigned):
  agency comment on Designer A's round notifies only A; a following project-level agency comment
  notifies both A and B. Counts read as each designer (`notifications_read` is `user_id=auth.uid()`).
- `docs/architecture/backend.md` — one sentence documenting `202609260012` next to the other
  Miro-workspace fix-forward migrations.

## Decisions and interface changes
- None outside `supabase/`; no `apps/web` files touched (another agent owns `project-page.tsx`).

## Checks actually run
- `supabase migration up --local` — applied cleanly, "Local database is up to date" after.
- `supabase test db` — `miro_workspace.test.sql` all green (103/103); overall
  `Failed tests: 2, 4, 9, 18, 32, 54` for `access_and_workflows.test.sql` (the documented baseline)
  plus one pre-existing, unrelated failure: `miro_version_links.test.sql` test 26 ("An unassigned
  designer reads no internal link", have 2 want 0) — confirmed unrelated: that file never calls
  `post_comment`, and the failure reproduced identically before/after re-running with no other
  change, likely SABRE-overlay seed data shifting which designer its `limit 1` picks as "outsider".
- `npm run db:types` skipped — function signature unchanged, no type diff expected.

## Risks and next action
- Pre-existing `miro_version_links.test.sql` test-26 failure is unaddressed (out of scope; not
  caused by this change; not in the task's allowed-baseline list — flag to orchestrator).
- Ownership released; committed as `cc60647` on `main` (not pushed).
