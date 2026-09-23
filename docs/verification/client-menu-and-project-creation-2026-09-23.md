# Client navigation and project creation cards

Date: 2026-09-23. Owner: Codex. Runtime: existing Next.js development server at port 3003.

## Delivered behavior

- All client destinations are visible text links in the top navigation, with an underline on the
  active section: Board, Briefings, Reviews, Files, Brand Hub and Credits (except for designers).
  The board places them beside its quarter selector; projects and other client pages use the same
  links in the shell topbar. The earlier Menu dropdown is superseded and its component removed.
- No client destination list remains in the sidebar on any route. Client switching, global
  destinations, agency settings/team, support and account/sign-out remain there. Short client
  workspaces use compact sidebar spacing; mobile navigation retains its focus containment.
- Navigation wraps on narrow screens without a scrollable menu. Structured board views reserve
  header space. Canvas opening/explicit fit reads the same responsive inset, keeping the first
  campaign below the floating header. Initial fitting waits for campaign frames as well as projects
  so a slow campaign response cannot center an empty intermediate layout.
- Editable project rows end with a dashed Add design tile. A full-width Add version card sits below
  each deliverable's versions, including empty deliverables. Both slots participate in computed
  canvas bounds. The small header plus controls and duplicate empty-row action are removed.
- Agency actions in Shared with client switch to Working files and open the existing production
  dialog. Add design targets the latest internal version of the same deliverable; publications
  remain immutable. Actual clients see review actions only and make no internal design/version
  reads. Backend policies and commands are unchanged.
- Explicit stable keys on the project canvas controls remove the React key warning observed during
  screenshot review. The final creation journey asserts no browser rendering/console errors.

## Checks executed

| Check | Result |
| --- | --- |
| Final `npm run check` | 590 tests / 49 files; type, format and lint pass, zero ESLint warnings |
| `npm --prefix apps/web run test:e2e -- client-navigation.spec.ts board-views.spec.ts` | 12/12 passed after the visible navigation implementation |
| `npm --prefix apps/web run test:e2e -- briefing-modal project-creation-cards production-workflow project-recovery playground video-designs design-audit workspace.spec` | 19/19 passed |
| Final project creation rerun after stable canvas child keys | 1/1 passed; real upload/version/publication, no console/page errors |
| Navigation/board rerun after responsive canvas inset | 11/12 passed; opening-fit race exposed by the remaining layout case |
| Final `npm --prefix apps/web run test:e2e -- board-views --grep 'live SABRE'` after the campaign loading guard | 1/1 passed, including an intentionally delayed campaign response and all 40 viewport/view combinations |
| Read-only database baseline after cleanup | 10 clients, 25 projects, zero temporary acceptance clients |
| Instructions and whitespace | `cmp AGENTS.md CLAUDE.md` and `git diff --check` pass |
| Local HTTP health | `/login` returns 200 |

The first unit run after making navigation always visible exposed a missing `usePathname` in the
board test's Next.js mock. The mock was updated and the complete source gate passed. Earlier
quarter-caption and upload-label locator failures were corrected before the successful runs above.
The entire release acceptance matrix and database policy suite were not rerun; no schema, policy,
service provisioning, production build, commit or deployment changed in this revision.

## Functional, visual and permission evidence

The navigation journey checks all six client destinations and direct project access at 1440×900,
1024×600, 390×844, 320×640 and 844×390; one navigation context, correct active links, all links
visible, no menu overflow and no duplicate sidebar links. It also covers authorized client switching,
collapsed sidebar, a single-client account, keyboard focus and accessible mobile drawers.

The board layout journey records 40 combinations across 1920/1440/1280/1024/768/390/320/844px,
including header/content separation, complete client name, Kanban/Calendar containment, manual
10% zoom, zoom/fit behavior and toolbar reachability. See
[the geometry record](board-view-fit-2026-09-23.json).

The creation journey uploads two real designs, verifies card geometry on desktop/mobile, publishes
them, then starts a private third design and a new private version from Shared with client. The
published rows remain byte-for-byte equal as JSON records. A separate client session still receives
two published designs and one version, no creation controls and no internal design/version requests.
The production/video journeys also verify role isolation, feedback, publication immutability and real
delivery. The design audit checks 44 representative surfaces and long-note version separation.

Screenshots inspected directly:

- [Desktop board navigation](screenshots/board-client-menu-1440.png)
- [Mobile board and opening fit](screenshots/board-fit-canvas-390.png)
- [Short-window Kanban](screenshots/board-fit-kanban-844.png)
- [Desktop Calendar](screenshots/board-fit-calendar-1440.png)
- [Project navigation](screenshots/project-client-navigation-1440.png)
- [Narrow project navigation](screenshots/project-client-navigation-320.png)
- [Working creation cards](screenshots/project-creation-working-1600.png)
- [Mobile creation-card geometry after Fit View](screenshots/project-creation-working-390.png)
- [Agency shared-view creation cards](screenshots/project-creation-shared-1600.png)
- [Actual client published view](screenshots/project-creation-client-1600.png)

The mobile project canvas remains pannable at its readable opening scale; explicit Fit View can
show the whole project at a smaller scale. No browser tooling claim extends beyond Chromium.
