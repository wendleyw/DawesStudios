# Client project board

The board has five mutually exclusive views: **Canvas**, **List**, **Timeline**, **Kanban**, and **Calendar**. One icon selector carries named buttons, native tooltips, keyboard activation and `aria-pressed`. Search, campaign/status filters and selection use the same authorized projects in every view. Canvas groups cards by campaign; List links directly to projects. A card or planning entry selects on click and opens on double click or its explicit open control.

List's PROJECT/CAMPAIGN/STATUS/DUE headers are buttons: the first click sorts that column ascending, a second click on the same column reverses it, and clicking another column restarts at ascending on the new one. Project and Campaign sort A–Z (locale-aware, case-insensitive); Status sorts by workflow order (the same key order as `statusLabels` in `workspace/workspace-data.ts`, also the Kanban column order); Due sorts by date with undated projects always last in both directions; Campaign/Status/Due ties break by title. An arrow icon marks the active column, and each header button's accessible name states the column and, once active, its direction (e.g. "Due, earliest first"). The sort is `board-page.tsx` state kept for the board visit — it survives switching views, combines with search/campaign/status/period filters, and is not reset by Clear filters, only by switching clients (which remounts the board). Below 640px, where `.table-head` hides (`app/globals.css`) and List is the phone default, a compact "Sort by" select above the rows reads and writes the same state. The pure sort (no React) lives in `list-sort.ts`.

## Floating tools

`board-header.tsx` supplies the quarter picker to `workspace/canvas-header.tsx`, shared with projects and all client sections.
Its identity/profile styles live in `app/globals.css`; the board's period and layout rules remain
in `board.css`. All client routes hide the redundant desktop shell topbar.

Board actions live in a floating toolbar on the **left**: Search, Filters, the five view icons, New briefing when permitted. New briefing opens the shared editor in a route modal, preserving the current board view underneath. The full-width header is replaced by two floating cards: the approved client logo alone and the quarter selector on the left, and an account card with the notification bell to the left of the signed-in viewer’s avatar/name on the right. The bell opens the shared animated feed below the account card on desktop and mobile. The logo is the same size (48px tall; 32px on phones and short windows; up to three times as wide as it is tall, so wide wordmarks are not shrunk into a square) on the board, projects and every other client page, and links to the client's Overview (the board for designers, who have none); the client name is its accessible label and tooltip, not visible text. Missing logos use initials. The period trigger uses its intrinsic width. The current client destinations are visible text links beside the period: Board, Briefings, Reviews, Brand Hub and Credits (hidden for designers; Files is a Brand Hub section). The active section is underlined. Below a 980px board (700px on screens shorter than 651px, so the period panel still fits under a one-row header, and on project pages, whose own title card names the work and whose feedback panel needs the height) the links move to a second row of the identity card rather than squeezing the client's name beside the account card, which also holds the credit balance; on a phone they wrap at their own widths, and the credit balance chip yields its place (the balance stays under **Credits**). Nothing scrolls horizontally, and every view reserves the corresponding header height (`--board-header-space`). The same client links appear at the top of projects and other client pages, never in the sidebar. Global navigation and client switching remain in the sidebar. On phones the period caption shortens to All/Q1–Q4 while its accessible name retains the year and full selection. Search and Filters open one compact panel to the toolbar's right, with the result count and contextual clear action. Opening focuses the input; Escape and the close button return focus to the trigger; clicking outside dismisses the panel without clearing filters. Active search/filter dots remain visible when panels close.

Canvas places Zoom Out, the live zoom level, Zoom In and Fit board to view in the shared zoom pill, anchored to the bottom of the same floating tool dock, left-aligned under the main toolbar. Manual zoom reaches 10%; automatic fitting keeps a readable 40% minimum. Both cards overlay the full canvas grid, with no reserved side strip; the canvas can pan behind them. List, Timeline, Kanban and Calendar keep a gutter clear of content.

At viewport widths up to 900 px or heights up to 700 px, the cards become centered horizontal bars at the bottom, with zoom below the main bar and panels opening above it. Structured views reserve bottom space for their toolbar; Canvas continues beneath the floating cards. The Next.js development indicator is disabled because its fixed mobile overlay covered toolbar actions.

## Views and sizing

The work area fills the viewport below the shared mobile topbar. Canvas extends behind the floating identity/profile cards, while structured views reserve space above their content. That space, `--board-header-space`, is measured: `board-page.tsx` observes the floating header and sets it to the header's bottom edge plus `--board-header-gap` (16 px, the gap other client pages leave under their header card; 12 px on screens up to 650 px tall, where Kanban needs the height), so wrapping at any width or client name never lets a view touch or drift from the header. The stylesheet's per-breakpoint values are only the first-paint fallback. The first canvas fit leaves space for the header; errors and retry actions appear below it. Canvas pans within its work area; List, Timeline, Kanban and Calendar scroll within their own surfaces. Wide Kanban boards fit all seven columns; narrower boards retain readable columns with horizontal scrolling inside the board. Each Kanban column scrolls vertically and never changes workflow status by dragging.

Timeline retains Fortnight/Month/Quarter scales and previous/next/Today controls. A project whose dates fall entirely before or after the visible window still keeps its lane: instead of a bare notice, the lane shows a quiet button naming the nearest known date (`← Due Aug 3`, `Starts Dec 4 →`), and clicking it jumps the window to the week of that project's first known date; work with no dates at all keeps plain text. Calendar shows project **due dates**, Monday-first calendar months, previous/next/Today controls and a separate **No due date** section. Start-only projects stay in that section; Timeline continues to show their start dates. Date calculations use UTC calendar days, including leap years and year boundaries. The monthly grid shares the available height among its weeks and shows every project on its day: a week with more projects grows to fit them, days never scroll, and the calendar scrolls as a whole when a busy month outgrows the viewport. Below 900 px of board width, a monthly agenda replaces the grid so project titles and actions remain readable. Calendar month and Timeline period/scale survive view switching.

The canvas waits for projects/campaign frames and its actual DOM element to be measured before fitting. Its opening inset reads the responsive header spacing so wrapped navigation cannot cover the first campaign. It refits on viewport resizing without refitting on project selection or dragging. Project cards always render on their frame's grid (`arrangeFrame` in `board-layout.ts`), so cards keep an even gap even when a saved position is off the grid. A dropped card settles on the cell beneath it, swapping with a card already there (`dropCard`); both new positions are saved. It uses the shared 24-unit dot grid, two-axis scroll/trackpad panning and the shared zoom pill (bottom left on wide boards, below the rail's bottom bar on small screens). Its node model contains campaigns, projects, creation/empty-state frames and, when the studio placed it, the Competitor ads widget frame. See the [shared canvas primitives](../shared/README.md#canvas-background-and-controls).

## Widgets

In Canvas view the agency's toolbar has a **Board widgets** button (hidden on screens narrower than 360px, where a ninth button does not fit; the widget keeps its own remove button). Its compact panel lists
**Competitor ads** with **Add to board** or **Remove from board**; a failed change shows its message
in the panel. Placement is shared per client in `client_board_widgets` (`useBoardWidgets`,
`addBoardWidget` and `removeBoardWidget` in `board-data.ts`), unlike the legacy per-viewer
`visible_widgets` column. The agency and designers with the client's work see a placed widget;
clients never read the table, and their board does not even ask. The widget is the first frame of
the stack, as wide as a three-card row and `competitorWidgetHeight(count)` tall (one row of four
tiles per four competitors). Its content and behavior belong to the
[competitors feature](../competitors/README.md).

## Quarter filter

The header starts at **All periods**. Its compact panel shows four quarter buttons with their month ranges, Previous/Next year controls, and All periods together, with no internal scroll. It focuses the selected choice on opening and returns focus on selection/Escape; tabbing or clicking outside dismisses it. Year arrows remain focusable with `aria-disabled` at their limits, so reaching the first/last year does not close the panel. Q1–Q4 are available for the current year, its neighboring years and years present in authorized project dates. A project appears when its start/due interval overlaps the quarter; a single known date is treated as a point, and work without dates stays visible. Selecting a quarter also opens Calendar at its first month and Timeline at its first week with Quarter scale. The filter combines with search/campaign/status filters and survives switching views. It is local to the current board visit, not a saved preference; clearing filters restores All periods. Existing calendar/timeline navigation remains independent of the header filter.

## Personal preference

`public.board_preferences.active_view` is keyed by authenticated user and client. A null value or missing row opens the board as List at every width (user request, 2026-09-24). A saved choice wins at every width. `save_board_view` derives ownership from the session; RLS also requires current client access. Even agency users cannot read or alter another viewer's preference. Choosing a view updates immediately while the save/refetch is pending; controls remain disabled until it settles. Failure restores the confirmed view and offers retry. Switching clients remounts local state.

Migration `202609230008` adds the view column without rewriting project data or deleting legacy `visible_widgets` values. The old `save_board_widgets` RPC remains compatible for older clients but has no current UI consumer. The view writer and legacy writer preserve each other's columns. New view identifiers belong in `board-views.ts`, the picker, renderer and a new database constraint migration.

## Playground

Playground belongs to individual projects and roles; the client board has no Playground entry. Open a project to use its brainstorming layer. See the [project Playground contract](../../../../docs/architecture/project-playground-and-video-optimization.md).

## Data and verification

All board Supabase queries and writes live in `board-data.ts`. Workspace hooks own project/client reads. The Calendar projects its existing scoped metadata and fetches no assignments or private production data. Video artwork remains a lightweight **Video** tile until a design opens.

From the repository root:

```bash
npm --prefix apps/web run test -- features/board
npm run db:test -- supabase/tests/database/board_views.test.sql
npm --prefix apps/web run test:e2e -- board-views
```

The browser suite uses isolated temporary clients/projects, restores them through guarded cleanup, and verifies all three roles, persistence, failure/retry, scoped choices, deadline placement, filters, navigation, viewport containment and accessibility. Existing legacy widget policy tests remain valid compatibility checks. See the [views/navigation verification](../../../../docs/verification/board-views-2026-09-23.md) and [floating-header and briefing verification](../../../../docs/verification/board-header-and-briefing-2026-09-23.md).

Current navigation and creation-card evidence: [verification record](../../../../docs/verification/client-menu-and-project-creation-2026-09-23.md).
