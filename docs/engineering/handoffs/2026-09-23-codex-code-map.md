# Continuity architecture and Team implementation map

- Updated at: 2026-09-23T05:00:27Z
- Reporting agent and tool: continuity_code_map / Codex
- State: verified (repository inspection only; runtime behavior not re-verified)
- Objective: Map the existing application and identify the actual Team management stopping point at HEAD `c2eaac7`, distinguishing implemented work from the two untracked Studio Team planning artifacts.
- Owned paths: this report only, `docs/engineering/handoffs/2026-09-23-codex-code-map.md`.
- Dependencies: root `AGENTS.md`, `docs/engineering/handoff.md`, handoff report template, `first-principles-review` skill, current source/migrations, tracked Team management plan, preserved untracked Studio Team plan.
- Acceptance criteria: concrete component/data/trust-boundary map; file/line evidence for implemented and absent Team work; exact checks and limits; no product changes or integration/browser mutations.

## Completed work and changed files

Creative Canvas is a real studio collaboration application where agency, clients, and assigned designers move briefings through paid projects, internal production, client publication/review, and delivery while preserving client isolation.

Inspected the architecture seams and current Team implementation. Created this report only. No application, database, existing documentation, environment, or fixture files were changed.

### Verified component and data map

| Boundary | Actual implementation and source |
| --- | --- |
| Application runtime | Next.js App Router in `apps/web`; workspace layout mounts `AppShell` (`apps/web/app/(workspace)/layout.tsx:1`). Shell sends unauthenticated visitors to login (`features/workspace/app-shell.tsx:160`). Package scripts use standard `next dev`, `next build`, and `next start`. |
| Session and local cache | `ApplicationProviders` creates TanStack Query; mutations attempt even while offline (`features/auth/auth-provider.tsx:21`). `SessionProvider` tracks Supabase session, reads the profile, and clears query cache on user change (`auth-provider.tsx:61`). The browser gets the public Supabase client, not the service-role client (`lib/supabase.ts:16`). |
| Persistence and authorization | Feature data modules call Supabase reads/RPCs. PostgreSQL RLS and private permission helpers enforce role/client/assignment boundaries; core helpers are `supabase/migrations/202609200001_foundation.sql:206`, and initial RLS policies begin at line 245. These are actual backend rules; frontend role checks are supplementary. |
| Briefing to project | `submitBriefing` calls `submit_briefing`; confirmation and acceptance use `confirm_briefing_budget` and `accept_briefing` (`features/briefings/briefing-data.ts:171`, `:190`, `:222`). The acceptance transaction locks briefing and credit-account rows, returns the existing project on replay, rejects insufficient funds, creates deliverables/project, and debits credits (`202609200002_workflows.sql:44`). |
| Internal versus client project view | `useProjectDetail` chooses `design_versions`/`designs` for internal work and `published_versions`/`published_designs` for client views (`features/projects/project-data.ts:99`). Separate `internal_comments` and `client_comments` policies exist (`202609200001_foundation.sql:269`). |
| Publication and media | The media client prepares sanitized publication/delivery files through the separate Node media service (`features/projects/media-client.ts:187`, `:205`; `apps/media/src/server.js:58`). Latest `publish_version` is agency-gated, checks trusted prepared assets, and writes a separate client snapshot (`202609200018_review_serialization.sql:24`). |
| Team privileged operation | Browser role changes call an authenticated RPC. Removal calls the Next API, which authenticates caller, checks agency role, executes the data RPC using that caller, then uses server-held service credentials to ban the Auth account (`features/team/team-data.ts:69`; `app/api/team-members/[id]/remove/route.ts:36`). |

Paths beginning `features/`, `lib/`, or `app/` in this table are relative to `apps/web/`.

### Team management: implementation exists, delivery is incomplete

The latest tracked plan is `docs/superpowers/plans/2026-09-22-team-management.md`. Its checkboxes remain unchecked, so implementation status must come from source and history instead of those boxes.

| Plan portion | Source state at `c2eaac7` |
| --- | --- |
| Task 1: RPCs | Implemented: initial `202609220002_team_management.sql`, corrections `202609220004`, `005`, and final definitions in `202609220006_fix_agency_guard_lock_syntax.sql:9` and `:32`. pgTAP file exists at `supabase/tests/database/team_management.test.sql`. |
| Task 2: removal API | Implemented in `apps/web/app/api/team-members/[id]/remove/route.ts:17`. Explicit agency check was added in commit `539f1fd`. Auth ban runs after the data RPC and has a distinct failure response. |
| Task 3: data layer | Implemented in `apps/web/features/team/team-data.ts:9`. Lists agency/designers, separately counts non-delivered assignments, supports invitation revocation, role change and removal; invalidates both roster and invitation queries. |
| Task 4: UI | Implemented in `apps/web/features/team/team-page.tsx:24`: agency restriction, roster/workload, other-member role select and removal confirmation, invitation UI. Previous `features/settings/team-settings.tsx` is absent. Current route directly mounts `TeamPage`; shared styling correction is HEAD `c2eaac7`. |
| Task 5: navigation | **Not complete.** `apps/web/app/(workspace)/team/page.tsx` is absent. Current route is `app/(workspace)/settings/team/page.tsx:1`. Sidebar still links `/settings/team` (`features/workspace/app-shell.tsx:330`) and Settings retains the Team tab (`features/settings/settings-page.tsx:12`, `:36`). Although the rendered page now has its own heading, the route/tab cleanup promised by Task 5 has not landed. |
| Task 6: browser verification | **Absent.** `apps/web/tests/e2e/team-management.spec.ts` does not exist. The plan's full removal, Auth ban, role round-trip and refusal scenarios are not implemented in that named test. No browser suite was run by this worker. |

Current colocated Team unit tests cover the cache key and invitation revoke success/error only (`apps/web/features/team/team-data.test.ts:40`). They do not exercise the workload query, role mutation, removal API, ban failure, or the remaining-agency guard. Existing pgTAP tests do cover several role/RPC refusals, role round-trip and assignment removal; they run inside a transaction and never exercise the Auth Admin ban.

### Studio Team: preserved proposal, not an implemented second feature

Both `docs/superpowers/specs/2026-09-20-studio-team-design.md` and `docs/superpowers/plans/2026-09-20-studio-team.md` were untracked before this worker wrote anything.

That proposal defines a different surface: `/team` for workload with status breakdowns and `/team/[personId]` for projects/recent activity. Administration stays under Settings, whose Team tab would be renamed People (`2026-09-20-studio-team-design.md:16`). The newer tracked management design instead moves administration itself to `/team` and explicitly excludes person drill-down (`2026-09-22-team-management-design.md`, Scope / Out of scope).

Neither `/team` route nor `/team/[personId]` exists. Proposed `team-model.ts` and `person-page.tsx` are absent. The existing `team-page.tsx` name therefore does **not** prove that the Studio Team workload/person proposal was built: it contains the newer management UI. Do not merge the two plans implicitly or execute their file writes in parallel; they claim the same route and feature paths with different product intent.

### Concrete removal gap requiring follow-up

The final `remove_team_member` definition counts agency profiles to protect the last agency member (`supabase/migrations/202609220006_fix_agency_guard_lock_syntax.sql:41`), then deletes assignments/notifications and audits removal. It never changes the target profile role or records an inactive/removed marker (`:48`). The API's later action bans only the Auth account (`apps/web/app/api/team-members/[id]/remove/route.ts:58`).

Consequently, an already-banned agency profile still counts toward the last-agency guard and still appears in the team roster (`apps/web/features/team/team-data.ts:14`). Static failure sequence: start with two agency profiles, remove one, then request removal/demotion of the remaining active agency; the count remains two and the intended sole-active-agency protection does not apply. The UI hides self-actions, but the backend RPC is callable and must enforce its own invariant. This follows from the current statements; this worker did not execute the failure sequence against the shared stack.

The documented 15-minute issued-token limitation is separate from this bug. Likewise, after a failed Auth ban, an agency target's role-based database access has not been revoked at all, even though the current 502 message says access was removed. `private.is_agency` still checks only the profile role (`202609200001_foundation.sql:209`). Preserve historical profile references, but model active membership or another durable removal state explicitly before claiming complete removal and last-active-agency safety.

## Decisions and interface changes

- No interface changes or product edits.
- Treated the recent tracked management spec/commits as evidence of the active implementation, without treating an old untracked plan's approval claim as a fresh user choice.
- Reported the navigation/testing stopping point and the removal/agency-count gap to the orchestrator during the audit.
- Did not infer runtime success, role isolation completeness, visual quality, or production readiness from source presence or past reports.

## Checks actually executed

All commands below ran on the current working tree on 2026-09-23 between approximately 04:54Z and 05:01Z. Every listed command completed successfully; none starts services, modifies data, or runs a product suite.

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `git status --short` | Repository, start and end of inspection | Initial untracked files were exactly the two Studio Team artifacts; no tracked changes existed before report creation. | Source tree and report above |
| `git log -12 --format='%h %ad %s' --date=iso-strict` | Current branch, 2026-09-23 | HEAD `c2eaac7`; Team data/UI commits `be8a551`, `90efe75`; API `08e60ff`, `539f1fd`; RPC repairs `ae177b5`. Latest commit timestamp 2026-09-22T18:02:36-04:00. | Git history |
| `cat`, `nl -ba`, and bounded `sed -n` reads of root docs, manifests, Team plans, source and final migration definitions | Read-only source inspection | Confirmed architecture seams and implementation details cited above. | Cited source locations |
| `rg --files apps/web/tests/e2e` | Repository | Existing E2E suite inventory contains no Team management spec. | `apps/web/tests/e2e/` |
| `rg -n 'function private\.(is_agency\|assert_agency)\|banned_until\|removed_at\|disabled_at\|suspended_at\|is_active\|set_team_member_role\|remove_team_member' supabase/migrations apps/web/tests apps/web/features/auth` (pipes are escaped only for Markdown table rendering) | Source inspection | No active/removed/banned-state check in current Team authorization definitions; final RPC definitions located and read. | Foundation and `202609220006` migrations |
| Python `Path.exists()` over the two proposed routes, Team model/person page, named Team E2E file and old settings Team file | Repository | All six paths absent. | Explicit existence check output |
| Unit, build, database, HTTP, media, browser suites | Not run by this worker | Unknown for this worker's session; orchestrator owns current runtime validation. | Do not reuse historical passes as current evidence |

## Remaining risks and next action

1. Reproduce and fix the active-agency/removal invariant with a focused regression scenario before treating Team removal as complete. Cover failure between database cleanup and Auth ban; verify preserved history and visible removal state.
2. Finish/reconcile tracked Team management Task 5 and Task 6, preserving the current UI work. Existing `/settings/team` links and acceptance references need a deliberate migration decision.
3. Preserve the untracked Studio Team proposal and reconcile its conflicting product placement before implementation; do not overwrite management UI with its older file templates.
4. Orchestrator should attach fresh build/test/runtime evidence and reconcile the shared checkpoint; this report is not release approval.

## Ownership at handoff

Released the owned report to the parent orchestrator. No application paths were acquired for writing. No worker-started services or processes remain. Existing shared services were neither restarted nor stopped.
