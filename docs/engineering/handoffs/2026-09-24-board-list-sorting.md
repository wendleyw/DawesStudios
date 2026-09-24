# Board List view — sort by clicking a column title

- Updated: 2026-09-24T11:20:00-03:00 · Agent: implementer / Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: clickable-header + phone-select sorting for the board List view; `apps/web/features/board/{board-page.tsx (List block/sort state only), list-sort.ts, list-sort.test.ts, board-page.test.tsx, board.css, README.md (List text only)}`.

## Changes
- `list-sort.ts` (new) — pure sort: `ListSort`/`nextListSort`/`sortProjects`/`listSortAccessibleName`/`LIST_SORT_OPTIONS` + value↔state helpers. Status order derives from `statusLabels` (single source, not a duplicated enum).
- `list-sort.test.ts` (new) — 14 tests: each key, both directions, ties, missing due dates (both directions), null sort, `nextListSort` transitions, accessible names, option round-trip.
- `board-page.tsx` — `listSort` state in `ClientBoard`, scoped like `quarter`; header cells are now buttons (`aria-label` carries state, e.g. "Due, earliest first"); `ArrowUp`/`ArrowDown` (14px) shown only on the active column; new "Sort by" `<select>` (visually-hidden label) reads/writes the same state; List rows/empty-check use the new `sortedProjects`. Other views/layouts untouched.
- `board.css` — `.board-list-sort-button` (strips button chrome, inherits `.table-head` font); `.board-list-sort-mobile` (hidden by default, shown at `max-width: 640px`).
- `board-page.test.tsx` — fixture now carries `projects`/`campaigns` (default `[]`, no change to existing cases); 5 new tests: Project asc/desc, Due nulls-always-last + column switch resets to asc, sort survives a view switch, survives Clear filters, phone select round-trips with the header.
- `README.md` — one new paragraph on List sort after the opening paragraph's List-only sentence; did not touch the shared List/Timeline/Kanban/Calendar sentences elsewhere (left for the timeline agent).

## Decisions and interface changes
- Task text says the header hides "below 900 px"; `app/globals.css` actually hides `.table-head` at `max-width: 640px` (same breakpoint as the phone List default, confirmed by grep). Did not edit globals.css; matched the select's CSS to the real 640px rule — 900px would show select and header together between 641–900px.
- Tie-break (Campaign/Status/Due) is always ascending by title regardless of the primary column's direction; not specified either way, kept simple and pinned by tests.

## Checks actually run
- `npx vitest run features/board/list-sort.test.ts` — 14 passed; mutation check (flipped `applyDirection`'s sign) failed 4 tests as expected, reverted.
- `npx vitest run features/board` — 181 passed, 13 files.
- `npm run typecheck` — clean. `npx eslint features/board` — clean. `npx prettier --check features/board` — clean (after `--write` on `list-sort.ts`).

## Risks and next action
- No e2e/visual check of the 640px select↔header crossover (out of scope here).
- Next: orchestrator confirms the 900px-vs-640px prose discrepancy needs no separate product decision before the release audit.
- Ownership: paths above released, no active writer.
