# Task 8: Approved by and Changes requested by

- Updated: 2026-09-26T00:20:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: name who decided on a published version, and when; `review-data.ts`,
  `reviews-page.tsx`, `project-data.ts`, `project-details.tsx` (+ their tests).

## Changes

- `project-data.ts`: `CanvasVersion.reviewedBy?/reviewedAt?`; `CanvasReviewRow` now also picks
  `reviewed_by`/`reviewed_at`; `toCanvasVersions` carries both, absent on the internal channel.
- `review-data.ts`: `ReviewRow.reviewedBy/reviewedAt` (non-optional, default `null`); embedded
  `publication_reviews` select adds `reviewed_by,reviewed_at`; `toReviewRow` fills both.
- `reviews-page.tsx`: imports `personName`/`reviewDecisionLabel`/`useClientPeople`; each row computes
  a decision line from `reviewedBy`+`reviewedAt`, shown in the note column with the release note
  moved to the tooltip; undecided/older rows keep the note.
- `project-details.tsx`: `decisionLine(version)` helper, same rule, replacing the version history's
  plain date/status line when a decision exists.
- Tests updated/added exactly per brief: `canvas-versions.test.ts` (+2), `project-details.test.tsx`
  (+3, `ProjectDetails version history` describe), new `reviews-page.test.tsx` (+2),
  `overview-model.test.ts` review factory (+2 fields).

## Decisions and interface changes

- None beyond the brief; every quoted "before" text matched current code as-is.
- Feature READMEs (`reviews/`, `projects/`) left untouched, matching Tasks 6–7's approved precedent
  of deferring this plan's doc pass.

## Checks actually run

- RED: `npx vitest run features/projects/canvas-versions.test.ts features/projects/project-details.test.tsx features/reviews/reviews-page.test.tsx`
  — 5 failed (exactly the new cases), 10 passed.
- GREEN: same command + `review-status.test.ts` + `features/overview` — 7 files / 46 tests passed.
- `npx prettier --write` on the 8 touched files, then `npm run check` from `apps/web` — typecheck,
  lint, format:check, vitest all PASS: 101 files / 1114 tests.
- `npx playwright test tests/e2e/project-feedback.spec.ts tests/e2e/overview.spec.ts --output=../outputs/pw-client-team-8`
  — PASS, 8/8.

## Risks and next action

- None known. Next: the other session's work on `project-data.ts`/publish dialog/version bar can
  resume; `CanvasVersion`'s two new fields are optional and additive.
- Ownership: paths released; no active writer. `login.png` deletion left untouched.
