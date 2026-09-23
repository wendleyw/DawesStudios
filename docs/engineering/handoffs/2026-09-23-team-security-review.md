# Active Team membership security review

- Updated at: 2026-09-23T05:12:50Z
- Reporting agent and tool: continuity_code_map / Codex
- State: verified (bounded source review; both findings fixed in source, runtime verification pending)
- Objective: Independently inspect the uncommitted active-membership removal change for authorization, NULL handling, concurrency, direct grants, reactivation, assignment, and Auth partial-failure risks.
- Owned paths: this report only, `docs/engineering/handoffs/2026-09-23-team-security-review.md`.
- Dependencies: current handoff; prior source map; original Team design; uncommitted `supabase/migrations/202609230001_active_team_membership.sql` and `202609230002_removed_member_guards.sql`; changed Team/Auth/project data and removal API. The orchestrator owns and may continue editing those implementation files.
- Acceptance criteria: identify concrete bypasses within the assigned boundary, report exact source references and minimal fixes, and distinguish source review from executed regression evidence.

## Completed work and changed files

Removal must preserve authored history while revoking active studio authority before the external Auth ban, protecting the last active agency member, and permitting another active agency to finish a partially completed removal.

Reviewed the new migration, related application diffs, existing helper/notification/invitation implementations, and the server-side callers that consume profile roles. Created only this report. No source edits, fixture mutations, service changes, or tests were performed by this worker.

### Finding 1 — nullable roles can bypass existing procedural checks

**Fixed in source after this review.** The new `private.current_role()` intentionally returns NULL for removed members (`202609230001_active_team_membership.sql:13`). Initially, existing `private.is_client_member`, `private.can_produce`, and `private.can_access_client` returned expressions that could evaluate to NULL (`202609200001_foundation.sql:212`, `:218`, `:221`). Unlike RLS, a procedural `IF NOT helper(...) THEN RAISE` does not reject NULL.

A concrete path existed through `accept_invitation`: its previous membership guard used `private.current_role()<>'client'` (`202609200002_workflows.sql:235`). A removed member with no assignments/memberships and a still-valid invitation for the same email could pass that NULL guard, change the preserved role and gain a `client_memberships` row (`:236`). Because `removed_at` remains populated, `is_client_member` became NULL for that membership, and definer routines using `IF NOT (is_agency() OR is_client_member(...))` could bypass the intended refusal. Example affected call sites include `202609200023_draft_conflict_response.sql:4` and `202609220003_request_credits_idempotency.sql:33`.

Rechecked fix: `202609230002_removed_member_guards.sql:3`, `:9`, and `:15` wrap those predicates with `coalesce(...,false)`. Its replacement `accept_invitation` acquires the membership lock, explicitly refuses a NULL current role, and uses `IS DISTINCT FROM 'client'` (`:37`); it never clears `removed_at`. Runtime regression coverage must still verify removed-caller invitation rejection and helper results in the presence of historical membership/assignment rows.

### Finding 2 — removed agency members can receive and read new notifications

**Fixed in source after this review.** Removal deletes current notifications (`202609230001_active_team_membership.sql:73`), but previous `private.notify_agency` selected every profile with role `agency` without checking active membership (`202609200002_workflows.sql:4`). A later client briefing submission calls that function with the briefing title as message body (`:31`). The previous notification read policy checked only `user_id=auth.uid()` (`202609200001_foundation.sql:288`), so an already-issued token belonging to the removed agency could read the newly inserted notification, including new studio activity.

Rechecked fix: `202609230002_removed_member_guards.sql:25` restricts notification generation to active agency profiles, and `:31` requires `private.current_role() IS NOT NULL` in notification read/update policies. The policy also closes the case where notification generation began before removal and commits later. Runtime regression coverage must still remove a member, create a later notification, and verify that the removed token reads zero notifications.

### Boundaries that passed source inspection

- **Last active agency:** role changes and removal count `role='agency' AND removed_at IS NULL`; previously removed/ban-pending members no longer satisfy the invariant (`202609230001_active_team_membership.sql:44`, `:66`).
- **Mutation ordering:** role/removal/assignment share advisory transaction lock `(93721,1)`, acquired before checking the caller (`:35`, `:58`, `:81`). A queued request rechecks authority after another membership mutation commits. No reactivation path is added to those RPCs.
- **Assignment:** the replacement `assign_designer` requires an active designer and participates in the same lock; removal deletes all target assignments within its transaction (`:71`, `:83`). The frontend picker excludes `removed_at` rows (`apps/web/features/projects/project-data.ts:228`).
- **Direct grants:** authenticated profile updates are restricted to `display_name,avatar_url` (`202609200001_foundation.sql:247`). This change grants no write privileges on the two new timestamps or direct insertion privileges on `project_assignments`; ordinary callers cannot clear removal state through a table update.
- **Target and input checks:** role mutations reject NULL roles and inactive targets; removal rejects missing/non-team targets and returns early for an already-removed target. Repeated removal therefore does not change its original timestamp or duplicate the audit (`202609230001_active_team_membership.sql:37`, `:60`).
- **Two-stage API:** removal authenticates the caller, filters their own profile to active agency, and invokes the RPC with the caller token before creating the privileged client. The Auth ban precedes the completion marker (`apps/web/app/api/team-members/[id]/remove/route.ts:36`). A failed external ban leaves database removal intact and recoverable.
- **Recovery UI:** the roster excludes only completed removals, displays pending removals without role controls, offers `Finish removal`, and invalidates the roster after success or failure (`apps/web/features/team/team-data.ts:14`; `team-page.tsx:47`, `:122`). This can recover after a page reload.
- **Project visibility:** the replaced `can_access_project` now requires an active designer role even if a historical assignment remains (`202609230001_active_team_membership.sql:18`).

### Adjacent gates to align

The initial snapshot's `apps/media/src/supabase.js:50` and `apps/web/app/api/invitations/route.ts:35` read a profile role without an active-membership filter. Rechecked the orchestrator's subsequent edits: both now filter `removed_at IS NULL`, keeping their semantics consistent with the removal endpoint.

No complete new-request bypass was found through these gates: media reads the target version/project using the caller's token before privileged work (`apps/media/src/server.js:96`, `:157`, `:202`), and invitation creation invokes the agency-gated RPC before sending mail (`apps/web/app/api/invitations/route.ts:58`). This is an alignment finding, not a claim that the inspected media endpoints permit a removed member to publish. Revoking every already-running operation was not part of this bounded review.

## Decisions and interface changes

- No implementation interfaces changed by this worker.
- Reported both concrete findings to the orchestrator immediately, with suggested minimal migration changes and regression scenarios.
- Used the first-principles-review boundary method. Read the security skill, whose full-repository sweep is a different scope; did not expand this assigned change review into dependency/history scanning.
- Rechecked both corrective source changes and the aligned server gates. No remaining concrete bypass was found within the assigned boundary. This is source evidence, not a claim that the database migrations or runtime regressions passed.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `git diff --stat` and `git status --short` | Current repository, 2026-09-23 approximately 05:08Z | Located current uncommitted integration work and new migration/test files. | Working tree |
| `nl -ba supabase/migrations/202609230001_active_team_membership.sql` | Read-only source inspection | Confirmed active-role helper, common lock, active-agency counts, timestamp and assignment changes. | Migration references above |
| `git diff -- apps/web/features/auth/auth-data.ts apps/web/features/team/team-data.ts apps/web/features/team/team-page.tsx apps/web/features/projects/project-data.ts 'apps/web/app/api/team-members/[id]/remove/route.ts' supabase/database.types.ts` | Read-only current diff | Confirmed route ordering, active picker/session filters and durable retry UI. | Named implementation files |
| `rg -n` searches for role helpers, profile/assignment grants and writes, invitation acceptance, notification generation and role checks; bounded `nl -ba` reads of matched definitions | Read-only source inspection | Found NULL/invitation and post-removal notification paths; inspected their current consumers and grants. | Exact file/line references above |
| Read `supabase/tests/database/team_removal_authorization.test.sql` | Source only | Test covers removed-agency count, project visibility and denied role mutation; this is test presence, not a test pass. | Test file |
| `nl -ba supabase/migrations/202609230002_removed_member_guards.sql` and `git diff -- apps/media/src/supabase.js apps/web/app/api/invitations/route.ts` | Source recheck, 2026-09-23T05:12:50Z | Both findings are corrected in source; adjacent caller gates now filter active membership. | New guard migration and named source diffs |
| Mutation, database, media, browser, concurrency and unit tests | Not run by this worker | Runtime state unverified by this worker; orchestrator owns execution. | No runtime pass claimed |

## Remaining risks and next action

The initial two findings are now closed in source, with no additional concrete bypass found in this bounded review. The orchestrator must cover the listed regressions and verify concurrent role/removal/assignment outcomes and external Auth partial failure. A passing static review cannot establish database deployment state, Auth ban behavior, browser recovery, or full production readiness.

## Ownership at handoff

Report ownership released to the orchestrator. No application ownership was taken. No worker-started service or process remains. All implementation files and existing planning artifacts were preserved.
