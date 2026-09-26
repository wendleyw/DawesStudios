# Task 8: Approved by and Changes requested by

- Updated: 2026-09-26T00:35:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: name who decided on a published version, and when; `review-data.ts`, `reviews-page.tsx`, `project-data.ts`, `project-details.tsx` (+ tests).

## Changes
- `project-data.ts`/`review-data.ts`: `CanvasVersion`/`ReviewRow` gain `reviewedBy`/`reviewedAt`, carried from `publication_reviews.reviewed_by/reviewed_at`; absent on the internal channel.
- `reviews-page.tsx`/`project-details.tsx`: a decided version's note/history line becomes "Approved by/Changes requested by `<name>` · `<date>`" via `personName`/`reviewDecisionLabel`; Reviews moves its release note to the tooltip; undecided/older rows keep today's wording.
- Tests per brief: `canvas-versions.test.ts` (+2), `project-details.test.tsx` (+3), new `reviews-page.test.tsx` (+2), `overview-model.test.ts` factory (+2 fields).

## Decisions and interface changes
- None beyond the brief; every quoted "before" text matched current code as-is.
- Feature READMEs left untouched, matching Tasks 6–7's approved precedent.

## Checks actually run
- RED: targeted vitest (canvas-versions/project-details/reviews-page) — 5 failed (new cases), 10 passed.
- GREEN: same + `review-status.test.ts` + `features/overview` — 7 files / 46 tests passed.
- `npm run check` (typecheck/lint/format/vitest) after prettier — PASS, 101 files / 1114 tests.
- `npx playwright test project-feedback.spec.ts overview.spec.ts --output=../outputs/pw-client-team-8` — PASS, 8/8.
- Fix round 1: report trimmed to 25 lines.

## Risks and next action
- None known. `CanvasVersion`'s two new fields are optional/additive; the other session's `project-data.ts` work can resume.
- Ownership: paths released; no active writer. `login.png` deletion left untouched.
