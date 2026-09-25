# Overview dashboards — Task 2: Shared groundwork

- Updated: 2026-09-25T15:50:20-0400 · Agent: Claude Code · Model: Sonnet
- State: tested
- Owned paths: `apps/web/features/{reviews,shared}/`, `app/globals.css`, `workspace/workspace.css`

## Changes

- `reviews/review-data.ts` — `isFinished`/`inReviewTab` moved here verbatim, below `publishedVersionStatus`.
- `reviews/reviews-page.tsx` — imports `inReviewTab` only (page never called `isFinished`); `versionStatusTones` stays.
- `reviews/review-status.test.ts` — imports all three from `./review-data`.
- `reviews/README.md`, `shared/README.md` — document the tab rule's new home and `WelcomeHeader`.
- `shared/welcome-header.tsx` (+ test) — new, verbatim from the brief.
- `globals.css`/`workspace.css` — `.overview-stats` base rules + `<small>` moved to globals.css.

## Decisions and interface changes

- Deviation: the 4 base rules alone left 3 workspace.css responsive declarations selector-identical to globals.css's new ones (`stylesheet-boundary.test.ts` ignores `@media` nesting); moved those 3, unchanged, into globals.css's existing 1000px/640px blocks — no visual change.
- home-page.tsx/overview feature not wired yet — outside this task's file list.

## Checks actually run

- `npx vitest run features/reviews` — PASS 10/10.
- `npx vitest run features/shared/welcome-header.test.tsx` — RED (module missing), then GREEN 4/4.
- `stylesheet-boundary.test.ts` + `theme-colors.test.ts` — PASS 79/79 (after the deviation).
- `npm run check` — PASS, 87 files / 1017 tests.

## Risks and next action

- None open. Ready for the task that wires `WelcomeHeader` into `home-page`/`overview`.
