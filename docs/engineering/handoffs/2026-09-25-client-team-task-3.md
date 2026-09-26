# Client people data and naming rules

- Updated: 2026-09-25T23:03:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: read a client's people and name who asked or decided —
  `apps/web/features/team/client-people.ts` and `team-data.ts` only.

## Changes
- `client-people.ts` (+test) — `ClientPerson`, `ClientPeople`, `personName`, `requesterLabel`,
  `reviewDecisionLabel`, verbatim from the brief.
- `team-data.ts` (+test) — added `clientPeopleQueryKeys`, `useClientPeople`,
  `usePendingClientRemovals`, `useClientNotificationChoices`, `setClientNotifications`,
  `removeClientMember`, verbatim from the brief; test file stubs the new writes.

## Decisions and interface changes
- None. Checked the brief's assumptions against `supabase/database.types.ts` first: `client_team`,
  `set_client_notifications`, `remove_client_member`, `client_memberships.notify_all`,
  `profiles.removed_at`/`removal_completed_at` all match.
- `removeClientMember` posts to the Task-4 route `/api/clients/{clientId}/members/{profileId}/remove`,
  not implemented here.

## Checks actually run
- RED then GREEN: `npx vitest run features/team/client-people.test.ts features/team/team-data.test.ts`
  — failed as expected first (missing module/exports), then 2 files / 14 tests passed.
- `npx prettier --write` on the four touched files, then `npm run check` from `apps/web` — typecheck,
  lint, format:check, vitest (94 files, 1059 tests) all passed.

## Risks and next action
- None known. Next: Task 4 adds the removal route this module's `removeClientMember` targets.
- Ownership: paths released; no active writer or process left running.
