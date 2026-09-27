# Desktop board toolbar restoration

Date: 2026-09-27. User request: restore List, Canvas, Timeline, Kanban and Calendar controls to
the left side of the board.

The bottom-toolbar breakpoint previously matched either a viewport width of 900 px or less, or
any viewport height of 700 px or less. That moved the toolbar in an otherwise wide desktop window
such as 1512 × 696. The breakpoint now depends only on width. Short desktop windows retain the
left vertical toolbar and right-opening search/filter panels; phone/tablet behavior is unchanged.

Changed `features/board/board.css`, the existing board browser test, board README and design guide.
No data-access, permission or project-header-preview behavior changed.

## Verification

- Existing Chromium floating-tools test passed at 1440 × 900, 1512 × 696, 1440 × 600,
  390 × 844 and 844 × 390. Explicit desktop geometry asserts a vertical toolbar on the left.
- Search/filter panels stayed inside the viewport, filtering worked, Escape returned focus,
  clear/outside-dismiss worked, and Axe reported zero violations at each tested size.
- Final desktop images inspected at 1512 × 696 and 1440 × 600. The cited
  [desktop capture](screenshots/board-left-toolbar-2026-09-27-desktop.png) shows the restored rail.
- Full web gate: 127 files / 1,249 unit tests, types, lint and formatting passed. The final
  browser-test geometry assertions also passed targeted ESLint/Prettier and the browser test.
- Local data retained 10 clients / 68 projects / 50 SABRE, with no temporary acceptance clients;
  all 118 foreign-key checks passed after fixture cleanup. The unrelated `login.png` deletion remains.

The shared browser runtime reported no available browsers. Verification used the repository's
isolated Playwright Chromium runner and did not resize or navigate the user's browser.
