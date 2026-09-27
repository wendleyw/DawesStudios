# Unified Comments browser coverage

- Updated: 2026-09-27T16:29:58-0400 · Agent: Codex implementer · Model: GPT-6
- State: implemented; browser execution pending
- Objective and owned paths: update `apps/web/tests/e2e/*.ts` for one Comments toolbar/panel; this report only.

## Changes
- Seven E2E specs: changed old Conversation toolbar/heading/aside selectors to Comments and Studio/Client comments.
- `project-feedback.spec.ts`: covers one toolbar button, default All activity, This version across V1/V2 and R1, destination labels, message scope labels, project/channel/version drafts, persistence IDs, and client/designer privacy.
- Responsive case checks one Comments button and project-only filter state at desktop and mobile sizes; removed its working screenshot writes.

## Decisions and interface changes
- The review dialog's Feedback field remains unchanged.
- The Comments panel needs to preserve This version selection across V1/V2 switches; the orchestrator agreed to key its outer panel by channel and child thread by target ID.
- Other application, style, and documentation files remain owned by the orchestrator.

## Checks actually run
- `npx prettier --check` on seven E2E specs — pass.
- `npx eslint` on seven E2E specs — pass.
- `npx playwright test tests/e2e/project-feedback.spec.ts --list` — pass, 3 tests found.
- `git diff --check -- apps/web/tests/e2e` — pass.
- `npm run typecheck` — pass after the orchestrator restored `setPanel`.

## Risks and next action
- No browser tests run by delegation rule. Orchestrator should run the E2E scenario against its local stack and reconcile any live UI timing.
- Ownership: all listed E2E paths and this report released; no active writer or process.
