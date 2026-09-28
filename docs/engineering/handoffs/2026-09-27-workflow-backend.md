# Action-driven workflow backend

- Updated: 2026-09-28T00:12:47-0400 · Agent: Codex workflow backend · Model: Sonnet-equivalent
- Objective and owned paths: project/board workflow migrations, SQL tests, API contract, this report.

## Changes
- `supabase/migrations/202609280004_project_workflow.sql` — separate activity, assignment generations, immutable request snapshots, source attribution, guarded RPCs, RLS, projection, derived action queue.
- `supabase/migrations/202609280005_workflow_guard_fixes.sql` — null-safe latest approval, delivery retry, null handoff action rejection.
- `supabase/migrations/202609280006_workflow_conflict_http_status.sql` — replace custom public-RPC `40001` conflicts with `PT409`; catalog assertion ensures none remain.
- `supabase/migrations/202609280007_workflow_projection_privacy.sql` — hide private receipt helper from clients; only offer release for active assignee.
- `supabase/tests/database/project_workflow.test.sql` — rollback fixture for workflow, permissions, stale guards, handoff, Backlog, reassignment, delivery retry.
- Existing SQL tests updated: `production_briefs`, `action_notifications`, `miro_workspace`, `retire_versions`, `miro_version_links`, `production_integrity`, `access_and_workflows`.
- `docs/engineering/handoffs/2026-09-27-workflow-api-contract.md` — exact RPC arguments, projection, errors and board-decision payload.

## Decisions and interface changes
- Old `send_board_round` / `share_miro_version` authenticated execute revoked; current-request and guarded-publication RPCs replace them.
- `get_project_workflow` hides client publications from designers, hides internal boards from clients and returns agency draft content/revision.
- `PT409` also updates any other installed public RPC with custom `40001` (including legacy production brief save); Supabase documents the PostgREST 14 retry loop at https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b.

## Checks actually run
- `supabase migration up --local` — 004, 005, 006 and 007 applied forward; no reset/down.
- Eight named DB tests — PASS, 350 assertions, including security-definer coverage and client receipt privacy.
- `access_and_workflows.test.sql` — 50/55 PASS; five unchanged canonical-count assertions fail on active SABRE overlay (observed 69 projects, 51 client projects, 36 designer assignments, 3 drafts).
- `supabase db lint --local --schema public,private` — exit 0; new unused `released_revision` warning plus preexisting empty briefing projection warnings.
- `git diff --check` — PASS.

## Risks and next action
- Parent owns HTTP concurrency retest, generated types, canonical baseline and full integration gate; already-looping PostgREST requests need separate termination.
- Do not mutate local DB further while parent prepares authorized SABRE-only cleanup; no client/project rows were deleted here.
- Ownership: listed backend paths released; no active process or DB test remains.
