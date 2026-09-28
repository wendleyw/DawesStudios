# Action-driven project workflow frontend

- Updated: 2026-09-28 00:12 EDT · Agent: Codex worker · Model: Sonnet-equivalent
- State: implemented and tested; cross-domain release audit remains with orchestrator.
- Objective: contextual project actions and persisted role workflow in `apps/web/features/projects/`.
- Owned paths: `apps/web/features/projects/**`, new `apps/web/tests/e2e/action-workflow.spec.ts` and `workflow-fixture.ts`, this report.
## Changes
- `project-data.ts` reads the guarded workflow projection and calls revision/idempotency-guarded RPCs; project invalidation includes workflow and production briefs.
- `project-workspace.tsx`, `miro-workspace-bar.tsx` and action components put all advances in one bottom bar, including production release, round submission, studio review, publication, feedback handoff, client review and Files handoff.
- `project-action-handoff.tsx` requires at least one continued board, preserves omitted boards, validates per-board production content and summarizes recipient/closure decisions before confirmation.
- `project-details.tsx` saves metadata and Active/Backlog atomically; board closure/reactivation and production release use captured revisions.
- `project-page.tsx` keeps authorized agency board names available in Shared with client; `project-events.ts` refreshes workflow on realtime events.
- Colocated tests and `README.md` updated; new browser fixture creates and removes a fresh accepted project with two designers.

## Decisions and interface changes
- The API follows `2026-09-27-workflow-api-contract.md`; publication sources include selected round IDs, and old round/share calls have no UI callers.
- Agency board data is read on either channel for handoff names; clients still never query boards.
- Shared invalidation-boundary test needs the two new query keys (orchestrator notified); no files outside owned scope changed.
## Checks actually run
- `npx vitest run features/projects --reporter=dot` — 28 files, 242 tests passed.
- `npx playwright test tests/e2e/action-workflow.spec.ts --project=chromium --reporter=line` — passed; real two-designer release, Backlog/resume, V1/client changes, close-only rejection, A continue/B close, R2/V2, approval and Files delivery.
- `npx eslint features/projects tests/e2e/action-workflow.spec.ts tests/e2e/workflow-fixture.ts` — passed.
- `npx prettier --check features/projects tests/e2e/action-workflow.spec.ts tests/e2e/workflow-fixture.ts` — passed.
- `npm --prefix apps/web run typecheck` — blocked by board-page.test.tsx:507 and workflow-concurrency.spec.ts:26 outside owned scope; no projects/new e2e errors.
- Browser captures at 1600/390 px in ignored `outputs/action-workflow-*.png`; no horizontal overflow, duplicate header advance or hidden modal footer; Enter opened handoff.

## Risks and next action
- Orchestrator integrates cross-domain types/tests, runs final gates/security audit; its API concurrency suite covers stale publication guards.
- External Miro permission/content remains outside browser verification.
- Ownership: all assigned files released; no active process.
