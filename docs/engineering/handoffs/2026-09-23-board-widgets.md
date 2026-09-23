# Independent board widgets and Playground entry

- Updated at: 2026-09-23T05:55:00Z
- Reporting agent and tool: Board widget worker / Codex
- State: implemented; unit, static, and isolated database checks passed; browser verification owned by orchestrator
- Objective: Render Timeline and Kanban independently, persist per-viewer/client choices, and open Playground without replacing the client board.
- Owned paths: `apps/web/features/board/`, `supabase/migrations/202609230004_board_widgets.sql`, `supabase/tests/database/board_widgets.test.sql`, and this report.
- Dependencies: Existing project/client hooks and canvas conventions; Playground worker's `PlaygroundDialog({ clientId, onClose })`; orchestrator-owned generated database types, migration application, server, shared docs, and browser tests.
- Acceptance criteria: Both widgets, either widget, or neither can be shown in canvas/list/mobile; choices persist privately with backend authorization; projects/campaigns retain existing actions and selection; all supported roles can open Playground from an accessible client board.

## Completed work and changed files

- Added `board-widgets.ts` and tests for the ordered widget registry, known identifier normalization, empty saved choices, idempotent independent visibility, and immutable inputs.
- Added `board-widget.tsx`, used by both xyflow and the List/mobile layout. Timeline and Kanban now have independent headings, labelled regions, and hide buttons. Timeline retains its period/scale controls; Kanban retains its status columns, selection, and project opening behavior.
- Added `board-widget-picker.tsx` and component tests. **Widgets** opens Timeline/Kanban checkboxes; Escape returns keyboard focus to its trigger. Pending writes disable choices to prevent competing requests.
- Added `board-page.test.tsx` after the first integrated browser run exposed delayed checkbox acknowledgement. The page now derives displayed choices from the pending mutation variables immediately, restores confirmed query data on failure, and retries the same intended choice. No second preference store was introduced.
- Updated `board-layout.ts` and its tests to build separate widget frames, stack them without overlap, preserve campaign sizing/ordering/actions, and remove the widget column when both are hidden. Updated `board-canvas-nodes.ts`, `board-nodes.tsx`, and `planning-view.ts` to remove the old mutually exclusive planning-mode contract.
- Updated `board-page.tsx` to load/save preferences, expose visible load/save failures and retry, render the same widgets before the List table, and mount Playground over the current board. The per-client component key prevents local state from following navigation to another client. Opening/closing Playground leaves the underlying board mounted.
- Updated `board-data.ts` and its data tests for preference reads and writes. Query keys include session user and client; an absent row means both defaults and an empty array remains empty. No Supabase access was placed in components.
- Updated `board.css` for wrapped toolbar controls, widget headers/picker, and bounded list widgets. `board-kanban.tsx` received an updated ownership comment; its project behavior is unchanged.
- Added the board feature `README.md` covering persistence, permissions, extension points, errors/retry, and verification boundaries.
- Added migration `202609230004_board_widgets.sql` and 27 database assertions in `board_widgets.test.sql`.

## Decisions and interface changes

`public.board_preferences` is keyed by `(user_id, client_id)` and stores `visible_widgets text[]`. Defaults are `timeline` and `kanban`; both may be hidden. Constraints reject unknown/duplicate/null identifiers and invalid array shape. Authenticated users can read/create only their own accessible-client records and update only visibility, not owner/client keys. Agency has no override over another viewer. Current access predicates deny removed users and designers who lose workspace assignments.

`save_board_widgets(p_client_id uuid, p_visible_widgets text[]) returns text[]` is a security-invoker SQL function. It derives ownership from `auth.uid()` and atomically inserts/updates under RLS; it does not accept a caller-controlled user ID. Its anonymous EXECUTE privilege remains revoked. No migration 005 was needed.

Accessible browser contracts sent to the orchestrator before integration:

- Trigger: button `Widgets`; choices: checkboxes `Timeline` and `Kanban`.
- Regions: `Timeline widget` and `Kanban widget`; header controls: `Hide Timeline widget` and `Hide Kanban widget`.
- Entry: button `Playground`, mounting the worker-owned dialog with the current client.
- Canvas node IDs: `widget:timeline` and `widget:kanban`, node type `widget`.
- Existing global `.board-card` selectors now include both campaign and Kanban cards because both views are visible; tests asserting campaign cards must scope to `.react-flow__node-project`.

Applied project-structure, testing, and update-project guidance. Read security guidance and kept this worker's authorization work bounded to the assigned schema/RLS/tests; the orchestrator owns the repository-wide/final audit. No new dependency, shared instruction change, or commit was introduced.

## Local database compatibility investigation

The orchestrator's first database run passed the first 25 board assertions, then the anonymous forbidden-function call crashed this local PostgreSQL 17.6/aarch64 process. A direct anonymous call outside pgTAP reproduced the crash. A second Playground RPC reproduced it independently, so the evidence did not implicate the widget function's SQL language or body. The installed Supabase image and `supautils` hint configuration match the reported [revoked EXECUTE regression](https://github.com/supabase/postgres/issues/2112); a separate [HTTP reproduction](https://github.com/supabase/supabase/issues/48614) documents the same failure class.

An isolated connection with session preloads omitted returned actual SQLSTATE `42501`, rolled back, and answered a subsequent query. Attempting a transaction-local `supautils.hint_roles` override returned `55P02` because it is a reload setting; no persistent setting was changed by this worker. This isolated the error-hint path while leaving RLS and function ACLs unchanged.

The orchestrator then applied its documented, exact-image compatibility workaround through `local_stack.py`, disabling the faulty enhanced hints without changing authorization. The real anonymous `throws_ok` assertion was restored, retained alongside an ACL assertion, and the entire board database file passed on a normal connection. No forbidden case remains skipped or replaced solely by grant inspection.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `./node_modules/.bin/vitest run features/board` | Local `apps/web`, 2026-09-23 | 131 tests passed across 8 files | Tool output; colocated tests |
| Deferred-network regression in `board-page.test.tsx`, before and after the checkbox fix | Local `apps/web`, 2026-09-23 | Both tests reproduced the unchanged-checkbox failure before the fix; the completed tests pass for pending, success, rollback, and retry | Tool output; new page tests |
| `./node_modules/.bin/vitest run features/board` after the checkbox fix | Local `apps/web`, 2026-09-23 | 133 tests passed across 9 files | Tool output |
| `./node_modules/.bin/eslint features/board/board-page.tsx features/board/board-page.test.tsx` and `./node_modules/.bin/tsc --noEmit --incremental false` after the fix | Local `apps/web`, 2026-09-23 | Both passed, no diagnostics | Tool output |
| `./node_modules/.bin/vitest run features/shared/stylesheet-boundary` | Local `apps/web`, 2026-09-23 | 21 tests passed | Tool output |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Local `apps/web`, after orchestrator regenerated types, 2026-09-23 | Passed, exit 0 | Tool output |
| `./node_modules/.bin/eslint features/board` | Local `apps/web`, 2026-09-23 | Zero errors; one pre-existing dependency warning in `board-canvas-controls.tsx` | Tool output |
| `./node_modules/.bin/prettier --check features/board` | Local `apps/web`, 2026-09-23 | Passed | Tool output |
| `git diff --check` | Repository root, 2026-09-23 | Passed | Tool output |
| Normal direct anonymous `save_board_widgets` invocation before compatibility workaround | Disposable transaction, local database, 2026-09-23 | Connection terminated by the upstream engine/extension defect; no write committed | Tool output and database logs |
| Same direct anonymous invocation with session preloads omitted | Disposable transaction and connection, local database, 2026-09-23 | Actual `42501` permission denial; rollback and following `SELECT 1` succeeded | Tool output |
| `supabase test db supabase/tests/database/board_widgets.test.sql` | Normal local connection after orchestrator's runtime compatibility workaround, 2026-09-23 | 27/27 assertions passed, exit 0 | Tool output; `board_widgets.test.sql` |

## Remaining risks and next action

The worker did not run the production build or browser suites, capture screenshots, or verify Playground functionality end to end. The orchestrator must verify preference persistence/isolation and save retry on actual services, inspect desktop/mobile widgets and toolbar layout, verify Playground returns to the intact board, run the integrated checks, and confirm the 10-client/25-project baseline after fixture cleanup. The database crash investigation and successful post-workaround denial belong in shared runtime evidence; no authorization workaround or additional schema migration is required.

## Ownership at handoff

All owned code, schema, tests, and report paths are released to the active Codex orchestrator. No worker-owned process remains active. Migration application/types generation and the persistent runtime workaround were performed by the orchestrator, not this worker. This report does not approve deployment or declare the overall product complete.
