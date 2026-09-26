# Task 7: Requested by on the list, the briefing page and the project, and the studio's change

- Updated: 2026-09-26T00:10:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: name every briefing's requester for studio/client, let the studio change it; `apps/web/features/briefings/*`, `project-details.tsx`.

## Changes
- `briefing-data.ts`: `useBriefingRequester(briefingId)` (studio/client only) and
  `setBriefingRequester(database, { briefingId, requestedBy })`.
- `briefings-page.tsx`/`briefings.css`: `.briefing-list-requester` column between campaign and
  service, hidden below 1000px with service/date.
- `briefing-detail.tsx`: "Requested by <name>"/"No requester yet" under the title, studio-only
  Change/Choose button opening new `RequesterDialog` (calls `setBriefingRequester`, invalidates
  `briefingQueryKeys.briefings`).
- `project-details.tsx`: "Requested by" term from `useBriefingRequester` + `useClientPeople`.
- Tests: extended `briefing-data.test.ts`; new `briefings-page.test.tsx`,
  `project-details.test.tsx`; replaced `briefing-detail.test.tsx` — all per the brief verbatim.

## Decisions and interface changes
- None beyond the brief; every quoted "before" text matched current code as-is.

## Checks actually run
- 4 vitest files test-first, each RED then GREEN: data 23/23, list 3/3, detail 7/7, project 4/4.
- `npm run check` (typecheck/lint/format/vitest) — PASS, 100 files / 1107 tests.
- `npx playwright test client-pages-layout.spec.ts intake-admin.spec.ts --output=../outputs/pw-client-team-7` — PASS, 9/9.

## Risks and next action
- None known. Briefings/projects READMEs untouched, matching Task 6's approved precedent.
- Ownership: paths released; no active writer.
