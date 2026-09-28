# Board action clarity — 2026-09-27

The user asked whether the plus in Working files should open the design-board form. It correctly
links another existing Miro board to the project and an assigned designer; it does not create
an external Miro board. The function and authorization remain unchanged.

- Working files now shows **+ Add board**; Shared with client shows **+ New version**.
  Accessible names remain **Add design board** and **New client version**.
- The board dialog uses **Add design board** or **Edit design board** and explains the existing
  Miro link and studio/designer visibility. The link field includes a clear paste placeholder.
- Targeted gate: **4 files / 73 tests** pass (bar, board actions, workspace and CSS boundary).
  ESLint, Prettier and whitespace checks pass.
- Chromium:1512×696,1024×768,390×844; no page overflow; labeled button and correctly named form,
  Cancel/focus return and **3 dialog Axe scans with zero violations**. Shared-channel action label
  checked. No records created. Isolated checks blocked external Miro requests.
- Final screenshots inspected: [desktop action](screenshots/board-action-clarity-2026-09-27-desktop.png)
  and [mobile dialog](screenshots/board-action-clarity-2026-09-27-mobile.png).

## Final placement requested by the user

The user subsequently chose the icon-only **+**, immediately left of the designer name. The icon
and designer badge now share a wrapping group with an 8 px gap, preserving their alignment on
phones. The tooltip/accessibility name and clarified dialog remain **Add design board**.
Shared with client retains **New version**.

- Current targeted gate: **44 tests** pass; ESLint, Prettier and whitespace checks pass.
- Chromium1512×696,1024×768,390×844: icon left of designer,8px gap, vertical alignment,
  no document overflow, correct dialog,Cancel/focus return and3dialogAxe scans pass.
- Final captures inspected: [desktop](screenshots/board-add-placement-2026-09-27-desktop.png)
  and [mobile](screenshots/board-add-placement-2026-09-27-mobile.png).
- No records created; external Miro requests blocked in isolated checks. No push or deployment.
