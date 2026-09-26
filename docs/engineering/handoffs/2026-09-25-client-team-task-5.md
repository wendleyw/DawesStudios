# The client's Team section and notification choice

- Updated: 2026-09-25T23:32:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: show a client person their team and notification choice on Your
  account — `client-team-section.tsx` (+test), `settings.css`, `account-settings.tsx`.

## Changes
- `client-team-section.tsx` (new, +test, 5 tests) — `ClientTeamSections`: client-role only; one
  `<section aria-labelledby>` "`<client>` team" per `useClients()` row, `useClientPeople`'s roster
  with a "You" badge, and a `.segmented-control` (My requests / All `<client>` activity).
- `settings.css` — appended `.client-team`, `.client-team-notifications` (+ phone wrap).
- `account-settings.tsx` — `<ClientTeamSections />` between "Your profile" and "Password".

## Decisions and interface changes
- None; verbatim from the brief.

## Checks actually run
- RED (module unresolved) → GREEN: `npx vitest run features/settings/client-team-section.test.tsx`
  — 5/5, still green after `prettier --write` (2 files, whitespace only).
- `npm run check` — 97 files / 1085 tests green; touched-file `eslint` clean; boundary/theme
  guard tests included.
- Real-backend visual check (throwaway script, :3003, `supabase/.env.local` password, never
  printed): `sabre@client.dawes.local` — region/roster/"You"/note confirmed, live toggle to "All
  SABRE activity" and back, `notify_all` restored (read-only `psql`). Every demo client has one
  member, so multi-client rendering (Focus #1) stays unit-test-only.

## Risks and next action
- None known. `git status`: only the 4 owned paths + the pre-existing unrelated deleted
  `login.png`, left alone. Paths released.
