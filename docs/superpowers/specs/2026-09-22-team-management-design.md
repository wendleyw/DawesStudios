# Team management design

- Original design: 2026-09-22.
- Implementation amendment: 2026-09-23, correcting removal authorization and completing navigation.
- Status: implemented; current evidence is recorded in the shared checkpoint and Team verification report.

## Purpose and scope

Give the agency a separate Team surface with invitations, active-project counts, role changes between agency and designer, and removal that preserves authored history. Studio, Clients, Presets and Your account remain under Settings. `/team` is canonical; `/settings/team` redirects for existing links.

Clients are not studio team members. Project assignments remain managed in project details. Person pages, workload drill-down, and reactivation are outside this implementation. The older untracked Studio Team proposal describes a different surface and has not been applied over this one.

## Membership and authorization

`profiles.role` remains the historical role. Two server-controlled fields track removal:

| State | `removed_at` | `removal_completed_at` | Team presentation |
| --- | --- | --- | --- |
| Active | null | null | Role and removal controls; workload for designers |
| Data access revoked | timestamp | null | Account block pending; Finish removal |
| Removal completed | timestamp | timestamp | Hidden from roster; authored history retained |

Authenticated clients cannot write either marker. `private.current_role()` returns no role for a removed profile; role-dependent RLS and RPC authorization therefore reject new access even through a JWT issued before removal. Boolean permission helpers explicitly return false when the role is missing, so a nullable SQL expression cannot bypass a PL/pgSQL guard.

`set_team_member_role`, `remove_team_member`, `assign_designer`, and `accept_invitation` share a transaction advisory lock. Caller permissions are checked after waiting. Role changes refuse null/client roles and removed targets. Removal counts only active agency profiles, refusing the last one's removal or demotion. Removed profiles cannot receive assignments or reactivate through invitations. Removal clears assignments and notifications, marks the profile, and writes one audit event; retries preserve its timestamp and do not duplicate the audit.

`notify_agency` excludes removed accounts; notification policies also require an active role to close the race with notifications already in flight. Client and designer isolation otherwise retains the existing backend model.

## Privileged Auth step and recovery

`POST /api/team-members/[id]/remove` validates the target, same-origin browser request and bearer session, then checks that the caller is an active agency member. It invokes `remove_team_member` through the caller's own database session. Only after that transaction succeeds does a server-only client ban the Auth account. Finally, the server records `removal_completed_at`.

If the Auth ban fails, studio data access has already ended. If the final marker write fails, the account is already blocked. Both responses report a recoverable failure; the pending row remains visible after reload, and Finish removal repeats the same idempotent process. The service key never reaches the browser.

This supersedes the original design's accepted window of continuing agency access until JWT expiry. A still-issued token can retain its cryptographic validity and access its own historical profile, but cannot use the removed role to read studio projects, brand data, internal comments, notifications, or privileged RPCs. Already-issued signed file URLs follow their existing expiration; this change does not revoke bytes already delivered.

## Frontend boundaries

- `features/team/team-data.ts`: agency-gated roster and invitation hooks; role/removal/invitation mutations. The roster includes active and pending members, excluding completed removals.
- `features/team/team-page.tsx`: invitations, workload, role selection, removal confirmation and pending recovery. Self-actions remain hidden; the backend independently protects the final active agency.
- `features/team/team.css`: Team-only rules. Shared settings list/form primitives stay in `app/globals.css`.
- `features/auth/auth-data.ts`: reads removal status with the caller's profile and reports removed access clearly.
- `features/projects/project-data.ts`: assignment options exclude removed designers.
- Media identity and invitation API checks also reject removed profiles.

Workload is the number of assignments to projects whose status is not delivered, fetched in one query for the roster. It is not a lifetime project total or a separate assignment editor.

## Verification contract

- Database: last-active-agency protection after another agency's removal; immediate old-token isolation; no self-reactivation; null-safe guards; notification isolation; idempotent retry; assignment refusal; original role and tenant suites.
- Server route: caller/origin/target rejection; caller-token RPC versus service-token Auth operation; Auth failure and final-marker failure recovery.
- Browser: navigation and legacy redirect; role round-trip with real permissions; complete removal with preserved authored history; blocked fresh login and old-token project access; pending recovery after reload; client/designer refusal; concurrent promotion/removal; desktop and phone accessibility/layout.
- Fixtures: disposable accounts and projects, guarded cleanup, no seeded-account removal or demotion. Keep the baseline at 10 clients and 25 projects after verification.

Implementation migrations are `202609230001_active_team_membership.sql` and `202609230002_removed_member_guards.sql`, extending the original Team RPC migrations. See [Team feature documentation](../../../apps/web/features/team/README.md) and [continuation checkpoint](../../engineering/handoff.md) for current behavior and actual executed checks.
