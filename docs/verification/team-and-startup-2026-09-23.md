# Team management and startup preservation — integrated verification

Date: 2026-09-23. Owner: Codex orchestrator. State: implemented and verified for this bounded change; overall release acceptance remains open.

## Result

Team management now has a canonical `/team` route, a separate sidebar destination, and a redirect from `/settings/team`. Agency users can change team roles and remove access. Designer/client users cannot manage the team. The last active agency member cannot be demoted or removed, including concurrent requests.

Removal first commits a durable `profiles.removed_at` marker and revokes assignments. Database authorization, the media service, invitations, and notifications exclude removed members even when an already-issued JWT remains valid. Auth banning follows on the server. A second marker, `removal_completed_at`, records successful completion; if Auth or completion persistence fails, the pending row survives reload and offers **Finish removal**. Retries preserve history and do not duplicate removal audit events. Already-issued signed file URLs remain usable until their normal expiry; this change does not claim to revoke those URLs.

Local startup now creates missing fixture files without replacing existing artwork. Warm start and cold restart were tested with a temporary noncanonical internal image, exercising the previously failing condition. All 32 public-table digests and 117 stored-file hashes survived unchanged. The temporary image was restored, and the original snapshot matched afterwards. See [machine-readable startup evidence](../operations/startup-evidence.json) and the [I-1 repair](acceptance-family-i.md#repair-2026-09-23--startup-preserves-existing-artwork).

## Implementation and integration

- Navigation and presentation: `apps/web/app/(workspace)/team/`, the legacy Settings route, `features/workspace/app-shell.tsx`, `features/settings/`, and `features/team/`.
- Authorization: migrations `202609230001_active_team_membership.sql` and `202609230002_removed_member_guards.sql`, both applied locally; regenerated `supabase/database.types.ts`; active-member checks in Auth, invitations, project assignment options, and `apps/media/src/supabase.js`.
- Removal boundary: `apps/web/app/api/team-members/[id]/remove/route.ts`, with origin/bearer validation, ordered RPC/Auth/marker writes, and explicit retryable partial failures.
- Startup: `supabase/scripts/fixture_provisioning.py`, `provision_local_auth.py`, unit coverage, and `supabase/tests/startup_preservation_test.py`.
- Evidence: Team API tests, pgTAP regressions, disposable browser fixtures, updated architecture/feature/runbook documentation, screenshots and this report.

The independent review identified SQL NULL authorization bypasses and notification delivery after removal. The second migration closes those paths and extends regression coverage. Shared advisory locking serializes removal, role changes, assignment and invitation acceptance; authorization is checked after waiting for the lock.

## Checks actually executed

All results below are from this integration session, not inherited from the earlier Claude reports. Browser and HTTP checks used the local Docker stack; no public deployment was performed.

| Check                                                                                                                                                   | Observed result                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Removal pgTAP regression before the fix                                                                                                                 | All 5 initial assertions failed, demonstrating the existing authorization and last-agency defects                                             |
| `npm run check` after implementation                                                                                                                    | Pass: 510 tests in 39 files, type checking and formatting pass; lint has zero errors and two pre-existing warnings                            |
| `npm run build`                                                                                                                                         | Pass                                                                                                                                          |
| `npm run db:test`                                                                                                                                       | Pass: 238 assertions in 13 files                                                                                                              |
| `supabase db lint --local`                                                                                                                              | No schema errors found                                                                                                                        |
| `npm --prefix apps/media test`                                                                                                                          | Pass: 34 tests in 2 files                                                                                                                     |
| `python3 supabase/tests/http_auth_storage_test.py`                                                                                                      | Pass: 9 tests                                                                                                                                 |
| `npm --prefix apps/media run test:integration`                                                                                                          | Pass: 15 tests                                                                                                                                |
| `npm run test:e2e`                                                                                                                                      | Pass: 37 browser tests against rebuilt containers, before the final Team CSS correction described below                                       |
| `npm run test:e2e -- team-management console-errors`                                                                                                    | Pass: 11 tests after the final Team CSS correction, web rebuild and cold Supabase restart                                                     |
| `python3 -m unittest discover -s supabase/tests -p test_fixture_provisioning.py -v`                                                                     | Pass: 12 tests                                                                                                                                |
| `python3 supabase/tests/startup_preservation_test.py exercise /tmp/dawes-startup-original-20260923.json --output docs/operations/startup-evidence.json` | Pass: warm start, stop, cold start and status; database/file preservation and restoration confirmed                                           |
| Final live fixture query                                                                                                                                | 10 clients, 25 projects (SABRE 7; every other workspace 2), 13 Auth users, 117 stored objects; zero temporary Team users, clients or projects |
| Final app-container health                                                                                                                              | Web and media healthy on local ports 3003 and 55430                                                                                           |

The two existing lint warnings are the hook dependencies in `board-canvas-controls.tsx` and unused `ArrowLeft` in `board-nodes.tsx`. No new dependency was added. A new whole-repository dependency/security audit was not performed; the security review here covers Team authorization and its affected consumers.

Documentation checks also passed: 239 local Markdown link targets resolve, `AGENTS.md` and `CLAUDE.md` are identical, and `git diff --check` is clean. Two historical links pointed to absent `.superpowers` reports; the checkpoint now discloses the missing report, and F18 links the surviving video integration handoff. The matrix was counted from its requirement rows: 111 total, 110 Verified, J10 open.

The nine Team browser scenarios cover role changes and resulting permissions, the last-agency guard, route/navigation behavior, desktop/mobile accessibility, denied designer/client access, disposable-member removal with retained comment history, stale-token access refusal, new-login refusal, retry after a pending removal, and concurrent promotion/removal. API tests separately cover Auth and completion-marker failure responses and retries.

## Visual evidence

Manual inspection caught a desktop layout problem even though the first accessibility/browser gate passed: a full-width role selector squeezed member names into single-character lines. The Team stylesheet now constrains the desktop selector and retains full width on mobile. The browser test also checks that the member name fits on one line at desktop width.

Final [1600 px screenshot](screenshots/team-1600.png) and [390 px screenshot](screenshots/team-390.png) were inspected. Both are readable; the automated checks report no horizontal overflow or axe violations on the covered Team view. Other screenshots and design-audit artifacts were regenerated by the full browser suite and preserved. `design-audit.json` changed only its capture timestamp. The studio name **Offline probe** existed before this task and was preserved.

## Accepted worker reports

- [Navigation](../engineering/handoffs/2026-09-23-team-navigation.md)
- [Browser scenarios](../engineering/handoffs/2026-09-23-team-browser-tests.md)
- [Security review](../engineering/handoffs/2026-09-23-team-security-review.md)
- [Startup preservation](../engineering/handoffs/2026-09-23-startup-preservation.md)

All delegated workers completed and released their paths. Codex integrated their changes and owns this final evidence. Existing untracked 2026-09-20 Studio Team proposals were preserved. Changes are uncommitted.

## Remaining work

The acceptance matrix now records **110 Verified requirements of 111**. I01 is closed by the lifecycle evidence; J10 remains open. Passing these suites does not settle the outstanding [video handoff](../engineering/handoffs/2026-09-21-video-designs-and-feedback.md) findings: remount-safe comment retries, upload cancellation and capacity, orphan cleanup, timeline target sizes, the tracked F-5 intermittent, and signed-URL/runtime tradeoffs still need reconciliation against current code and evidence.

The next concrete action is to reproduce and classify those findings, repair confirmed defects, then perform the final functional/visual acceptance audit and release statement. Public hosting, TLS and outbound SMTP remain unconfigured. No production release or completion of the whole application is claimed by this report.
