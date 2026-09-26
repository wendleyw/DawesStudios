# The studio's People dialog and the client removal route

- Updated: 2026-09-25T23:13:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: let the studio see, invite and remove a client's people — the client
  removal route, `client-people-dialog.tsx`, `team.css`, the shared list-row wrap rule,
  `client-settings.tsx`.

## Changes
- `.../remove/route.ts` (+test) — mirrors the team removal route (RPC → Auth ban → completion marker).
- `client-people-dialog.tsx` (+test) — `ClientPeopleDialog`: People (Remove/Finish removal), Invited
  (this client's live pending invitations), Invite person via `InvitePerson`.
- `team.css` (+`.client-people`); `app/globals.css` (`.settings-list-row p` now wraps anywhere).
- `client-settings.tsx` — Clients row's "Invite" button becomes "People", opening the new dialog.

## Decisions and interface changes
- None; verbatim from the brief. `features/team/README.md` left untouched (owned by Task 10).

## Checks actually run
- RED→GREEN vitest for both new test files (9/9, 6/6); both failed first on a missing module.
- Data-access grep on `features/team/*.tsx` + `client-settings.tsx` — no `.from(`/`.rpc(`/`.storage.`.
- `npx prettier --write` + `npm run check` from `apps/web` — all green (96 files / 1074 tests).
- `npx playwright test tests/e2e/team-management.spec.ts --output=../outputs/pw-client-team-4` — 9/9.

## Risks and next action
- None known. Next: Task 5 relies on the list-row wrap-anywhere change made here.
- Ownership: paths released; no active writer or process left running.
