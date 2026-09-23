# Team browser acceptance tests

- Updated at: 2026-09-23T05:17:17Z
- Reporting agent and tool: Team navigation worker / Codex
- State: implemented; scoped static checks passed; runtime tests not executed by this worker
- Objective: Implement browser and real API coverage for Team management, removal authorization, and recovery without mutating seeded accounts.
- Owned paths: `apps/web/tests/e2e/team-management.spec.ts`, `apps/web/tests/e2e/team-fixture.ts`, and this report.
- Dependencies: Orchestrator-owned active membership migrations, removal API, Team UI/data, local Supabase, current web server, and existing `test-support.ts` / `project-fixture.ts` helpers.
- Acceptance criteria: Canonical navigation, real role permissions, last-agency refusal, durable removal and authored history, old-token denial, failed Auth-step recovery, non-agency denial, and responsive/accessibility checks are covered with guarded disposable fixtures.

## Completed work and changed files

Created `team-management.spec.ts` with nine scenarios:

1. The only active agency profile refuses role demotion and removal. The test first asserts that the baseline agency is the only active agency and checks that its complete selected state is unchanged afterward.
2. Sidebar navigation opens `/team`, the active link exposes `aria-current`, `/settings/team` redirects, and Settings no longer contains a Team tab.
3. Team renders at 1600 and 390 pixels without document overflow or axe violations; screenshots and accessibility JSON attach to Playwright's per-test output.
4. A temporary designer becomes agency and returns to designer through the UI, with database persistence across reloads and actual profile-read permissions measured using the same existing caller session.
5. UI removal of a temporary assigned designer hides the row durably, removes assignments, records both removal markers, preserves profile and authored internal comment history, blocks existing-token project reads/writes, and prevents a fresh sign-in.
6. Calling only the removal RPC leaves an Auth block pending; the UI shows the pending state across reload and completes it through Finish removal without changing the original removal timestamp.
7. A temporary designer receives API 403 and cannot see Team navigation or data through a direct page visit.
8. A temporary client receives the same restrictions.
9. Concurrent promotion/removal leaves the account removed, prevents a later promotion, denies the old caller agency reads, and blocks new sign-in.

Created `team-fixture.ts` to register resources as they are created and clean them through a Playwright fixture `finally`. Synthetic users have `acceptance-team-<UUID>@dawes.local` addresses. Temporary projects belong to temporary clients rather than seeded workspaces; they use real assignment/comment RPCs during scenarios. No seed credit balances are touched. Cleanup validates exact Auth email ownership, prefixes, UUIDs, and client names; reuses guarded `cleanupTestProject`; deletes audit rows only for the registered temporary user IDs; then deletes the temporary clients and Auth accounts.

## Decisions and interface changes

No production interface changes. Tests consume `removed_at` and `removal_completed_at`, the pending-copy/button contract, `/api/team-members/:id/remove`, and the existing Team role/removal RPCs. The last-agency test sends only expected-to-fail RPC calls against the original agency; no test bans, deletes, or deliberately changes a seed role.

The testing skill was read and its browser boundary respected: runtime verification uses the repository's existing Playwright tooling, owned here by the orchestrator. The project's fixture and static-check conventions were retained. An initial ESLint error interpreting Playwright's callback named `use` as a React hook was corrected by naming it `runWithFixture`; the final scoped lint run passes.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `./node_modules/.bin/eslint tests/e2e/team-fixture.ts tests/e2e/team-management.spec.ts` | Local `apps/web`, 2026-09-23 | Passed, exit 0, no diagnostics on final run | Tool output |
| `./node_modules/.bin/prettier --write tests/e2e/team-management.spec.ts tests/e2e/team-fixture.ts` | Local `apps/web`, 2026-09-23 | Formatted the new spec; fixture unchanged | New files |
| `./node_modules/.bin/prettier --check tests/e2e/team-fixture.ts tests/e2e/team-management.spec.ts` | Local `apps/web`, 2026-09-23 | Passed on final run | Tool output |
| `git diff --check` | Repository root, 2026-09-23 | Passed, exit 0 | Tool output |
| Source review of RPC signatures, Auth trigger, RLS, fixture cleanup, and current UI selectors | Local source, 2026-09-23 | New test contracts match the inspected implementation | New spec/helper and referenced implementation |

## Remaining risks and next action

No browser test, fixture creation, cleanup, screenshot capture, axe analysis, full typecheck, or production build was executed by this worker. These are implemented scenarios, not runtime evidence. The orchestrator should run `npm --prefix apps/web run test:e2e -- team-management` against the current canonical server, inspect resulting screenshots, fix any measured failures, and confirm the deterministic client/project counts and absence of temporary resources after cleanup. The existing Docker database name used for audit cleanup follows the repository's established local fixtures.

## Ownership at handoff

Both new test files and this report are released to the active Codex orchestrator. No worker-owned background process remains active. No commit was created. This report grants no production release approval.
