# Settings action E2E coverage

- Updated: 2026-09-27T15:24:34-04:00 · Agent: Codex implementer · Model: Sonnet-equivalent
- State: tested; focused browser and static checks passed
- Objective: cover account actions for all three roles, plus client-logo and campaign settings actions.
- Owned paths: `apps/web/tests/e2e/settings-actions.spec.ts`; this report.

## Changes
- `apps/web/tests/e2e/settings-actions.spec.ts` — five Playwright cases using disposable Acceptance clients/users and Team members, with guarded fixture cleanup.
- Shared account flow covers client, agency and designer: save display name, reload, change password, sign out, reject old password and sign in with the new one.
- Login URL assertions accept the protected-route guard's optional `returnTo` query string; rejected credentials are scoped to the form alert, and successful login returns to Account.
- Logo case uploads the existing 96×96 PNG fixture, checks the stored path and decoded image after reload, denies client mutation, removes the logo and checks the cleared row and file.
- Campaign case creates and edits through the agency dialog, checks dates and goal after reload, denies a different client's mutation, and verifies client UI refusal for studio settings.

## Decisions and interface changes
- No product interfaces changed.
- Campaign Settings exposes create and edit, but no delete action. A delete or nonempty guard browser case is not implementable against this UI.
- The existing campaign RLS intentionally permits a client member to edit campaigns in their own workspace; denial checks only a different client's campaign.

## Checks actually run
- `npm run typecheck` — passed after all-role changes.
- `npx eslint tests/e2e/settings-actions.spec.ts` — passed after formatting.
- `npx prettier --check tests/e2e/settings-actions.spec.ts` — passed after formatting.
- `npx playwright test tests/e2e/settings-actions.spec.ts --output=.../settings-all-roles-results --reporter=list` — 5/5 passed; log: `outputs/extension-audit-2026-09-27/settings-all-roles.log`.

## Risks and next action
- Root should integrate these tests with the wider action audit; campaign deletion remains absent from the UI.
- Fixture cleanup used the existing Intake and Team helpers through the focused E2E run; no manual container operation was performed.
- Ownership: both paths released; no worker process remains.
