# Designer identification in Working files

The agency's selected design board now shows **Designer** and its owner's name in bold. The badge
also appears for a single board and remains attached to that board while reviewing its rounds.
It updates when switching boards and is absent from Shared with client and designer controls.

`useDesignBoards` reads only the owner's `display_name` through the existing profile foreign key.
No migration, broader permission, separate roster request or client-facing identity was introduced.
Names use the authorized profile value; a missing name reads **Name unavailable**.

## Verification executed

- `npm run check`: types, lint, formatting and **129 files / 1,272 tests** pass.
- Chromium `miro-workspace.spec.ts`: **2 passed**. The complete agency/designer/client review and
  file-delivery journey passes, including a single-board badge, switching between two designers,
  and hiding the badge in the shared channel. Client HTTP payload assertions pass; directly
  querying boards with the profile join returns no rows for the client and only the current
  designer's board/name for a designer.
- Agency bar at **1512 px** and **390 px**: badge visible within viewport, Axe zero violations,
  final captures inspected: [desktop](screenshots/board-designer-desktop-2026-09-27.png),
  [phone](screenshots/board-designer-mobile-2026-09-27.png). These captures verify application
  controls; they do not claim external Miro access or rendering.
- The first browser run timed out during client sign-in while macOS entered sleep. Power logs
  confirmed sleep/wake; repeating the unchanged tests after wake passed in 13 seconds.
- `python3 supabase/scripts/backup_local.py --check-only`: all **118** foreign keys valid.
  Disposable projects removed; live overlay remains **10 clients / 68 projects / 50 SABRE**.
- Existing bar/channel spacing was preserved pending clarification in the separate UI thread.
  The unrelated `login.png` deletion is untouched. No push or deployment.
