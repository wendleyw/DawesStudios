# Workflow independent review — 2026-09-28

Scope: Uncommitted action-driven workflow migrations 003–007 and changed project consumers; security and codebase-review checklists. Read-only implementation review.

## Confirmed findings (ranked)

1. [High] `supabase/migrations/202609280005_workflow_guard_fixes.sql:19` — `mark_project_delivered` no longer sets `delivered_at`, which the previous function stamped; a newly delivered project falls back to later `updated_at` for dashboard chronology. Restore `delivered_at=now()` in a forward migration and assert it on first delivery and retry.
2. [High] `supabase/migrations/202609200015_designer_brief_and_project_integrity.sql:35` — `revoke_design_assignment` only deletes the project assignment, leaving the board's open work request and assignment generation intact; assigning the same designer again makes that old request actionable without a new agency release. Close affected current requests and advance generation as part of revocation or an equivalent guarded transition.
3. [High] `supabase/migrations/202609280004_project_workflow.sql:549` — backlog/resume notifications select active board designers without checking current project assignment; a revoked designer whose board remains gets the project title despite losing project access. The same unconditional recipient issue exists in board closure notifications at lines 439 and 482. Restrict workflow events to currently authorized recipients.
4. [Medium] `supabase/migrations/202609200001_foundation.sql:259` — agency still has direct REST update grants for project title, description, and dates after `save_project_details_with_activity` adds stale `updated_at`/`workflow_revision` guards. A direct metadata write bypasses those guards and can overwrite a concurrent editor's work. Route metadata edits through the guarded command, retaining only unrelated direct column grants if needed.
5. [Medium] `supabase/migrations/202609270007_retire_versions_schema.sql:233` — posting an agency comment on a historical round after board reassignment notifies the board's current designer, while the generation-aware comment policy hides that round from them. Check round assignment generation before notifying, or route the event only to an authorized recipient.

## Evidence and status

- Reviewed the accepted workflow spec, AGENTS/CLAUDE instructions, reviewer instructions, applicable security/codebase-review checklists, migration SQL, project UI/data paths, and targeted test references.
- `git diff --check`: passed. Static `rg`, `git diff`, and numbered source reads: passed; each finding above was confirmed in code.
- No runtime, SQL mutation, server, or test command was run. Parent-reported web/DB/Chromium results were not independently reproduced here.
- Implementation: untouched. Report: saved here. The parent was notified of all four findings during review.
- Verified boundary: `can_see_version`, link RLS, internal-comment RLS, and comment write trigger deny a new board owner access to old-generation round links/comments even when given their UUIDs.
- Unverified risk: whether other legacy project or team RPCs bypass the new assignment/revision model; a broader endpoint inventory remains for integration audit.
- Next action: orchestrator applies forward SQL fixes, adds focused regression checks for delivery timestamp, revocation/reassignment, recipient isolation, and direct REST metadata writes, then reruns the integrated gate.
