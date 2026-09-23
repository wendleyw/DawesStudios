# Board views, floating tools, client navigation and briefing modal

Verified on 2026-09-23 against the existing Next.js development server at `http://localhost:3003`.
Codex integrated this revision in the existing working tree without discarding earlier changes.
The in-app Browser had no available browser instance; verification used the repository's Playwright
runner against the local application.

## Delivered behavior

- Canvas, List, Timeline, Kanban and Calendar are five exclusive icon views. The selected view is
  private to each viewer/client and persists across reloads. Search, filters and selection are shared.
- A floating left toolbar holds board actions. Canvas fills the entire grid behind it, and a separate
  zoom/fit card sits immediately below. Manual zoom reaches 10%; automatic fitting retains its 40%
  readability floor. Small or short screens use horizontal cards at the bottom.
- Every view fits the remaining viewport. Wide Kanban boards fit all seven columns; narrow layouts
  scroll internally. Calendar uses complete Monday-first months and a narrow-screen agenda, with
  due-date events and a separate undated section. Start-only projects remain undated here.
- The sidebar shows one client context with a searchable switcher and a flat list of destinations.
  Single-client accounts use a direct link. Collapsed navigation retains icons; short screens scroll
  to keep account actions reachable. Escape closes the picker before closing the mobile drawer.
- In-app New briefing links open the existing Type/Details/Review editor in a route modal. The page
  underneath remains mounted. Draft saving stays inside the modal; successful submission confirms
  delivery and returns to the previous view on Done. Unsaved edits are guarded on modal closure;
  saving/uploading disables closure. Direct URL visits retain the full editor page.

Migration `202609230008_board_views.sql` was applied locally. Legacy widget preference values and
RPCs remain compatible. The view RPC derives ownership from authentication and respects client
scope; Calendar reuses authorized project metadata. The sidebar reuses the existing scoped client
query. Briefing validation, persistence, permissions and free submission use the existing backend.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run check` | 576 tests / 48 files; type checking, ESLint and formatting passed; no ESLint warnings |
| `npm run db:test -- supabase/tests/database/board_views.test.sql supabase/tests/database/board_widgets.test.sql` | 53 assertions passed across both suites, including cross-user/client and anonymous denial |
| `npm --prefix apps/web run test:e2e -- board-views client-navigation briefing-modal workspace.spec workspace-actions design-audit brand-accessibility intake-admin` | 28/28 passed in 2.2 minutes |
| `npm --prefix apps/web run test:e2e -- briefing-modal client-navigation` after the final modal footer and submission-close corrections | 4/4 passed in 12.8 seconds |
| `git diff --check`; `cmp AGENTS.md CLAUDE.md` | Passed |
| Final database count after guarded fixture cleanup | 10 clients, 25 projects, zero temporary acceptance clients |

Browser coverage includes all three roles across all five views at desktop/mobile sizes, personal
preference isolation, failed save/retry, actual project navigation, calendar dates and month changes,
keyboard focus, filter panels, zoom down to 10% and fitting back. The real SABRE workspace was checked
at eight sizes from 320 × 640 to 1920 × 1080: [40 geometry cases](board-view-fit-2026-09-23.json).
The [design audit](design-audit.json) records 44 responsive surfaces without horizontal overflow or
axe violations. The focused suites additionally check 30 role/view/size combinations, search/filter
panels, client pickers, and modal layouts for agency/client at 1440 × 900, 390 × 844 and 844 × 390.

The modal browser cases create a campaign, preserve fields through a canceled close, save a real
draft, submit it into `awaiting_review`, return to the same Calendar view, restore trigger focus and
verify the direct URL presentation. Both Done and the close button return correctly after submission. The existing intake suite also passed attachment persistence,
revision conflicts, free submission, atomic acceptance and scoped designer access.

## Visual review and corrections

Manually inspected desktop/mobile board, sidebar, picker and modal captures. Verification exposed
and corrected stale canvas measurements after resizing/view changes, Timeline contrast, constrained
Kanban headers, Calendar event overflow, a development indicator covering mobile tools, nested
Escape handling and short-window sidebar overflow. The final modal footer covers the scrolling
content cleanly and keeps Back/Continue visible.

Representative captures:

- [Floating board and zoom controls](screenshots/board-fit-canvas-1440.png)
- [Kanban](screenshots/board-fit-kanban-1440.png) and [Calendar](screenshots/board-fit-calendar-1440.png)
- [Client switcher](screenshots/sidebar-client-picker.png) and [short mobile drawer](screenshots/sidebar-client-mobile-844.png)
- [Desktop briefing modal](screenshots/briefing-modal-agency-1440.png) and [mobile modal](screenshots/briefing-modal-client-390.png)

## Scope and continuation

No database reset, canonical fixture reprovisioning, commit or deployment occurred. Browser tests
used isolated temporary records with guarded cleanup and restored existing board preferences.
User-created campaigns remain intact. Existing media/Playground work is preserved.

This is feature verification, not whole-product release approval. The broader J10 audit and existing
video/hosting follow-ups remain recorded in the engineering checkpoint. Browser back/reload retains
native routing behavior and is not an unsaved-briefing guard; saving a draft persists it for later
editing. The complete browser suite and production build were not rerun for this bounded revision.
