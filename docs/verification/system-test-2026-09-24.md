# Complete system test — 2026-09-24

Orchestrator: Claude Code (session `a375ed7c`). Before going to sleep, the user asked for a complete
test of logic, UX, UI and every action for every role, with a screenshot of every screen, and for what
the screenshots show to be fixed so the system is aligned, standardized and correct. Every check below
ran in this session on the local stack with the SABRE overlay active (10 clients, 68 projects).

## Method

1. **Every screen, every role, two widths.** `apps/web/tests/e2e/system-tour.spec.ts` (run it with
   `SYSTEM_TOUR=1`) signs in as the agency, a designer and the SABRE client, and opens every route each
   role can reach, a design in the viewer, the Playground and the notifications popover, at
   1600 × 1000 and 390 × 844. For each surface it saves a full-page screenshot and records console
   errors, uncaught exceptions, failed requests, horizontal overflow and serious or critical axe
   violations in `outputs/system-tour/<role>/report.json`. The screenshots are not committed.
2. **Every action.** The whole Playwright suite drives each role's actions against real persistence
   and row-level security.
3. **Logic.** The unit suites (`npm run check`) and every pgTAP file.
4. **Review.** Each screenshot was inspected. Findings were fixed test-first where they were logic,
   re-captured where they were layout, and the affected browser specs were re-run.

## Results

Final runs, after every fix below:

| Check | Result |
| --- | --- |
| System tour (`SYSTEM_TOUR=1`), agency | 61 surfaces, none with a console error, uncaught exception, failed request, overflow or serious/critical axe violation |
| System tour, designer | 49 surfaces, none flagged |
| System tour, SABRE client | 49 surfaces, none flagged |
| Whole browser suite | 85 passed, 3 skipped (the tours), 5 failed on the overlay's counts only (see below) |
| `npm run check` | 75 files, 863 tests |
| `npm --prefix apps/media test` | 70 of 70 |
| `supabase test db` | 21 files, 456 tests; only `access_and_workflows.test.sql` fails, on its six known overlay assertions (2, 4, 9, 18, 32, 54) |

The suite's passing scenarios cover, for the roles each applies to: the five board views and their
persistence, briefing intake from draft to budget acceptance, credits, client creation and presets,
Brand Hub editing, folders, assets and downloads, Files, reviews, private and client feedback with
pins, publication and delivery, video upload and processing, Playground boards and albums, bulk image
drop, team management and removal, notifications, client switching and navigation, the Content
Security Policy, console quietness on every surface, and the new competitor ads widget.

## Findings and fixes

| Area | Finding | Fix |
| --- | --- | --- |
| Reviews | A client's **Waiting for you** listed versions they had already answered | Only versions awaiting their decision; **With the studio** holds the rest (`7918b48`) |
| Settings | Preset estimates read "12–12 credits" and "1 days" | The briefing editor's own wording (`58f8bf7`) |
| Briefings | The summary's overview had no label, and its fields ran together | A labelled description list (`318dadf`) |
| Workspace | A designer who opened Credits or New briefing by URL saw bare text under the header | One shared studio-managed notice in the empty-state card (`8b79be0`) |
| Header | After the credit balance chip was added, the client's name shrank to one letter at tablet width and the phone header grew a third row | Board and client pages move the links to a second row below a 980px board (700px on short screens); project pages keep one row down to 700px; phone links wrap at their widths; the chip steps aside on phones (`003272e`, `523c41b`) |
| Forms | "(optional)" markers fell onto their own line | Label text and marker grouped (campaign dialog, briefing editor, competitor form) (`04d511e`) |
| Files | Every file showed a generic IMAGE tile, documents were called images, a shared video was typed PNG, and footers did not line up | Real image previews through ten-minute signed URLs, real type names, the shared design's type from its file, aligned footers (`f4fe18d`) |
| Notifications | The bell and the page counted unread items among the latest 100 loaded: the agency read "100 waiting" with 271 unread | An exact head-only unread count, and "Showing the latest 100." when the page is capped (`c4292c9`) |
| Brand Hub | The Logos page held only text and a link | The client's logo files, previewed as on Assets (`e25a1ee`) |
| Playground albums | A disabled thumbnail's reason was hover-only; at the 500-item cap a drag did nothing | Visible reason on focus and hover; the cap's message (`610b7e4`) |
| Test harness | React 19.2's development build throws "… cannot have a negative time stamp" after some client-side navigations, failing the demo scenarios | One shared filter for that development-only message (`0c5203d`) |

The user's new **Competitor ads** widget was built and verified in the same session; see its
[record](competitor-ads-2026-09-24.md).

## Expected failures

Five browser scenarios assert the canonical dataset's counts (25 projects, seven SABRE projects), and
the SABRE demonstration overlay has 68 and 50. They fail on those counts only, as the project rules
require, and their assertions were not weakened: `canonical-workspaces`, `design-audit` ("representative
task surfaces…"), `workspace-actions` ("board views, filters…") and both `workspace` scenarios.
`access_and_workflows.test.sql` fails its six known overlay assertions for the same reason.

## Kept on purpose

- The board opens fitted to every campaign, down to 40% zoom, as documented; the List view is the
  reading surface.
- The notification feed lists the latest 100 items without pagination (earlier product decision); the
  count above it is now exact.

## Environment note

From about 04:10 the Next.js development server kept serving a stylesheet compiled at 04:03, even after
a restart: Turbopack's disk cache had stopped noticing CSS changes. It was restarted on the same port
and log after clearing `apps/web/.next/dev/cache`. The first full suite run used the committed state of
that time; every CSS change after it was re-verified on the restarted server.

## Data observations, not changed

- `workspace_settings.studio_name` is **Offline probe**, left by an earlier test and preserved by earlier
  sessions; the default is "Dawes Studio". Settings → Studio changes it.
