# Acceptance family D — shell, navigation, search, and board

Measurement pass for rows **D01–D10** of [`docs/architecture/acceptance-matrix.md`](../architecture/acceptance-matrix.md).
This is evidence, not repair: no application code, CSS, data module, migration or existing test was
changed while producing it.

| Field | Value |
|---|---|
| Date | 2026-09-21 |
| Branch | `main` at `53f8819` |
| Application under test | `http://localhost:3003`, container image `2026-09-21T12:30:40Z` built from branch head `2026-09-21T12:30:08Z` |
| Backend | `supabase_db_dawes-studios` (local Docker stack) |
| Driver | A throwaway Playwright probe, `apps/web/tests/e2e/evidence-probe-family-d.spec.ts`, deleted after the run. Every measurement below is a line it printed. |
| Accounts | `studio@dawes.local` (agency), `designer@dawes.local` and `designer2@dawes.local` (designer), `sabre@client.dawes.local` (client), from `tests/e2e/test-support.ts` |
| Fixtures | `createProductionFixture` / `cleanupTestProject` (`tests/e2e/project-fixture.ts`) for every mutation |
| Result | **10 of 10 Verified.** D08 was initially Unverified — see [Defect D-1](#defect-d-1), fixed and re-verified in the same pass. |

Reference identifiers used throughout: SABRE `e4401a17-cbe2-1d70-400d-d40f9e6b8632` (7 projects),
Acme `f69a2150-613b-3883-906c-738e84007117` (2 projects).

## What the existing specs already proved

Before re-proving anything, the three specs that touch family D were run against this build; all six
tests passed in 28.5 s.

| Spec | Rows it partly covers | What it already establishes |
|---|---|---|
| `tests/e2e/workspace.spec.ts` | D01, D05 | Agency lands on ten workspace cards and opens a live xyflow project canvas; the client lands on its own board, sees no `Studio settings`, no designer identity and no card grips. It does **not** exercise the designer role, deep links, or a forbidden destination. |
| `tests/e2e/workspace-actions.spec.ts` | D03, D04, D05, D06, D07, D08 | `Meta+K` → `/search`, the no-results state, a forced 503 with `Try again`, and a selected result opening a project; canvas/list/kanban/timeline switching with `Today` and the scale control; a status filter emptying the board and `Clear filters` restoring it; campaign creation with an inverted date range rejected then accepted; card drag persisting `board_position` across a reload; one click selecting and two opening, on the card and in the calendar lane; a client marking one notification read and it staying read across a reload. It runs **one** session per assertion, does not search as a designer or a client, does not check that a created campaign is visible, and does not test a forbidden transition. |
| `tests/e2e/production-workflow.spec.ts` | D10 (allowed half) | The full permitted status chain through the UI — changes requested → approved → delivery file → `delivered` confirmed in the database. |

Everything below is what this pass added.

---

## D01 — Role-dependent landing and navigation, with deep-link checks

**Required evidence:** three authenticated browser sessions and deep-link checks.

**What was done.** Three independent browser contexts signed in simultaneously as agency, designer and
client. Each one's landing URL, page heading and sidebar composition was read, then each was sent by
URL to destinations its role should not reach.

**Landing and shell, measured:**

| | Agency | Designer | Client |
|---|---|---|---|
| Landing URL | `/home` | `/home` | `/clients/e4401a17…/board` |
| `<h1>` | `Overview` | `My work` | (board identity: `SABRE`) |
| Clients in sidebar | 10 | 10 | 1 |
| `Studio settings` link | 1 | 0 | 0 |
| `Team` link | 1 | 0 | 0 |
| Client destination tabs | Board, Briefings, Reviews, Files, Brand Hub, **Credits** | Board, Briefings, Reviews, Files, Brand Hub | Board, Briefings, Reviews, Files, Brand Hub, Credits |

The designer seeing ten clients is not a leak. `private.can_access_client` admits a designer for any
client they hold an assignment in, and both seeded designers are assigned across all ten workspaces
(`Alex Morgan` 12 projects / 10 clients, `Jordan Reed` 13 / 10). The board itself is still narrowed:
on Acme the agency's board reports `2 projects` and the designer's reports `1 project`, with
`New briefing` absent (0) and no drag grips (0).

**Deep links, measured:**

| Role | Destination | Result |
|---|---|---|
| designer | `/settings` | `Studio settings are private.` |
| designer | `/settings/team` | `Studio settings are private.` |
| designer | `/clients/{sabre}/credits` | `Credits are managed by the studio.` |
| designer | `/clients/{sabre}/briefings/new` | `Briefings are managed by the studio.` |
| designer | `/clients/{acme}/board` | `Acme` — allowed, and narrowed to the 1 assigned project |
| designer | `/projects/{unassigned acme project}` | `Project unavailable.` |
| client | `/settings` | `Studio settings are private.` |
| client | `/settings/clients` | `Studio settings are private.` |
| client | `/clients/{acme}/board` | `Board unavailable.` |
| client | `/clients/{acme}/credits` | `Credits unavailable.` |
| client | `/clients/{acme}/briefings` | `Briefings unavailable.` |
| client | `/projects/{acme project}` | `Project unavailable.` |

No forbidden destination rendered another tenant's data; each refusal is a page, not a blank screen.

**Verdict: Verified.**

## D02 — Navigation preserves selected context

**Required evidence:** keyboard and pointer navigation; reload / back / forward / context change.

**What was done.** As agency, starting on SABRE's board, the `Briefings` destination was reached by
keyboard (focus + `Enter`), then the sidebar's expanded client and active destination were read after
each of reload, back, forward, a context change to Acme, back again, a collapse/expand cycle, and a
mobile-width drawer open.

| Step | URL | Expanded client | Active destination |
|---|---|---|---|
| Board | `/clients/{sabre}/board` | SABRE | Board |
| Keyboard `Enter` on Briefings | `/clients/{sabre}/briefings` | SABRE | Briefings |
| Reload | `/clients/{sabre}/briefings` | SABRE | Briefings |
| Back | `/clients/{sabre}/board` | SABRE | Board |
| Forward | `/clients/{sabre}/briefings` | SABRE | Briefings |
| Context change → Acme | `/clients/{acme}/board` | Acme (expanded count 1) | Board |
| Back | `/clients/{sabre}/briefings` | SABRE | Briefings |
| Collapse sidebar | — | — | Briefings |
| Expand sidebar | — | — | Briefings |
| Mobile drawer (600 px) | — | SABRE | Briefings, focus trapped inside `#workspace-navigation` = `true` |
| `Escape` | `/clients/{sabre}/briefings` | — | — |

Exactly one client entry is expanded at a time. The clientless route `/projects/{id}` still resolves
its workspace: the sidebar showed one expanded entry, SABRE.

**Verdict: Verified.**

## D03 — Global Search

**Required evidence:** search known/unknown terms as all roles; keyboard journey.

**What was done.** For each of the three roles, from `/notifications`: `Ctrl+K`, then a known
in-scope term, a known out-of-scope term, a client name, an unknown term, a forced backend outage,
recovery, and a keyboard-activated result. Probe terms were the real seeded titles
`Instagram Ads` (SABRE) and `Acme / AI-Enhanced Add-On` (Acme).

| | Agency | Designer | Client |
|---|---|---|---|
| `Ctrl+K` | → `/search`, focus on `Search your workspace` | same | same |
| `"Instagram Ads"` | 2 (Project, Briefing) | **0** | 2 (Project, Briefing) |
| `"Acme / AI-Enhanced Add-On"` | 2 | 0 | **0** |
| `"Acme"` | 5 (Client, Project×2, Briefing×2) | 2 (Client, Project) | **0** |
| Unknown term | `No matches yet.` | `No matches yet.` | `No matches yet.` |
| Forced 503 on `/rest/v1/projects` | `We couldn't complete the search.` | same | same |
| `Try again` after the outage lifts | 2 results | 2 results | 2 results |
| Keyboard `Enter` on the first result | `/projects/aea0ccab…` | `/clients/f69a2150…/board` | `/projects/aea0ccab…` |

The client search returned nothing for either the Acme project title or the client name `Acme`; the
designer returned nothing for the SABRE project they are not assigned to. Scoping is enforced by RLS
on `clients` / `projects` / `briefings` / `brand_assets`, not by the query, and the results confirm
it. Recovery is genuine: the outage response was served for a query key the page had not already
resolved, so `Try again` performed a real refetch.

**Verdict: Verified.**

## D04 — Notifications reflect actual recipient events

**Required evidence:** perform source mutation, inspect event, mark read, reload and recheck.

**What was done.** On a fresh `createProductionFixture` project, the agency posted a message on the
*client* channel through the project UI. The stored rows were read directly, then the client session
inspected the bell, the list item, marked it read, reloaded and opened the destination.

- Before the mutation the fixture project carried 2 notifications (`Your project is ready`,
  `New project assignment`).
- After the mutation a third row existed:
  `title = "New message from Studio"`, `user_id = 0023953f…` (the SABRE client member),
  `client_id = e4401a17…`, `project_id` = the fixture project, `read_at = null`.
- Client bell before reading: `aria-label = "Notifications, 6 unread"`, class contains `has-unread`.
- The list item for that project showed `New message from Studio` with the `unread` class.
- After `Mark … as read`, the row's `read_at` was set to `2026-09-21T14:15:07.559+00:00`.
- After a full reload the item was **not** unread and the bell read `Notifications, 5 unread`.
- Opening the item navigated to `/projects/{fixture}` and rendered the project heading — an
  authorized destination, not a dead link.
- An unrelated designer (`designer2@dawes.local`) queried the same `project_id` and saw **0** of
  these events.

**Verdict: Verified.**

## D05 — Board uses xyflow; pan / select / zoom / fit; no drag-click confusion

**Required evidence:** runtime component inspection and interaction/browser evidence.

**Runtime inspection** of SABRE's board (`.board-canvas`):

```
className "react-flow light"; pane true; viewport true; controls true; background true
node types: react-flow__node-planning, -campaign, -project, -briefingSlot, -addCampaign
project nodes 7; campaign frames 3
```

`@xyflow/react@^12.11.6` is the declared dependency in `apps/web/package.json`; the DOM above is that
library's, not a facsimile.

**Interactions**, read from the live `.react-flow__viewport` transform:

| Gesture | Transform before → after |
|---|---|
| Drag on an empty pane point (1588, 988) | `matrix(0.508922,0,0,0.508922,24,24)` → `…,-96,-66` |
| Wheel (pan-on-scroll, vertical) | `…,-96,-66` → `…,-96,-186` |
| Zoom in control | scale `0.508922` → `0.610706` |
| Zoom out control | back to `0.508922` |
| `Fit board to view` | → `matrix(0.508922,0,0,0.508922,24,24)`, differing from the panned state |

The first pan attempt, started at the canvas's bottom-left corner, moved nothing because that point
is covered by the Planning frame rather than the pane. The probe therefore locates a real pane point
with `document.elementFromPoint` before dragging; this is a probe correction, not a product finding.

**Drag versus click** (the substantive clause), on a project card:

| Gesture | Outcome |
|---|---|
| Single click on the card body | `aria-current="true"`; URL unchanged at `/clients/{sabre}/board` |
| 2 px pointer jitter on the drag grip | `board_position` **unchanged**; URL unchanged — the 4 px `nodeDragThreshold` holds |
| 90 × 50 px drag on the grip | `board_position` **changed** and persisted; **no** navigation |
| Double click on the card body | opened `/projects/c4737460-ac76-a16f-c89c-e192eb80ca4d`, the card's own project |

The seeded `board_position` was restored immediately afterwards and confirmed written without error.

**Verdict: Verified.**

## D06 — Timeline, Today, Kanban and List agree

**Required evidence:** cross-view record/date/status comparison and interactive check.

The same seven SABRE records were read from the database and then from each of the four views.

- Database scope: 7 projects. Canvas: `7 projects` counter, 7 `react-flow__node-project` nodes.
- Timeline at Quarter scale: 7 lanes — Product Story, Social Launch, Campaign Landing Page, Email
  Banner, Instagram Ads, Brand Guidelines, Stationery.
- Kanban: 7 cards across 7 columns — Planned 0, In progress 1, Studio review 2, In review 3,
  Changes requested 0, Approved 1, Delivered 0.
- List: 7 rows, each carrying the same status label and a due date matching the stored `due_date`
  (e.g. `Instagram Ads / In review / Sep 23` against `client_review / 2026-09-23`).

**Identity comparison, not merely counts:** the sorted project-ID sets agreed with the database in
all three machine-readable views — `canvas==db true; kanban==db true; list==db true`.

**Period navigation and Today:** opening window `Sep 21 – Oct 4, 2026` (fortnight, the smallest scale
containing the work); Quarter widens it to `Sep 21 – Dec 20, 2026`; `Next quarter` moves to
`Dec 21, 2026 – Mar 21, 2027`; `Today` returns exactly to `Sep 21 – Dec 20, 2026`.

**Planning collapses without losing data:** `Collapse planning` removed `#board-planning-body` and
the timeline while all 7 project cards stayed on the canvas; `Expand planning` restored the body with
7 Kanban cards and `Kanban` still `aria-pressed="true"` — the chosen mode survived the collapse.

**Verdict: Verified.**

## D07 — Filters combine, clear, and fail usefully

**Required evidence:** known fixture queries; clear filters and context-switch regression.

| Action | Result |
|---|---|
| Unfiltered SABRE board | `7 projects` (database: 7) |
| Search `Instagram Ads` | `1 project` |
| …plus Status = its true status (`client_review`) | `1 project` — the two filters intersect |
| …plus Status = `planned` (contradictory) | `0 projects` |
| Empty state | `No projects match. / Try a different search or clear your filters. / Clear filters` |
| Campaign = `Brand Essentials` (no search) | `2 projects`; database agrees (2); filter indicator dot present |
| `Clear filters` | `7 projects`, search box empty, indicator gone |
| Navigate to Acme's board with a SABRE search still typed | `2 projects`, search box empty — filters do not leak across workspaces |

Note for future probes: the filter menu dismisses itself on any pointer press outside it, so it must
be reopened between a select and a search edit.

**Verdict: Verified.**

## D08 — Campaign creation

**Required evidence:** persisted create journey and invalid dates / cross-client rejection.

**What passed.**

| Check | Result |
|---|---|
| Empty name | Dialog stays open; the native `required` input reports invalid |
| End before start (`2026-11-30` → `2026-11-01`) | `The end date must be on or after the start date.`; dialog stays open; **0** rows persisted |
| Corrected range | Row stored with `client_id` = SABRE and the exact dates submitted |
| Client creating a campaign inside `/briefings/new` | Control present; the same inverted-date message is raised; the corrected campaign is stored against SABRE and auto-selected in the brief |
| Client inserting a campaign into Acme via the API | `42501 new row violates row-level security policy for table "campaigns"`, 0 rows |
| Client inserting into its own client | Allowed, 1 row (removed afterwards) |
| Designer inserting a campaign at all | `42501`, 0 rows |

**What failed.** The row also asserts the creator *"sees an empty campaign"*. They do not — see
[Defect D-1](#defect-d-1) below.

**Verdict at the time of this measurement: Unverified.** Validation, persistence and cross-client
rejection are all proven; the "sees an empty campaign" clause is contradicted by the measurement and
must not be marked off. Defect D-1 was subsequently fixed and re-verified in browser — see the
[Fix](#fix) subsection under Defect D-1. **Current verdict: Verified.**

## D09 — Campaign context is confirmed, never inherited

**Required evidence:** create two briefs under different contexts and inspect stored campaigns.

SABRE offers three campaigns: `Brand Essentials`, `Everyday Confidence`, `Summer Safety`.

| Brief | Campaign preselected on arrival | Campaign chosen | Stored `campaign_id` | Matches |
|---|---|---|---|---|
| 1 | `""` (the `Choose a campaign` placeholder) | Brand Essentials | `97109ca1-1986-84a5-8942-97ed711aee2f` | yes |
| 2 | `""` | Everyday Confidence | `0571d461-f5ad-70d6-9f56-c8fba1dce09c` | yes |

The two drafts were saved through the UI and read back directly from `public.briefings`; they carry
different campaigns and the correct `client_id`.

**The inheritance check.** A third brief opened immediately after saving brief 2 — same session, same
client, no reload — showed `campaign preselected = ""`, i.e. `inherited = false`. The same held after
a full route reload. `initialDraft` in `briefing-model.ts` returns `campaignId: ""` for a new brief
and there is no draft carried in storage, which is what the measurement confirms at runtime.

**The refusal.** Attempting `Review briefing` without confirming a campaign produced the validation
list `Choose or create a campaign. | Describe what you would like to create. | Complete "What needs
to be enhanced?".` and **no** briefing row was persisted for that title.

**Verdict: Verified.**

## D10 — Status changes respect role and workflow prerequisites

**Required evidence:** allowed and forbidden transitions via UI and direct command.

**The interface offers no transition at all.** A Kanban card carries `draggable = null`, there are
**0** drag grips and **0** status controls inside `.kanban-board`. A simulated pointer drag from the
first column to the sixth changed nothing: all eight statuses on the board (seven seeded plus the
fixture) were identical afterwards. `board-kanban.tsx` documents this deliberately — `status` is
absent from the only column grant on `public.projects`, so a drag-to-transition control could only
fail at the database.

**Forbidden direct commands.** Every role was made to attempt a direct PostgREST write of
`status` on the fixture project:

| Role | `approved` | `delivered` | `client_review` |
|---|---|---|---|
| agency | `42501 permission denied for table projects` | same | same |
| designer | `42501 permission denied for table projects` | same | same |
| client | `42501 permission denied for table projects` | same | same |

Nine attempts, nine refusals, zero rows; the project's status was still `planned` afterwards. The
grant is `grant update(title,description,due_date,start_date,board_position) on public.projects`
(`supabase/migrations/202609200001_foundation.sql:259`) — `status` is not in it, for anyone.

**Forbidden workflow commands.**

| Command | agency | designer | client |
|---|---|---|---|
| `mark_project_delivered` on a non-approved project | `Approve all deliverables before delivery` | `Agency access required` | `Agency access required` |
| `publish_version` | (not attempted — the authorized role) | `Agency access required` | `Agency access required` |
| `submit_design_version` | — | — | `Production access required` |
| `review_publication` on a seeded publication | — | `Client review access required` (both designers) | — |

Delivery cannot be forged even by the agency without the approval and the delivery file; publication
and client approval cannot be forged by the roles that do not own them. No seeded publication was
mutated: only roles that must be refused were exercised against it.

**Allowed transitions.** The permitted path is already proven end to end by
`tests/e2e/production-workflow.spec.ts`, re-run green against this build: changes requested →
approved → delivery file added → `delivered` asserted in the database. This probe additionally
observed the fixture project moving `planned → in_progress` as a side effect of
`create_design_version`, i.e. through the intended route rather than a direct write.

**Verdict: Verified.**

---

## Defect D-1 — a newly created campaign is hidden by the filter the creation applies

**Severity:** Medium. It blocks D08's stated outcome and makes a successful create look like a
failure.

**Where:** `apps/web/features/board/board-page.tsx` (`CampaignDialog … onCreated={setCampaign}`),
`apps/web/features/board/board-canvas-nodes.ts` (`keepEmptyCampaigns: canCreate`),
`apps/web/features/board/board-layout.ts:228`.

**What happens.** `CampaignDialog`'s `onCreated` callback sets the board's **campaign filter** to the
campaign just created. That makes `filtered` true. `buildStack` keeps an empty campaign frame only
when `(grouped.get(campaign.id)?.length ?? 0) > 0 || (!input.filtered && input.keepEmptyCampaigns)`
— so as soon as a filter is active, empty campaigns are dropped. The one campaign the filter selects
is empty by definition, so every frame disappears.

**Reproduction.**

1. Sign in as `studio@dawes.local` and open `/clients/e4401a17-cbe2-1d70-400d-d40f9e6b8632/board`.
2. Press `Add a campaign`. Enter any name, `Start date` `2026-11-30`, `End date` `2026-12-15`.
3. Press `Create campaign`. The dialog closes and the row is written correctly.

**Observed.** The counter reads `0 projects`, there are **0** `.react-flow__node-campaign` frames and
**0** project cards, and the canvas shows:

> No projects match. Try a different search or clear your filters. **Clear filters**

Screenshot: [`screenshots/acceptance-d08-empty-campaign.png`](screenshots/acceptance-d08-empty-campaign.png).

**Expected.** The new campaign's own frame, empty, as the row requires.

**Proof that the campaign really exists.** Opening `Filters` and setting `Campaign` back to
`All campaigns` immediately shows four frames — `Everyday Confidence`, `Summer Safety`,
`Acceptance probe campaign …`, `Brand Essentials` — including the new one. The campaign was created;
only its presentation is wrong.

**Secondary reading.** The empty state's copy is also wrong for this situation: nothing has been
searched and no project *should* match a brand-new campaign, so "No projects match / Try a different
search" describes a failure the viewer did not cause.

No fix was applied. This belongs to whoever owns `features/board`.

### Fix

**Shape chosen.** `StackInput` (`apps/web/features/board/board-layout.ts`) gains one new, optional
field: `selectedCampaignId?: string`. `buildStack`'s campaign filter becomes

```ts
const ordered = orderCampaigns(input.campaigns).filter(
  (campaign) =>
    (grouped.get(campaign.id)?.length ?? 0) > 0 ||
    (!input.filtered && input.keepEmptyCampaigns) ||
    campaign.id === input.selectedCampaignId,
);
```

`useBoardCanvasNodes` (`board-canvas-nodes.ts`) takes the same field and passes it straight through;
`BoardPage` (`board-page.tsx`) supplies it as `campaign || undefined` — the board's own campaign-filter
state, the same value `CampaignDialog`'s `onCreated={setCampaign}` already writes.

**Why a campaign id rather than a narrower boolean.** The task description offered a choice between
threading the id or a narrower flag. A boolean such as `justCreated` would only cover the creation
path this defect was found on; it would still hide the frame if the viewer manually picked an
existing empty campaign from the filter dropdown, which is the same bug by a different door. The
board already carries exactly one piece of state that names "the campaign the viewer is looking at"
— the filter's own value — so passing that id through is not new state, only a new use of state that
already existed. It also composes correctly with the constraint that must not regress: a search or
status filter narrows `filteredProjects` before `buildStack` ever sees them, so an empty campaign that
was **not** named by the selection still fails every clause in the `ordered` filter and still
collapses. The id only ever rescues the one frame the viewer explicitly named.

**Copy fix.** `board-nodes.tsx`'s `NoticeFrame` and `board-page.tsx`'s list-mode empty state both
gained a second input — `hasSearch` (canvas) / the existing `search` string (list) — and now read:

```
filtered
  ? hasSearch
    ? "Try a different search or clear your filters."
    : "Try a different filter or clear your filters."
  : "Start with a briefing. We’ll take it from there."
```

One word changes (`search` → `filter`) when the active filter is a campaign or a status rather than
typed text; the heading, the button and the unfiltered copy are untouched. No new strings were added.
With the `selectedCampaignId` fix in place this particular notice no longer fires for a freshly
created campaign at all — the campaign's own (now-empty) frame renders instead — but the corrected
copy still matters for a status filter that matches nothing, which never went through search either.

**Test added.** `board-layout.test.ts`, immediately after the existing "keeps a freshly created empty
campaign visible while unfiltered" case: `"keeps the just-selected campaign visible even though
selecting it is what filtered the board"` (`filtered: true, selectedCampaignId: "c2"`, campaign `c2`
holds no projects, its frame is still present) and `"still collapses an unselected empty campaign
when a search matches nothing"` (`filtered: true, selectedCampaignId: "c2"`, `projects: []` — campaign
`c1`, which was not selected, is dropped; only `planning` and `campaign:c2` remain). Both are new
cases; no existing test in the file was touched.

**Browser verification.** `next dev --port 3011` was started against the same local Supabase stack
the container at `:3003` uses (`apps/web/.env.local`, unchanged). Signed in as `studio@dawes.local`,
opened SABRE's board (`7 projects`, 3 campaign frames — the pre-fix baseline), pressed `Add a
campaign`, and created "D-1 fix verification campaign" (`2026-11-30` → `2026-12-15`). The dialog
closed and the board rendered — without a reload — the new campaign's own frame: heading "D-1 fix
verification campaign", count `0`, dates `Nov 30 – Dec 15`, and its `New briefing` slot; the header
read `0 projects`; there was no `No projects match` notice anywhere on the canvas. Screenshot:
[`screenshots/acceptance-d08-fix-empty-campaign-visible.png`](screenshots/acceptance-d08-fix-empty-campaign-visible.png).
The campaign (`f8091f59-5097-4ffd-b6ea-d3d9db6476a7`) was deleted directly from `public.campaigns`
immediately afterwards. `npm run check` was green at 432 tests across 30 files (430 before this pass,
plus the two new cases above). The dev server was stopped and port 3011 confirmed free.

## Observation O-1 — pre-existing drift in `designs` and `design_versions`

Not a family-D finding, recorded because it was noticed while verifying the dataset.

Row B10 records the pristine baseline as `design_versions 41, designs 46`. The live database holds
**44** and **47**. The three extra versions and one extra design all belong to the seeded SABRE
project `Social Launch` (`c4737460-ac76-a16f-c89c-e192eb80ca4d`) and were created at
`2026-09-21T02:42:11Z`–`02:42:24Z`, roughly eleven hours before this session began. There are zero
orphaned `designs` or `design_versions`. This pass did not create them and has not removed them.

## Dataset integrity

Counted immediately before and immediately after the full probe run, plus the run of the three
existing specs:

| Table | Before | After |
|---|---|---|
| `clients` | 10 | **10** |
| `projects` | 25 | **25** |
| `campaigns` | 12 | **12** |
| `briefings` | 30 | **30** |
| `notifications` | 15 | **15** |
| `designs` | 47 | 47 |
| `design_versions` | 44 | 44 |

Rows whose name or title begins with `Acceptance`: `clients 0, projects 0, campaigns 0,
briefings 0`. The seeded `board_position` moved by the D05 drag was restored and verified.

```bash
docker exec supabase_db_dawes-studios psql -U postgres -d postgres -tAc "select count(*) from public.clients"   # 10
docker exec supabase_db_dawes-studios psql -U postgres -d postgres -tAc "select count(*) from public.projects"  # 25
```

## Probe disposal

`apps/web/tests/e2e/evidence-probe-family-d.spec.ts` was deleted after the run. No existing spec was
modified. The only file this pass adds under `apps/web/` is none.
