# Derived action notifications backend

- Updated: 2026-09-27 EDT · Agent: Codex implementer · Model: GPT-6
- State: implemented; database execution and authorization proof pending orchestrator.
- Objective: authenticated read-only actions derived from current workflow state, without persisted tasks or notification changes.
- Owned paths: `supabase/migrations/202609270018_action_notifications.sql`, `supabase/tests/database/action_notifications.test.sql`, `docs/architecture/action-notifications.md`, this report.

## Changes
- Migration 018 adds `public.action_notifications`, a `security_invoker`/`security_barrier` view with authenticated SELECT only and the nine requested action kinds.
- Narrow `private.can_receive_project_action(project_id)` applies current requester/notify_all/fallback routing without exposing requester identity; active client role and membership are required.
- pgTAP fixture covers role isolation, stable IDs, latest round/publication, stale-state removal, requester routing, reassignment/removal, historical `read_at`, and anonymous denial.
- Architecture note documents fields, eligibility, stale-action behavior, and the existing RPC authorization boundary.

## Decisions and interface changes
- Contract to web/types: `id` text, `kind` text, `client_id` uuid, nullable `project_id` uuid, `entity_id` uuid, nullable `board_id` uuid, `subject` text, `created_at` timestamptz; IDs are `kind:entity_uuid`.
- Root approved the private project-ID-only boolean helper because invoker RLS hides other members needed for the active-requester fallback.
- Delivery requires project status `approved`; preparation requires no board and no client publication; credit subjects include client and amount.
- No existing notification, RPC, table, schedule, or client billing acceptance behavior changed.

## Checks actually run
- Source/schema/RLS and current RPC definitions inspected; latest checked-in migration before this task was 017.
- New SQL/doc files checked for whitespace via `git diff --no-index --check` (no diagnostics; exit 1 indicates new-file difference).
- Required view/grant and pgTAP `finish()`/`rollback` markers confirmed by `rg`.
- No migration, pgTAP, Docker, server, browser, or commit executed by this agent.

## Risks and next action
- Root is applying migration 018 to isolated filesystem staging and running pgTAP; resolve any SQL or fixture failure from that actual output before calling this tested.
- After a passing isolated run, root generates database types and integrates the web consumer; verify exact 10/25 staging counts and role isolation again.
- Ownership released and migration/test writes frozen for integration; no active process.
