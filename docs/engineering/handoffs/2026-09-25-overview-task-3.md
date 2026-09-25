# Task 3: Overview model

- Updated: 2026-09-25T19:57:41Z · Agent: Claude Code · Model: Sonnet
- State: tested
- Objective and owned paths: pure overview figures module + tests —
  `apps/web/features/overview/overview-model.ts`,
  `apps/web/features/overview/overview-model.test.ts`

## Changes
- `apps/web/features/overview/overview-model.ts` — new: `ROW_LIMIT`, `deliveredOn`, `relativeAge`,
  `bySoonestDue`, `ClientOverview`/`clientOverview`, `RawDesignerVersion`/`DesignerVersion`/
  `designerVersions`, `DesignerOverview`/`designerOverview`. Copied verbatim from the task brief;
  imports `CreditEntry` from `credit-model`, `inReviewTab`/`publishedVersionStatus`/`ReviewRow`
  from `review-data`, `Project` from `workspace-data`.
- `apps/web/features/overview/overview-model.test.ts` — new, verbatim from the brief.

## Decisions and interface changes
- None. No deviation from the brief's code or test text was needed.

## Checks actually run
- RED: `npx vitest run features/overview/overview-model.test.ts` before the module existed —
  failed with "Failed to resolve import ./overview-model" (module missing), as expected.
- GREEN: same command after adding the module — 9/9 tests passed, including all `relativeAge`
  Intl.RelativeTimeFormat cases ("today" … "last year") with no deviation from expected strings.
- `npx prettier --write` on both files — reformatted, tests re-run and still 9/9 pass.
- `npm run check` (from `apps/web`) — PASS: typecheck, lint, format:check, and full test suite
  (88 files / 1026 tests, including the 9 new ones).

## Risks and next action
- None outstanding. Module is pure (no Supabase, no UI); ready for Tasks 4–6 to consume its
  exported names.
- Ownership: both owned files complete and committed; no active writer.
