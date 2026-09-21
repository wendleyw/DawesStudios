# Task 7 — board feature migration

- Updated at: 2026-09-20T22:47:34Z
- Reporting agent and tool: Claude Opus 5 (1M context) / Claude Code
- State: tested (local `npm run check` green); not verified in the running dev server or via e2e
- Objective: migrate `apps/web/features/board/` onto the data-access contract (`docs/architecture/data-access.md`), the shared UI primitives (`apps/web/features/shared/`), and the CSS boundary (`docs/architecture/design-system.md`), following the `apps/web/features/credits/` exemplar, without changing rendered markup, class names, accessibility attributes, query filters, column selection, ordering, or error handling
- Owned paths: `apps/web/features/board/**`; `apps/web/app/globals.css` (one rule relocated only); this report; `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-7-report.md`
- Dependencies: Task 5's board CSS split (`board.css`, 735→741 lines), the credits exemplar, `apps/web/features/shared/README.md`'s primitive contracts

## Completed work and changed files

- **New** `apps/web/features/board/board-data.ts`: all Supabase access for the feature — `useBoardCampaigns(clientId)` and `useProjectArtwork(projectIds)` read hooks, `moveProjectPosition(database, input)` write function. Every query/filter/column list/ordering was moved verbatim from its previous inline call site.
- **New** `apps/web/features/board/board-data.test.ts`: unit tests for the feature's one write function (`moveProjectPosition`) — exact table, exact `update` payload, exact `.eq`/`.select` args, and a database-error-surfacing test.
- **New** `apps/web/features/board/board-canvas-controls.tsx`: `BoardCanvasControls` (xyflow fit-to-view control), extracted verbatim from `board-page.tsx`.
- **New** `apps/web/features/board/board-canvas-nodes.ts`: `useBoardCanvasNodes` hook + private helpers, extracted from `board-page.tsx`'s largest `useMemo` (building the canvas's xyflow node array from projects/campaigns).
- **Modified** `apps/web/features/board/board-page.tsx`: 653 → 431 lines. Now calls `useBoardCampaigns`/`useProjectArtwork`/`moveProjectPosition` from `board-data.ts` instead of building queries inline; delegates canvas-fit and node-building to the two new files; unchanged JSX/behavior otherwise.
- **Modified** `apps/web/features/board/project-thumbnail.tsx`: removed the 3 Supabase touch points (moved to `board-data.ts`) and the dead `useProjectThumbnails`/`toThumbnailUrls`/`ProjectThumbnails` (verified unused repo-wide). Now a pure model + `ProjectThumbnail` presentational component file with no database import.
- **Modified** `apps/web/features/board/board.css`: added the relocated `.filter-indicator` rule.
- **Modified** `apps/web/app/globals.css`: removed the `.filter-indicator` rule (board-only, left behind by Task 5) — this is the one line touched outside `features/board/`.

## Decisions and interface changes

- No `boardQueryKeys` / `useInvalidateBoard()` helper was introduced. Board's one write (`moveProjectPosition`) invalidates `["projects"]`, a key owned by `features/workspace`, not by board's own reads. Wrapping that single, cross-feature invalidation in a board-named helper would misdescribe it, so the direct `queryClient.invalidateQueries({ queryKey: ["projects"] })` call stays in `board-page.tsx`'s `onSuccess`, unchanged from before. This is a documented deviation from data-access.md rule 5's general guidance, not a behavior change.
  - **Fix round 1 (coordinator-requested):** this reasoning originally lived only in the task report, invisible to the six agents that will read `apps/web/features/board/` as the worked example for the remaining feature migrations. Added a comment directly above `moveProjectPosition` in `board-data.ts` recording, in the codebase's existing comment tone, that the helper is intentionally absent — board's write invalidates a key `workspace` owns, not one of its own — and that the call site should switch to `workspace`'s invalidation helper once one exists. No behavior changed; comment only.
- Named the campaigns read hook `useBoardCampaigns` rather than `useCampaigns`, because `features/briefings/briefing-data.ts` already exports a differently-shaped `useCampaigns(clientId)` (same query key shape, different column selection — pre-existing, not touched). Avoids name confusion for future readers; no behavior change since board-page.tsx doesn't import the briefings hook.
- No cross-domain interface changes: nothing outside `apps/web/features/board/` imports any of board's exports except the one `globals.css` line removed (a pure CSS deletion, no selector reused elsewhere — verified `.filter-indicator` had zero other consumers).

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | apps/web, this session | Pass, 0 errors | terminal output |
| `npx eslint features/board/` | apps/web, this session | 0 errors, 2 pre-existing warnings (verbatim-preserved `BoardCanvasControls` deps; unrelated unused `ArrowLeft` in untouched `board-nodes.tsx`) | terminal output |
| `npm run check` | apps/web, this session | **Pass** — typecheck clean, lint 0 errors/2 warnings, prettier clean, **281 tests / 17 files** (279 + 2 new, 16 + 1 new file) | terminal output |
| `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/board/*.tsx` | this session | `0` for every `.tsx` file in the feature | terminal output |
| `git status --short apps/web/features/board apps/web/app/globals.css` | this session | Only board feature files (new + modified) and the one `globals.css` line | terminal output |
| dev server on :3003 | this session | Left running throughout; confirmed still listening (same PID) after all checks; not restarted, Docker not touched | terminal output |
| `npm --prefix apps/web run test:e2e -- workspace` | — | **Not run** (optional per task instructions) | — |

## Remaining risks and next action

- No browser/e2e confirmation that the board canvas still renders, drags, and fits identically after the split — only static analysis (typecheck/lint) and the unit test suite were run. Risk judged low: the extraction was mechanical (same `buildStack` call, same per-node `data` shape, same `useMemo` dependency list), and the feature's existing tests (`board-layout`, `timeline-model`, `planning-view`, `project-open`, `project-thumbnail`) all still pass unmodified.
- `board-page.tsx` is 431 lines, above the ~350-line prompt in the task brief. A further split (e.g. the filter-menu dropdown into its own component) was considered and deliberately not done — judged not to improve cohesion enough to justify the extra indirection. Open for reviewer judgment.
- The no-`boardQueryKeys` decision is now recorded in-code (`board-data.ts`, above `moveProjectPosition`), not only in reports, so it should read as a documented, intentional precedent rather than an oversight for the remaining six feature migrations.
- Next required action: orchestrator review of this task's diff and both reports.

## Ownership at handoff

All paths in "Owned paths" above are released back to the orchestrator; no other worker holds them. No background process was started or left running by this task beyond the pre-existing dev server on :3003, which was not modified. Next task in the sequence (feature migration #2 of seven) has a clean base to branch from once this one is committed.
