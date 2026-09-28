# Status walkthrough and standardized board bar — 2026-09-28

Owner: Claude orchestrator. State: 16 status checkpoints passed in a real browser; the Miro board bar
was standardized across roles and verified. No push or deployment.

## Status walkthrough

One project (S02, two designers) goes from briefing to delivery through the UI (Playwright MCP).
After every click a checkpoint reads the project's real state from the database, each role's board
badge and each role's docked action bar (state text and buttons), and compares them with the rules
in the [workflow guide](../architecture/production-workflow.md). The ignored report is
`outputs/status-report/index.html` (`outputs/funnel-harness/status_report.py`).

| Click | Database | Client / agency / designer badge | Buttons checked |
| --- | --- | --- | --- |
| Send briefing; Confirm budget | Briefing awaiting review; budget confirmed | Awaiting review; Budget confirmed | — |
| Accept & create project | In progress, 1 debit | In progress | Agency: Add design board |
| Boards added; instructions sent | In progress | In progress | Agency: Send to designer; designers: Send to studio |
| Designer sends R1; studio requests changes; R2 | In progress | In progress (Studio review is internal) | Agency: Review R#; designer: none while in review |
| Share V1 | In review | In review | Client: Approve, Request changes; agency: Share new version |
| Client requests changes | Changes requested | Changes requested | Agency: Send to designers, Share new version |
| Backlog; Active | Status kept; activity backlog/active | Hidden from the default Active board, "Backlog" under the filter | No actions; "Paused by the studio" |
| Send to designers (A continue, B close) | In progress | In progress | Designer 1: Send to studio; board B: Reactivate board |
| R2; share V2; approve; file; complete | In review → Approved → Delivered | In review → Approved → Delivered | Approved: Prepare delivery, Share new version; Delivered: none |

Result: 16/16 checkpoints. Checkpoint 22 first expected Backlog projects on the default board; the
documented rule hides them under the Active filter. A separate check confirmed the rule for client,
agency and designer (hidden by default, "Backlog" badge under Filters → Activity → Backlog), and the
record notes the corrected expectation.

## Changes from this pass

- A board whose round was shared reads **Shared with client** in the action bar instead of
  "Waiting for production instructions".
- The Miro bar has one order for every role: back · channel · board · rounds or versions · Open in
  Miro · ⋯. The agency's board reads "Direction A · Alex Morgan" (no separate designer chip);
  rounds read **Live / R1 / R2**; the state is no longer repeated in the bar. Add design board and
  Edit board moved to the ⋯ menu, whose items are left-aligned.
- A designer sees only their live board (no round toggle); the workspace keeps designers on it.

## Checks executed

| Check | Result |
| --- | --- |
| Project unit tests (bar, workspace) | PASS: 28 files / 242 tests, bar tests updated to the new layout |
| `action-workflow`, `miro-workspace`, `project-feedback` browser specs | PASS: 6/6 after updating board-picker and bar assertions |
| Visual capture of the bar for agency, designer and client at 1440 and 390 px | Reviewed |

## Final captures

- [Agency, Working files](screenshots/status-2026-09-28/bar-agency-working-desktop.png) and
  [on a phone](screenshots/status-2026-09-28/bar-agency-working-mobile.png)
- [Agency, Shared with client](screenshots/status-2026-09-28/bar-agency-shared-desktop.png)
- [Designer](screenshots/status-2026-09-28/bar-designer-desktop.png)
- [Client](screenshots/status-2026-09-28/bar-client-desktop.png)

## Centered dock over a cropped Miro embed

- The embed's iframe is cropped (64 px top, 64 px bottom, 16 px right) so Miro's top bar, zoom
  control and scrollbars stay hidden; Open in Miro keeps the full editor.
- On desktop and tablet the dock is a compact 48 px pill centered over the board, 12 px above its
  bottom edge, and recenters beside an open side panel; on phones it sits below the board.
- Checks: project unit tests 28 files / 242 tests PASS; `project-feedback` and `miro-workspace`
  specs 5/5 PASS; `npm run check` 1,293 tests PASS. Measured at 1440 px: board 92–1424, dock
  562–954 (centered for agency, client and designer).
- Captures: [agency](screenshots/status-2026-09-28/dock-agency-1440.png),
  [tablet](screenshots/status-2026-09-28/dock-agency-834.png),
  [phone](screenshots/status-2026-09-28/dock-agency-390.png),
  [Comments open](screenshots/status-2026-09-28/dock-agency-panel-1440.png),
  [client](screenshots/status-2026-09-28/dock-client-1440.png),
  [designer](screenshots/status-2026-09-28/dock-designer-1440.png).

## Second walkthrough (S03) and action map

A fresh project (S03) repeated the flow in the browser for client, agency and both designers.
Result: 15/16 checkpoints; checkpoint 22 carried the same outdated expectation as S02 (Backlog is
hidden by the default Active filter), and a separate check in this session confirmed Backlog under
Filters → Activity for client, agency and designer 1.

| Status before | Who | Button (where) | Status after |
| --- | --- | --- | --- |
| — | Client | Send briefing (Briefings) | Briefing Awaiting review |
| Awaiting review | Agency | Confirm budget (briefing) | Budget confirmed |
| Budget confirmed | Agency | Accept & create project (briefing) | In progress, 1 credit debit |
| In progress | Agency | Add design board, then Send to designer (Working files) | In progress · Designer working |
| Designer working | Designer | Send to studio (own board) | In progress · Studio review (internal) |
| Studio review | Agency | Review R# → Request changes | Designer working again |
| Studio review | Agency | Review R# → Share with client | In review, V# created |
| In review | Client | Approve / Request changes | Approved / Changes requested |
| Changes requested | Agency | Send to designers (Shared with client) | In progress · designers working |
| Approved | Agency | Prepare delivery → Complete delivery (Files) | Delivered |
| Any open status | Agency | Edit project details → Backlog / Active | Paused / resumed, status kept |

Fixed from this run: the action bar contradicted the project status twice. After Send to designers
it now reads "The studio is working on your changes" (client) or "Changes sent to designers"
(agency) instead of "Changes requested"; after Complete delivery it reads "Delivered" instead of
"Approved". Checks: project unit tests 28 files / 247 tests PASS (5 new cases).

The user's short-window screenshot hid the dock behind the macOS Dock; the page itself fits:
probes at 1024×640, 1180×720, 1435×747, 1435×850, 1728×1000 and 900×1000 measured no page
overflow, and the board and centered dock stayed inside the window
([window sizes](screenshots/status-2026-09-28-s03/window-sizes.png),
[1435×850](screenshots/status-2026-09-28-s03/agency-1435x850.png),
[client, delivered](screenshots/status-2026-09-28-s03/client-delivered.png)).

## Presentation run (D01) for the agency CEO

A narrated, single-window run in the visible Playwright browser: every step showed a caption (who,
what, what happens next), highlighted the button before clicking and paused on the result; the
role changed by signing out and in. Nine chapters, 37 actions and 11 database checks, all PASS.
Final state of "D01 Spring Launch Campaign": Delivered, Direction A shared twice (R1→V1, R2→V2),
Direction B closed after one round, latest decision approved, 1 final file, exactly 1 credit debit.
A hidden dry run (X01, now also on the SABRE board) found one display defect, fixed before the
run: a board wider than the canvas opened with its first column under the tool dock.
Captures (70) are in the ignored `outputs/funnel-test/D01/`.
