# Workflow backend hardening handoff

- Owner: workflow backend. State: implemented, migration applied locally, named database tests passed.
- Changed: `supabase/migrations/202609280008_workflow_assignment_hardening.sql`, `supabase/tests/database/workflow_hardening.test.sql`, `supabase/tests/database/project_workflow.test.sql`, `supabase/tests/database/production_integrity.test.sql`, `docs/engineering/handoffs/2026-09-27-workflow-api-contract.md`.
- Delivery now stamps `projects.delivered_at` once; retries preserve the original timestamp and do not duplicate notification.
- Assignment deletion closes current requests, clears current drafts/releases, and advances assignment/board/project revisions. It covers explicit revocation and team removal; reassigning the same designer requires a fresh release.
- Backlog/resume, direct board close, and batch handoff closure notify only currently assigned active designers. Agency comments on historical rounds do not notify a new owner who cannot read that generation.
- Authenticated direct updates to project title, description, due date, and start date are revoked. Guarded metadata/activity RPC remains; direct canvas `board_position` updates remain granted.
- Tests use rollback fixtures and assert reassignment privacy, stale release clearance, notification filtering, metadata grants, and delivery timestamp idempotency.
- `supabase migration up --local`: PASS, migration 008 applied; no migration down, reset, seed, client cleanup, or data deletion performed.
- `supabase test db` for nine named workflow/security files: PASS, 385 assertions. `supabase db lint --local --schema public,private`: exit 0; warnings for unused `handoff_board_work.released_revision` and pre-existing `get_assigned_briefings` parameters. `git diff --check`: PASS.
- Remaining: parent orchestrator owns integration audit, generated types, other feature checks, and the separately prepared SABRE-only local data reduction. Stop database mutations before that reduction.
