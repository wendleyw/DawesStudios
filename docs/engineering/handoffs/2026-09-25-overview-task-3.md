# Task 3: Overview model

- Updated: 2026-09-25T19:57:41Z · Agent: Claude Code · Model: Sonnet
- State: tested
- Objective and owned paths: pure overview figures module + tests — `overview-model.ts`,
  `overview-model.test.ts` (both in `apps/web/features/overview/`).

## Changes
- `overview-model.ts` — new: `ROW_LIMIT`, `deliveredOn`, `relativeAge`, `bySoonestDue`,
  `ClientOverview`/`clientOverview`, `RawDesignerVersion`/`DesignerVersion`/`designerVersions`,
  `DesignerOverview`/`designerOverview`. Copied verbatim from the brief; imports `CreditEntry`
  (`credit-model`), `inReviewTab`/`publishedVersionStatus`/`ReviewRow` (`review-data`), `Project`
  (`workspace-data`).
- `overview-model.test.ts` — new, verbatim from the brief.

## Decisions and interface changes
- None. No deviation from the brief's code or test text was needed.

## Checks actually run
- RED: `npx vitest run features/overview/overview-model.test.ts` before the module existed — failed
  ("Failed to resolve import ./overview-model"), as expected.
- GREEN: same command after adding the module — 9/9 passed, including every `relativeAge` case.
- `npx prettier --write` on both files — reformatted; re-run still 9/9 pass.
- `npm run check` (from `apps/web`) — PASS: typecheck, lint, format:check, full suite (88 files /
  1026 tests, including the 9 new ones).

## Risks and next action
- None outstanding. Module is pure (no Supabase, no UI); ready for Tasks 4–6 to consume its exports.
- Ownership: both owned files complete and committed; no active writer.
