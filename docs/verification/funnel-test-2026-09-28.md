# SABRE funnel test and layout audit — 2026-09-28

Owner: Claude orchestrator. State: 20 funnel scenarios passed in a real browser; layout fixes
verified by screenshot and measurement at 1440, 834 and 390 px. No push or deployment.

## Data and scope

The user authorized restarting the local SABRE dataset for this test. A full database and Storage
backup was taken first (`supabase/.backups/20260928-before-funnel-reset`, 1 client / 6 projects /
34 files), then every SABRE project and briefing was removed and SABRE credits reset to 500. No
reset or down migration was run. Two designers took part: Alex Morgan (`designer@dawes.local`) and
Jordan Reed (`designer2@dawes.local`). Their internal boards and the client board are the public
Miro test boards the user supplied.

## Funnel scenarios

Each scenario starts from a client briefing and uses only the UI (Playwright MCP, one session per
role). Every action has a "before" capture with the pressed button outlined, the dialog, and the
result at three widths, plus a crop of the action bar. The ignored report is
`outputs/funnel-report/index.html`, built by `outputs/funnel-harness/report.py`.

| ID | Scenario | Final state |
| --- | --- | --- |
| F01 | Two designers: private briefs, internal revision, client changes, invalid close-only handoff rejected, continue A / close B, V2 approval, delivery | Delivered |
| F02 | One designer, approved on V1 | Delivered |
| F03 | Designer 2, V1 and V2 changes, V3 approved | Delivered |
| F04 | Agency handles the change itself (V2 without a designer) | Approved, file staged |
| F05 | Both designers continue after feedback | V2 in review |
| F06 / F07 | Backlog blocks the designer; resume restores the task | Backlog / Studio review |
| F08 / F09 | Client requested changes / V1 waiting for the client | Changes requested / In review |
| F10 / F11 | Delivery not completed / Miro link edited after delivery | Approved / Delivered |
| F12 | Close direction, reactivate, fresh release | Studio review |
| F13 | Board reassigned from designer 1 to designer 2; old owner loses access | In review |
| F14 | Two internal studio loops (R1→R3) before V1 | In review |
| F15 / F16 | Both designers working / accepted without boards | In progress |
| F17 | October (0 credits) blocked with the shortfall explained; accepted in September | In progress |
| F18 | Approved V1 replaced by V2 (confirmation required) | In review |
| F19 | Two designers, V1 approved, two final files | Delivered |
| F20 | Changes requested → Backlog → resume → handoff | In progress |

Result: 263/263 UI actions passed. The database afterwards held 20 projects with exactly one
credit debit each; ledger, account and September balance all equal 402 (500 − 98). The foreign-key
audit passed 133 relationships. The step logs for F02–F04 were rebuilt from their captures and
final state because the batch call timed out before returning them; F12 and F17 were resumed
after harness fixes. The report states this for each.

## Product fixes found by the test

- Project page: the Miro embed is framed between the header and a docked footer
  (`.project-dock`) holding the tools, the current state and the workflow actions for every role.
  A full-width side panel on narrow screens hides the dock with the header.
- Studio review: the live board view offers **Review R#**, which opens the submitted round and its
  Request changes / Share with client actions.
- Copy: clients and designers see "Paused by the studio" in Backlog; before the first version the
  client sees "In progress · The studio is preparing your first version".
- Button hierarchy: Confirm budget is primary; after approval Prepare delivery leads and Share new
  version is secondary. Project action dialogs pin their buttons to the dialog's lower edge.
- Layout: one-row scrolling client navigation and Brand Hub tabs (`useScrollRow`, faded edges);
  equal-height header cards; client sticky header as a solid band whose height is the scroller's
  `scroll-padding-top` (validation summaries are no longer hidden); Overview and designer Home on
  one column grid; briefing list on a subgrid; briefing detail cards aligned; Brand Hub 24 px panel
  padding and bullets; Files heading, spacing and mobile stack; mobile/tablet Miro bar; handoff
  groups; canvas fit floor 75%.

## Checks executed

| Check | Result |
| --- | --- |
| `npm run check` | PASS: types, ESLint, Prettier, 132 files / 1,293 unit tests |
| Feature unit tests after later edits | PASS (projects, shared, workspace, briefings, brand, board) |
| Seven affected browser specs (`client-navigation`, `project-feedback`, `board-views`, `action-workflow`, `miro-workspace`, `client-pages-layout`, `overview`) | 27/30 PASS; the 3 failures need data this dataset lacks (below) |

Stale assertions updated to current behaviour: `miro-workspace` now releases instructions before
the designer submits (action-driven workflow) and uses Share new version; `project-feedback` uses
the project name in "Posting to …", "This round" for internal scopes and the board name in round
labels; `client-navigation` checks the one-row scrolling contract. A baseline run against the
previous commit reproduced the `project-feedback` failure, confirming it predated this work.

Not applicable to the current one-client dataset: the client-switcher tests in
`client-navigation.spec.ts` need a second client, and `overview.spec.ts` expects existing client
comments, and `sabre-development.spec.ts` checks the retired six-project set. They belong to the
canonical 10-client / 25-project acceptance run or to the previous dataset.

## Final captures

- [Client review with docked actions](screenshots/funnel-2026-09-28/client-review-dock-desktop.png)
- [Agency Review R1](screenshots/funnel-2026-09-28/agency-review-round-desktop.png)
- [Handoff dialog with pinned actions](screenshots/funnel-2026-09-28/handoff-pinned-actions-desktop.png)
- [Client Overview grid](screenshots/funnel-2026-09-28/client-overview-desktop.png)
- [Designer Home grid](screenshots/funnel-2026-09-28/designer-home-desktop.png)
- [Briefings list](screenshots/funnel-2026-09-28/briefings-list-desktop.png)
- Mobile: [client](screenshots/funnel-2026-09-28/client-project-mobile.png),
  [designer](screenshots/funnel-2026-09-28/designer-project-mobile.png),
  [agency feedback](screenshots/funnel-2026-09-28/agency-feedback-mobile.png)
