# SABRE populated demonstration - September 23, 2026

## Authorized result

The user requested about 50 SABRE projects with images, varied deliverables and complete related
data for testing and an agency demonstration, and confirmed that every current client is test data.
The local overlay is complete and remains active: **50 SABRE projects, 10 clients, 68 total projects**.
It adds 43 projects and enriches the original seven. The canonical seed remains unchanged.
See the [demonstration guide](../../supabase/demo/sabre/README.md) for the walkthrough and commands.

The [inventory](sabre-demo-inventory-2026-09-23.json) records 12 campaigns, 82 deliverables in 24
formats, 126 working versions, 176 working designs, 92 published versions and 131 published designs.
Stages: six in progress, seven in studio review, 14 in client review, seven with changes requested,
ten approved and six delivered. There are 58 briefings, a reconciled 463-credit balance, three
credit-request outcomes, populated Brand Hub sections/assets/templates, private template drafts,
internal reference files and three role-specific project Playgrounds.

Eight original photos were generated using the built-in image-generation tool; exact prompts and
source PNGs are preserved in the demo package. Local HTML/CSS layouts generated 158 image previews,
56 document previews and five 15-second motion previews. These are fictional demonstration
concepts. New snapshots pass through the existing agency publication/media flow. All 50 projects
have working artwork; projects without a publication retain private production files. One original
published design has no file and retains its original content-based presentation.

## Checks executed in this session

| Check | Result |
| --- | --- |
| Single-project real workflow canary and actual removal | Passed; all 35 public-table digests and all 183 original file hashes exactly restored |
| Python overlay/rollback regression suite | 6 passed |
| Read-only HTTP/data/Storage verification | 29 passed |
| Browser demonstration suite | 5 passed, final run 24 seconds |
| Web source gate | 590 tests / 49 files; typecheck, lint and formatting passed |
| Final browser-test type/lint checks | Passed after the last test-only addition |
| Re-running completed `apply` | No database or Storage changes |
| Complete-overlay guarded removal dry run | Passed without changing the populated workspace |
| Syntax, whitespace and instruction synchronization | Passed |

The [canary evidence](sabre-demo-canary-2026-09-23.json) records the reversible end-to-end workflow.
It used client briefing submission, agency budget/acceptance, one atomic project debit, assigned
designer production, trusted publication preparation, agency publication, client approval,
sanitized final files and delivery. Historical dates need a fixture backfill because normal
acceptance starts projects today; the billing/publication workflows were not bypassed.

The [HTTP evidence](sabre-demo-http-2026-09-23.json) verifies exact counts, one debit for each new
project, balance reconciliation, valid dates, intake states, all 50 working-artwork relationships,
both designers' exact assignment visibility, client production-table denial, private draft and
Playground boundaries, and direct private Storage denial. The actual client downloaded all 130
file-backed published images/videos and all ten released delivery files. The other 24 prepared
final files remain staged and hidden from clients until the approved projects are delivered.
All 183 original objects retain their SHA-256 hashes. All 35 original whole-table digests reconcile
when the intentional SABRE changes are replaced with the saved original SABRE rows in a read-only
query, proving unrelated records and the other nine clients remain unchanged.

Browser coverage includes agency/client across five views at 1600px and 390px, 50 project rows and
canvas nodes, viewport containment, and zero axe violations on all 20 board surfaces. It also
opens three production/review examples per role, checks loaded photography, four version cards
for a two-deliverable revision project, plays the actual 15-second media, verifies client creation
controls/internal requests are absent, visits seven related destinations, waits for Brand Hub
photography and opens the existing role-specific Playground. A designer opens assigned working
files at desktop/mobile sizes without agency publishing controls. No page exceptions occurred.
Board preferences are restored after presentation tests.

## Visual evidence and limits

Representative screenshots were inspected for board composition, populated Kanban, mobile
Calendar, multi-version project canvas, Brand Hub photography, Files and Playground:

- [Agency canvas](screenshots/sabre-demo-agency-canvas-1600.png)
- [Client Kanban](screenshots/sabre-demo-client-kanban-1600.png)
- [Mobile client Calendar](screenshots/sabre-demo-client-calendar-390.png)
- [Client project revisions](screenshots/sabre-demo-client-project-campus.png)
- [Brand Hub photographs](screenshots/sabre-demo-agency-brand-assets.png)
- [Client Playground](screenshots/sabre-demo-client-playground.png)

All 56 rendered PDF previews were checked to contain one page; a print PDF was independently
rasterized with Poppler and visually inspected, alongside image, mobile-web and email layouts.
The Files screen retains the application's existing file-type cards; actual downloads were
verified separately. MP4 previews demonstrate playback/review; the application still does not
sanitize video/ZIP final-delivery packages. No such delivery capability is claimed here.

This is a local demonstration, not a production release or a re-run of the full canonical acceptance
matrix. No schema change, reset, backend restart, password change, external message, commit or
deployment occurred. Preserve the ignored before/after checkpoint. Guarded removal refuses newer
SABRE edits; review them before any later cleanup. Canonical suites asserting seven SABRE projects
should run on their original baseline, not be weakened for this optional overlay.
