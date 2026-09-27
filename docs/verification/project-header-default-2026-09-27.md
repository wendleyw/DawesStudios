# Default project header — 2026-09-27

The user approved the compact header and clarified that it applies **only to project pages**.
Every agency, designer and client project now shows its campaign above the title and its due-date
badge beside it. The full-width controls bar sits below. Ordinary project URLs, notification
destinations and the former preview URL share this one layout. No flag, preference or data
migration is required. Other workspace pages and the restored desktop board toolbar are unchanged.

`ProjectTitle` reuses the authorized campaign hook. The designer's badge retains the board's
internal deadline, bounded by the project deadline; other roles see the project's date. Missing
dates read **No due date**; unavailable campaign data is not replaced with an invented label.
The title remains available if client identity data is missing. The old two-row bar and preview
branches/styles were removed. Project styling remains in `features/projects/projects.css`.

## Verification executed

- Web gate: types, lint, formatting and **127 files / 1,253 unit tests** passed. Four regression
  cases verify the default heading and deadline for all three roles, plus missing client/campaign
  data. Existing bar tests were updated to match the approved placement and empty-state controls.
- Isolated Chromium sessions for agency, client and designer opened authorized projects at plain
  `/projects/:id` URLs. Campaign names matched each session's authorized campaign read. Each page
  contained one `h1`, one deadline badge and the role's expected channel controls.
- All three roles passed 1600×1000, 1512×696, 1024×768, 390×844 and 320×740 checks: no document
  overflow; header, account, controls and bottom tools inside the viewport; **15 header Axe scans
  with zero violations**. Miro requests were blocked only in these isolated header tests; this
  does not claim external Miro service availability or authentication.
- More/Escape focus return and Details passed for all three roles. Agency round selection and
  switching to Shared with client passed. The client board retained its existing header without
  the project's title card in all three sessions.
- Existing client-browser navigation to the plain project URL was checked at its native size.
  Fixed test viewports remain confined to isolated test browsers.
- No project content, role grants or application preferences were changed by the rollout tests.

## Final captures

- [Agency desktop](screenshots/project-header-default-2026-09-27-agency-1600.png)
- [Agency mobile](screenshots/project-header-default-2026-09-27-agency-390.png)
- [Client desktop](screenshots/project-header-default-2026-09-27-client-1600.png)
- [Designer mobile](screenshots/project-header-default-2026-09-27-designer-390.png)

Working screenshots, browser measurements and command logs remain under ignored `outputs/`.
The earlier [preview record](compact-project-header-2026-09-27.md) is historical. No push or deployment.

## Typography follow-up

The requested project-title emphasis uses weight 700 while retaining 18 px on desktop and
16 px in narrow work areas. Campaign labels, deadline badges and spacing are unchanged.

- Targeted CSS gate: Prettier and 81 stylesheet-boundary/theme-color tests passed.
- Isolated Chromium checked Geist and Editorial at 1600×1000 and 390×1000: computed weight
  700, expected font size and no horizontal document overflow in all four cases.
- The existing native browser also showed weight 700 without horizontal overflow.
- Final captures inspected: [desktop](screenshots/project-title-bold-2026-09-27-desktop.png)
  and [mobile](screenshots/project-title-bold-2026-09-27-mobile.png).
