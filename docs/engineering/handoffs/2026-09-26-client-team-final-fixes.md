# Client team — final-review fix wave

- Updated: 2026-09-26T02:10:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: the brief's eight Minor fixes, test-first, one commit per group.

## Changes
- `client-team.spec.ts` measures the People dialog element itself, not `document.documentElement`.
- `202609260002_briefing_requester_guards.sql`: a requester-only update skips both scope triggers;
  `save_briefing`'s studio branch nulls a departed stored requester before the existing rules.
- `client_team.test.sql` — 21 new assertions (`no_plan()`, nothing to bump).
- `permissions.md`: only a not-last-client removal deletes the membership; the last one
  deactivates and keeps that row for Finish removal.
- `.../remove/route.ts` — "the studio" wording; `app/api/team-members/**` untouched.
- `client-people-dialog.tsx(.test.tsx)` — pending confirmation also reads live pending removals.
- `briefings-page.tsx(.test.tsx)`, `briefings.css` — no requester span/column for designers, via
  `.no-requester` scoped to `min-width:1001px` (clear of the `max-width:1000px` mobile rule).

## Decisions and interface changes
- None outside owned paths; no off-limits file touched; `database.types.ts` untouched.

## Checks actually run
- RED→GREEN recorded for the dialog and briefings-list tests.
- Playwright client-team/briefing-modal/team-management, `--output=../outputs/pw-client-team-fix`: 12/12 pass.
- `supabase test db`: 593 tests, only known 2/4/9/18/32/54 (access_and_workflows) fail; client_team 103/103.
- `npm run check` (apps/web): typecheck, lint, format, vitest 1145/1145 pass.

## Risks and next action
- None open. Ownership released.
