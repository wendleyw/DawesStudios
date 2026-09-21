# Audit — J03, J04, J08, J09

Measurement pass on branch `main`, 2026-09-21. **No code was changed.** Findings are read from
rendered copy and actual component/stylesheet usage in `apps/web`, not inferred from file structure.

Severity:

- **High** — the same record shows different values or meanings in two places, which misleads a real
  user.
- **Medium** — terminology or component drift that confuses.
- **Low** — cosmetic copy or token slip.

Out of scope by instruction, and not re-reported: the 16 feature-named rules that remain in
`globals.css`, the disjoint-selector guarantee enforced by
`apps/web/features/shared/stylesheet-boundary.test.ts`, and the seven primitives
`apps/web/features/shared/README.md` records as deliberately rejected.

| Row | High | Medium | Low | Total |
| --- | ---- | ------ | --- | ----- |
| J03 |    0 |      3 |   2 |     5 |
| J04 |    3 |      7 |   7 |    17 |
| J08 |    0 |      5 |   1 |     6 |
| J09 |    0 |      3 |   2 |     5 |

---

## J04 — Logic and terminology agree across surfaces

This is the highest-value row, so it is reported first.

### Terminology table

One row per domain concept, every term the product uses for it, and where.

| Concept | Terms in use | Where |
| ------- | ------------ | ----- |
| A client organisation | **Workspace** | `features/workspace/app-shell.tsx:251` (`WORKSPACES` nav label), `features/workspace/workspace-data.ts:256` (`type: "Workspace"` search result), `features/workspace/home-page.tsx:82` ("Your workspaces"), `:118` (`WORKSPACE` column header), `features/board/board-page.tsx:253` ("This workspace is unavailable"), `features/assets/assets-page.tsx:68` |
| | **Client** | `features/settings/settings-page.tsx:17` (`clients: "Clients"` tab), `features/workspace/home-page.tsx:94` ("New client"), `:160` ("Client workspaces"), `features/projects/project-page.tsx:231` ("Shared with client") |
| | **Client workspace** | `features/workspace/app-shell.tsx:350` (client role label), `features/workspace/home-page.tsx:41`, `:160` |
| The studio's own account | **Workspace** | `features/settings/settings-page.tsx:15` (`workspace: "Workspace"` tab → `WorkspaceSettings`), `features/settings/workspace-settings.tsx:13`, `:17`, `:57`, `:86` ("Workspace updated.") |
| | **Studio** | `features/workspace/app-shell.tsx:306` ("Studio settings"), `:347` ("Studio team"), `features/settings/settings-page.tsx:28`, `:44` (`STUDIO ADMINISTRATION`) |
| Home route `/home` | **Overview** / **My work** / **Home** | `features/workspace/app-shell.tsx:169` (role-dependent), `features/workspace/home-page.tsx:79-82` |
| | **Back to your work** | `features/board/board-page.tsx:255`, `features/projects/project-page.tsx:59`, `features/brand/brand-page.tsx:31`, `features/credits/credits-page.tsx:55`, `features/briefings/briefing-editor.tsx:36` |
| | **Open workspace** | `app/error.tsx:19`, `app/not-found.tsx:9` |
| A design file | **Design** | `features/projects/project-nodes.tsx:113` ("A space for your first design."), `:120` ("Add design"), `:129` ("+N more designs"), `features/projects/project-page.tsx:235` ("Shared designs") |
| | **Artwork** | `features/board/project-thumbnail.tsx:240` ("No artwork yet") |
| | **File** | `features/assets/assets-page.tsx:116` ("Working file"), `:146` ("All files"), `features/projects/project-page.tsx:225` ("Working files") |
| | **Asset** | `features/assets/assets-page.tsx:94` ("Project assets."), `features/brand/brand-assets.tsx:118` ("Add asset") |
| | **Deliverable** | `features/projects/project-page.tsx:246` ("All deliverables"), `features/credits/credits-page.tsx:402` |
| The `/assets` route | **Assets** (nav) / **Files unavailable.** (error) / **Gathering files…** (loading) / **Project assets.** (h1) / **THE FILES THAT MATTER** (eyebrow) / **Files & delivery** (inbound link) | `features/workspace/app-shell.tsx:175`, `features/assets/assets-page.tsx:67`, `:63`, `:94`, `:93`, `features/projects/project-details.tsx:160` |
| The brand route | **Brand Hub** | `features/workspace/app-shell.tsx:176`, `features/brand/brand-page.tsx:43`, `features/briefings/briefing-editor-details.tsx:292` ("From Brand Hub") |
| | **brand hub** (lower case) | `features/brand/brand-page.tsx:24`, `:28` |
| | **Brand direction** | `features/projects/project-details.tsx:153`, `features/workspace/home-page.tsx:161`, `features/briefings/briefing-editor-details.tsx:288` |
| | **BRAND RESOURCES** / **brand resources** | `features/brand/brand-page.tsx:42`, `features/workspace/search-page.tsx:27` |
| A brief document | **Briefing** | `features/briefings/briefings-page.tsx:51`, `features/workspace/app-shell.tsx:173`, and 40+ sites |
| | **Brief** | `features/briefings/briefing-detail.tsx:84` ("Continue shaping your brief"), `features/briefings/briefings-page.tsx:85` ("Accepted briefs") |
| An assigned designer | **Designer** | `features/projects/project-details.tsx:139` ("Assign a designer"), `:260` (field label), `:277` ("Assign designer") |
| | **Creative partner** | `features/projects/project-details.tsx:114` (h3), `:246` ("Assign a creative partner"), `features/workspace/app-shell.tsx:349` |
| A design version | **Version** | `features/projects/project-details.tsx:165`, `features/projects/project-nodes.tsx:41`, `features/reviews/reviews-page.tsx:89` (`V{n}`) |
| | **Revision** | Only as an internal optimistic-concurrency token (`features/projects/project-details.tsx:34`, `updateProjectDetails`); never user-facing. **No user-facing drift.** |
| A notification | **Notification** | `features/workspace/notifications-page.tsx:30`, `features/workspace/notifications-bell.tsx:19` |
| | **Update** | `features/workspace/notifications-page.tsx:36` ("N updates waiting for you."), `:47` ("Loading your updates…") |
| A credit | **credits** | `features/credits/credits-page.tsx:158`, `:397`, `:399`, `features/briefings/briefing-detail.tsx:95`, `:119`, `:246` |
| | **cr** | `features/briefings/briefing-detail.tsx:223`, `:227`, `:231`, `:235` |

---

### J04-1 — A version's status reads as a different label, in a different case, on three screens

**Severity: High**

`statusLabels` (`features/workspace/workspace-data.ts:285-293`) is the single label map for *project*
status and is used correctly everywhere it applies. *Design version* status has no label map at all:
three call sites render the raw database enum through `replaceAll("_", " ")`, and two of those sit
under a `text-transform: capitalize` rule.

Locations:

- `features/projects/project-nodes.tsx:43` — `{data.version.status.replaceAll("_", " ")}` in
  `<span className="version-state">`, styled by `features/projects/projects.css:126`
  (`text-transform: capitalize`).
- `features/reviews/reviews-page.tsx:99` — `{formatDate(row.date)} · {row.status.replaceAll("_", " ")}`
  in `<span className="review-date">`, styled by `features/reviews/reviews.css:50`
  (`text-transform: capitalize`).
- `features/projects/project-details.tsx:176` — same expression, no `capitalize`, so it renders
  lower case.
- `features/workspace/workspace-data.ts:269` — `description: item.status.replaceAll("_", " ")` for a
  briefing in the global search results, lower case, while the briefing's own page uses
  `briefingStatusLabels`.

Concrete inconsistency — the same state, three renderings on three screens:

| Surface | Renders |
| ------- | ------- |
| Board / project header (`statusLabels.changes_requested`) | `Changes requested` |
| Reviews list (`features/reviews/reviews-page.tsx:99` + `capitalize`) | `Changes Requested` |
| Version history (`features/projects/project-details.tsx:176`) | `changes requested` |

The version-only enum values fare worse: `submitted`, `reviewed` and `pending` have no label anywhere,
so the project canvas shows the bare token `submitted` next to a project badge that reads
`Studio review` for the same moment in the workflow.

Recommendation: add a `versionStatusLabels: Record<VersionStatus, string>` beside `statusLabels` and
drop both `text-transform: capitalize` rules.

### J04-2 — "Workspace" names two different records

**Severity: High**

The sidebar heading `WORKSPACES` (`features/workspace/app-shell.tsx:251`) lists *clients*, and the
search result type for a client row is literally `"Workspace"`
(`features/workspace/workspace-data.ts:256`). The Settings tab also called **Workspace**
(`features/settings/settings-page.tsx:15`) renders `WorkspaceSettings`, whose only fields are
`studio_name` and `timezone` (`features/settings/workspace-settings.tsx:25-26`, `:67`, `:76`) and
whose success message is `Workspace updated.` (`:86`).

Concrete inconsistency: an agency user who edits "Workspace" in Settings changes the *studio's* name,
but the ten rows under "WORKSPACES" in the same sidebar are ten *clients*. Both surfaces are one click
apart in the same shell.

Recommendation: rename the Settings tab and its copy to **Studio** (matching "Studio settings",
"Studio team" and `STUDIO ADMINISTRATION` already in the shell), leaving "workspace" to mean a client.

### J04-3 — The studio timezone setting changes one surface and is ignored by the rest

**Severity: High**

`features/settings/workspace-settings.tsx:76-84` offers every IANA timezone and persists it. Exactly
one render honours it:

- `features/workspace/notifications-page.tsx:69` — `timeZone: settings.data?.timezone ?? "UTC"`.

Every other date render either hard-codes UTC or uses the browser's zone:

- Hard-coded `timeZone: "UTC"`: `features/workspace/workspace-data.ts:300` (`formatDate`, the
  workhorse), `features/credits/credits-page.tsx:244`, `:327`,
  `features/briefings/briefing-summary.tsx:76`, `features/board/timeline-model.ts:75-94`.
- No `timeZone` at all, therefore browser-local: `features/projects/comment-panel.tsx:116`,
  `features/workspace/home-page.tsx:46`.

Concrete inconsistency: with the studio set to `America/Sao_Paulo`, a notification generated at
`2026-09-21T02:00:00Z` reads **Sep 20, 11:00 PM** on the notifications page, while the comment created
by the same action reads **Sep 21** in the project panel and the project's due date is formatted in
UTC regardless. Three regimes, one record.

Recommendation: route every date render through `formatDate` (and a sibling `formatDateTime`) and give
those functions the workspace timezone, so the setting either applies everywhere or is removed.

### J04-4 — A briefing badged "Budget confirmed" appears under the tab "Awaiting review"

**Severity: Medium**

`features/briefings/briefings-page.tsx:43-45` filters the `awaiting_review` tab with
`["awaiting_review", "budget_confirmed"].includes(item.status)`, while the row's badge at `:112-114`
renders `briefingStatusLabels[item.status]`, i.e. `Budget confirmed`
(`features/briefings/briefing-model.ts:139`).

Concrete inconsistency: the tab says **Awaiting review**; the row inside it says **Budget confirmed**.
There is no tab that isolates `budget_confirmed`, so the state that actually needs the agency's
"Accept & create project" action is hidden inside a tab that claims the opposite.

Recommendation: rename the tab to "With the studio" (the wording `briefing-detail.tsx:115` already
uses for this pair of states) or split `budget_confirmed` into its own tab.

### J04-5 — Five date formats for the same kind of value

**Severity: Medium**

`formatDate` (`features/workspace/workspace-data.ts:295-302`) is the shared formatter and is used by
board, kanban, timeline cards, project header, project details, briefings list, assets and reviews.
Five surfaces format dates without it:

| Location | Options | Renders |
| -------- | ------- | ------- |
| `features/workspace/workspace-data.ts:297-301` (`formatDate`) | `month: "short", day: "numeric"`, UTC | `Sep 21` |
| `features/credits/credits-page.tsx:242-246` | `month/day/year`, UTC | `Sep 21, 2026` |
| `features/briefings/briefing-summary.tsx:76` | `dateStyle: "long"`, UTC | `September 21, 2026` |
| `features/workspace/notifications-page.tsx:67-70` | `dateStyle: "medium", timeStyle: "short"`, studio tz | `Sep 21, 2026, 11:00 PM` |
| `features/projects/comment-panel.tsx:116` | `month/day`, **no timeZone** | `Sep 21` or `Sep 20` |
| `features/workspace/home-page.tsx:46-49` | `weekday/month/day`, **no timeZone** | `Monday, September 21` |

Concrete inconsistency: a briefing's due date renders `September 21, 2026` on the briefing summary and
`Sep 21` on the briefings list two clicks away — same column, same record.

Recommendation: export `formatDate`, `formatDateLong` and `formatDateTime` from the workspace data
module and remove all six ad-hoc `Intl.DateTimeFormat` constructions.

### J04-6 — Credit balance renders with two different units

**Severity: Medium**

Both surfaces read the same `credit_accounts.balance` row —
`features/credits/credit-data.ts:17` and `features/briefings/briefing-data.ts:145` — so the numbers
agree. The unit does not.

- `features/credits/credits-page.tsx:155-159` — label `Available balance`, value `{balance}` followed
  by `<span>credits</span>` → **`120 credits`**.
- `features/briefings/briefing-detail.tsx:230-231` — label `Available balance`, value
  `{balance.data?.balance ?? 0} cr` → **`120 cr`**.

`cr` appears nowhere else in the product; the same file writes `credits` in full four lines away
(`:246` `{briefing.confirmed_credits} credits · one project`).

Recommendation: use `credits` in the budget-review `<dl>`; delete the `cr` abbreviation.

### J04-7 — One destination, five names

**Severity: Medium**

`/home` is labelled **Overview**, **My work** or **Home** in the sidebar depending on role
(`features/workspace/app-shell.tsx:169`), **Back to your work** on five error screens
(`features/board/board-page.tsx:255`, `features/projects/project-page.tsx:59`,
`features/brand/brand-page.tsx:31`, `features/credits/credits-page.tsx:55`,
`features/briefings/briefing-editor.tsx:36`) and **Open workspace** on the two app-level error pages
(`app/error.tsx:19`, `app/not-found.tsx:9`).

Recommendation: pick one recovery label ("Back to your work") for every error surface, and let the
role-dependent nav label stand on its own.

### J04-8 — The designer role is renamed twice inside one panel

**Severity: Medium**

`features/projects/project-details.tsx` calls the same person three things in one aside:

- `:114` — `<h3>Creative partner</h3>`
- `:139` — `Assign a designer`
- `:246` — `title="Assign a creative partner"`
- `:260` / `:277` — field label `Designer`, submit `Assign designer`

Recommendation: "Creative partner" is the outward-facing term used by the shell
(`app-shell.tsx:349`); use it in the heading and the modal, and keep "Designer" only for the field
that lists people by role.

### J04-9 — Four nouns for a produced file

**Severity: Medium**

See the terminology table. The sharpest single screen is `features/assets/assets-page.tsx`, which in
32 lines says `THE FILES THAT MATTER` (`:93`), `Project assets.` (`:94`), `Working file` (`:116`) and
`All files` (`:146`), under a nav entry labelled `Assets` (`app-shell.tsx:175`), reached from the
project page by a link called `Files & delivery` (`project-details.tsx:160`). The board calls the same
artefact `No artwork yet` (`project-thumbnail.tsx:240`) where the project page calls it
`A space for your first design.` (`project-nodes.tsx:113`).

Recommendation: fix **design** for the produced creative work, **file** for anything downloadable and
**asset** for brand-library items only; retitle the route to match its nav entry.

### J04-10 — Global search describes a briefing with a raw enum

**Severity: Medium**

`features/workspace/workspace-data.ts:269` sets a search result's description to
`item.status.replaceAll("_", " ")`, so a briefing shows **`budget confirmed`** in search while the same
record shows **`Budget confirmed`** on its own page (`features/briefings/briefing-detail.tsx:55` via
`briefingStatusLabels`).

Recommendation: import `briefingStatusLabels` into the search query mapper.

### J04-11 — The board card's accessible name describes an action the board no longer performs

**Severity: Low**

`features/board/project-open.ts:19-21` defines `openLabel(title)` as the one accessible name for
opening a project, and `projectHref` (`:14-16`) resolves to `/projects/:id`. The kanban card
(`features/board/board-kanban.tsx:75`) and the timeline bar
(`features/board/project-timeline.tsx:146`) both use `openLabel`. The canvas card does not:

- `features/board/board-nodes.tsx:207` — `aria-label={`Open ${data.project.title} in planning`}`

"in planning" is inaccurate: `features/board/board-page.tsx:186-189` routes the open action to
`projectHref`, which leaves the board. The neighbouring comment at `board-nodes.tsx:156` still claims
"neither leaves the board".

Recommendation: use `openLabel(data.project.title)` and correct the stale comment.

### J04-12 — Three phrasings for "this record has no date"

**Severity: Low**

- `features/workspace/workspace-data.ts:296` — `formatDate(null)` → **`No due date`**
- `features/projects/project-details.tsx:106` — start date null → **`To be planned`**
- `features/briefings/briefing-summary.tsx:79` — → **`No target date. We will agree on timing together.`**

Because `formatDate`'s fallback is hard-wired to "due", `features/reviews/reviews-page.tsx:99` and
`features/assets/assets-page.tsx:183` would print **`No due date`** for a *review* date and a *file*
date if either were ever null.

Recommendation: give `formatDate` an `emptyLabel` parameter instead of a hard-coded "No due date".

### J04-13 — Two definitions of a workspace's project count

**Severity: Low**

- `features/board/board-page.tsx:324-326` — `{filteredProjects.length} project{s}`, computed from all
  projects including `delivered`.
- `features/workspace/home-page.tsx:181` — `{clientProjects.length} active project{s}`, computed from
  `activeProjects`, which excludes `delivered` (`:27`).

Concrete inconsistency: for SABRE the home card can read **5 active projects** while its board reads
**7 projects**. The two labels differ, so this is honest, but the figures are one click apart and
invite the reader to reconcile them.

Recommendation: show "N active" on the board's result count too, or add the delivered count as a
secondary figure on the home card.

### J04-14 — The fourth status vocabulary is a hand-written ternary

**Severity: Low**

Three domains declare a label map — `statusLabels`
(`features/workspace/workspace-data.ts:285`), `briefingStatusLabels`
(`features/briefings/briefing-model.ts:136`), `creditKindLabels`
(`features/credits/credit-model.ts:30`). Credit-request status does not:
`features/credits/credits-page.tsx:370-374` inlines
`item.status === "fulfilled" ? "Allocated" : item.status === "rejected" ? "Declined" : "Pending"`,
mapping `fulfilled → Allocated` and `rejected → Declined` at the call site only.

Recommendation: add `creditRequestStatusLabels` to `credit-model.ts` beside `creditKindLabels`.

### J04-15 — Brand hub capitalisation

**Severity: Low**

`Brand Hub` (`features/workspace/app-shell.tsx:176`, `features/brand/brand-page.tsx:43`,
`features/briefings/briefing-editor-details.tsx:292`) against `brand hub`
(`features/brand/brand-page.tsx:24`, `:28`) — both spellings in the same file.

Recommendation: title-case it everywhere, since it is a named destination.

### J04-16 — Two labels for one back link in one file

**Severity: Low**

`features/briefings/briefing-detail.tsx:43` — `Back to briefings`; `:52` — `All briefings`. Both are
`<Link href={`/clients/${clientId}/briefings`}>`.

Recommendation: use `All briefings` in both places.

### J04-17 — Review filter names diverge from status names

**Severity: Low**

`features/reviews/reviews-page.tsx:50-61` offers `Waiting for you` / `In progress` / `With client`,
`Studio review` and `Approved`. `Studio review` and `Approved` match `statusLabels`
(`workspace-data.ts:288`, `:291`) exactly. `With client` does not: the equivalent project status is
labelled **`In review`** (`workspace-data.ts:289`).

Recommendation: relabel the agency filter `In review` to match the badge the same rows carry.

### Checked and found consistent (J04)

- **Project status**: `statusLabels` is the sole source at every one of its eight call sites —
  board canvas card (`board-nodes.tsx:193`), board list (`board-page.tsx:415`), board filter options
  (`board-page.tsx:311`), kanban column headings (`board-kanban.tsx:52`), timeline bar and its
  tooltip/accessible name (`project-timeline.tsx:146`, `:163`, `:169`), project page header
  (`project-page.tsx:174`) and the home overview tiles and table (`home-page.tsx:37-40`, `:141`). No
  hand-written project-status string exists anywhere.
- **Credit balance**: the credits page and the briefing budget panel read the same
  `credit_accounts.balance` row through `useCreditAccount` and `useBriefingCreditBalance`; the figure
  itself always agrees (only the unit drifts — J04-6). The "Balance after acceptance" arithmetic in
  `briefing-detail.tsx:235` matches the ledger's `balance_after` column semantics.
- **Notification count**: `features/workspace/notifications-bell.tsx:14` and
  `features/workspace/notifications-page.tsx:24` apply the identical `!item.read_at` filter to the
  identical shared query, so the bell and the page can never disagree.
- **Campaign fallback**: `"Studio projects"` for a null campaign is defined once
  (`board-page.tsx:161-165`) and passed to both the kanban and the timeline.
- **Briefing status**: `briefingStatusLabels` is used at both of its user-facing badge sites
  (`briefings-page.tsx:113`, `briefing-detail.tsx:55`).
- **version / revision**: "revision" appears only as an internal concurrency token and never reaches
  a user, so this concept has exactly one user-facing noun.

---

## J03 — Minimal and modern; one clear primary action per task

Primary action per surface, as read from the rendered markup:

| Surface | Primary | Verdict |
| ------- | ------- | ------- |
| Board (`board-page.tsx:336-344`) | `New briefing` | One |
| Briefings (`briefings-page.tsx:55-59`) | `New briefing` | One |
| Credits (`credits-page.tsx:145-151`) | `Adjust credits` / `Request credits` (role-exclusive) | One |
| Brand hub (`brand-page.tsx:67-72`) | `Edit {section}` — `button quiet` | One, deliberately soft |
| Project (`project-page.tsx:178-197`) | none; actions are contextual on version cards | Acceptable |
| Settings → Clients / Team / Presets | one header `button primary` each | One |
| **Assets** (`assets-page.tsx`) | `Working file` **and** `Complete delivery` | **Two — J03-1** |
| **Settings → Your account** | `Save profile` **and** `Update password` | **Two — J03-4** |

### J03-1 — Two competing primary buttons on the assets page

**Severity: Medium**

- `features/assets/assets-page.tsx:114-117` — `<button className="button primary">… Working file</button>`
  in the page header.
- `features/assets/assets-page.tsx:159-162` — `<button className="button primary">… Complete delivery</button>`
  inside the delivery callout.

Both render simultaneously whenever `canDeliver` is true (`:85-87`: agency role, an approved project,
and a delivery file present) — precisely the moment the page matters most. The header also carries a
third action, `Delivery file` (`:104-112`), so the row reads as three near-equal calls to act.

Recommendation: demote `Working file` to `button` while the delivery callout is showing, so
`Complete delivery` is the single dominant action at that moment.

### J03-2 — The topbar consolidation was applied to the board only; five sibling pages keep an empty bar

**Severity: Medium**

`features/workspace/workspace.css:151-157` stands the topbar down for the board alone:

```
@media (min-width: 901px) {
  .workspace:has(.board-page) { --topbar-height: 0px; }
  .workspace:has(.board-page) > .topbar { display: none; }
}
```

`features/workspace/app-shell.tsx:382` suppresses `topbar-identity` on *every* page inside a client
workspace (`{!activeClient && …}`). On `/clients/:id/briefings`, `/reviews`, `/assets`,
`/brand/:section`, `/credits` and `/projects/:id` at ≥901px the result is a sticky, full-width, 64px
bar (`app/globals.css:443-454`) containing nothing but the notifications bell, sitting directly above
each page's own `page-heading`. The comment at `app/globals.css:437-441` states the intended rule —
"A page that carries its own header row takes the top of the workspace itself, and this bar above it
would be an empty strip — so it stands down" — but the selector implements it for one page.

Recommendation: key the stand-down on the presence of `.page-heading` (or on `activeClient`) rather
than on `.board-page`, and keep the bell where the board already puts it.

### J03-3 — Fifteen decorative eyebrows that carry no information

**Severity: Medium**

`.eyebrow` (`app/globals.css:197-204`) serves two incompatible jobs. Informational uses label a value
— `{file.category}` (`assets-page.tsx:175`), `{result.type}` (`search-page.tsx:59`),
`{campaignName(project.campaign_id)}` (`board-kanban.tsx:68`), `Available balance`
(`credits-page.tsx:155`), `Project credits used` (`:163`), `Selected service`. The rest are slogans:

`YOUR CREATIVE WORKSPACE` (`home-page.tsx:76`), `A CLEAR PATH` (`search-page.tsx:25`), `IN THE LOOP`
(`notifications-page.tsx:29`), `THE FILES THAT MATTER` (`assets-page.tsx:93`), `A FRESH PAIR OF EYES`
(`reviews-page.tsx:40`), `THE BIG PICTURE` (`project-details.tsx:84`), `BRAND RESOURCES`
(`brand-page.tsx:42`), `THE BRAND AT A GLANCE` (`brand-sections.tsx:72`), `A CONSISTENT POINT OF VIEW`
(`brand-sections.tsx:304`), `PHOTOGRAPHY & COMPOSITION` (`brand-sections.tsx:220`),
`STUDIO ADMINISTRATION` / `YOUR WORKSPACE` (`settings-page.tsx:44`), `YOU ARE INVITED` /
`YOUR NEW WORKSPACE` (`invitation-acceptance.tsx:72`, `:113`), `YOUR ACCOUNT`
(`account-recovery.tsx:65`, `:114`).

Each sits above an `h1` that already names the page — `THE FILES THAT MATTER` / `Project assets.` /
"Working files, shared designs, and final deliveries." is three lines of chrome before the first
control.

Recommendation: keep `.eyebrow` for labelled values; delete the slogan variants, which is also what
removes the casing split described in J08-5.

### J03-4 — Two primary buttons on the account settings screen

**Severity: Low**

`features/settings/account-settings.tsx:73` (`Save profile`) and `:120` (`Update password`) both
render `button primary` and are visible together. Each is its own form's submit, which is defensible,
but the screen presents two equally weighted actions.

Recommendation: leave as is, or demote `Update password` to `button` since profile details are the
section the page opens on.

### J03-5 — The same retry action has two weights

**Severity: Low**

`app/error.tsx:15` renders `Try again` as `button primary`. All fourteen in-page retry buttons render
it as plain `button` — e.g. `features/workspace/home-page.tsx:62`,
`features/credits/credits-page.tsx:82`, `features/reviews/reviews-page.tsx:22`,
`features/workspace/app-shell.tsx:161`, `features/settings/team-settings.tsx:62`.

Recommendation: use `button primary` for `Try again` consistently, since on an error screen it is the
one action worth taking.

### Checked and found consistent (J03)

- Error-page headings follow one pattern across seven surfaces: `Board unavailable.`,
  `Project unavailable.`, `Briefing unavailable.`, `Briefings unavailable.`, `Credits unavailable.`,
  `Reviews unavailable.`, `Files unavailable.`, `Brand hub unavailable.`
- No CSS gradient appears in any of the fourteen stylesheets; `grep -c gradient` returns 0 everywhere.
- The board's own consolidation is correct: `features/board/board.css:320-325` hides the board's
  duplicate `NotificationsBell` below 901px, exactly where the topbar reappears, so the bell is never
  rendered twice to a user.
- Copy length across headings and empty states is restrained; no heading exceeds one line.

---

## J08 — Branding, proportions and token discipline

### J08-1 — `background: #fff` written literally where `--surface` exists

**Severity: Medium**

`--surface: #fff` is declared at `app/globals.css:7`. Eleven background declarations write the literal
instead:

`app/globals.css:238`, `:264`, `:617`; `features/board/board.css:153`;
`features/briefings/briefings.css:99`, `:152`; `features/credits/credits.css:211`;
`features/projects/projects.css:89`, `:480`; `features/settings/settings.css:76`, `:184`.

The intent is not in doubt — `features/projects/projects.css:11` writes
`background: var(--surface, #fff)` in the same file that writes the bare literal at `:89`.

Recommendation: replace every `background: #fff` with `background: var(--surface)`. (Foreground
`color: #fff` on dark chrome is a different value and is correctly left alone.)

### J08-2 — A second, untokened palette of near-identical greys

**Severity: Medium**

Four token values each have an off-by-a-hair literal twin used more often than the token itself:

| Token | Literal twin | Count | Sample locations |
| ----- | ------------ | ----- | ---------------- |
| `--border: #e3e3df` | `#e3e2dc` | 11 | `credits.css:13`, `:16`, `:55`, `:136`, `:239`, `:266`; `briefings.css:173`, `:184`, `:267`; `settings.css:9`, `:37` |
| `--surface-subtle: #f1f1ee` | `#f0f0eb` | 7 | `assets.css:33`, `board.css:249`, `:262`, `timeline.css:202`, `projects.css:532`, `:552`, `workspace.css:303` |
| `--foreground: #252523` | `#242424` / `#252525` / `#222` | 14 | `credits.css:72-73`, `briefings.css:22-23`, `:82`, `:85`, `:87`, `:109-110`, `:157`, `projects.css:435`, `:468`, `:609`, `timeline.css:197` |
| `--muted: #6c6c67` | `#6d6d65` | 3 | `projects.css:774`, `reviews.css:32`, `:49` |

`features/credits/credits.css` and `features/settings/settings.css` use `var(--border)` **zero** times
while writing `#e3e2dc` six and three times respectively. For contrast, `features/brand/brand.css`
uses `var(--border)` nineteen times and carries seven hexes in total.

Concrete inconsistency: the credits table's row separator (`credits.css:136`, `#e3e2dc`) and the
board's frame border (`board.css`, `var(--border)` = `#e3e3df`) are two different colours drawn one
route apart, differing by one step in one channel — indistinguishable on screen, but guaranteeing that
any future change to `--border` leaves the credits table behind.

Recommendation: replace the four twins with their tokens; the visual difference is below perceptual
threshold and the maintenance difference is total.

### J08-3 — Thirteen corner radii against a two-value radius scale

**Severity: Medium**

`--radius: 8px` and `--radius-lg: 12px` (`app/globals.css:16-17`). Across 103 `border-radius`
declarations there are thirteen distinct literal values: `1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14,
999px`. Eleven write `8px` literally where `--radius` exists — `assets.css:78`, `board.css:623`,
`timeline.css:21`, `briefings.css:212`, `:317`, `:339`, `reviews.css:40`, `projects.css:455`,
`workspace.css:523`, `activity.css:7`, `globals.css:716` — and six write `12px` where `--radius-lg`
exists: `board.css:129`, `:162`, `:248`, `:501`, `settings.css:186`, `globals.css:1009`.

`var(--radius…)` is used in only four of the thirteen feature stylesheets; `credits.css`,
`settings.css`, `projects.css`, `timeline.css`, `assets.css`, `auth.css`, `reviews.css` and
`forms.css` use it zero times.

Recommendation: collapse to `--radius-sm` / `--radius` / `--radius-lg` / `--radius-pill` and convert
the literals; the `5px` badge (`globals.css:600`), `6px`, `7px`, `9px`, `10px` and `11px` values carry
no meaning the reader can perceive.

### J08-4 — No typographic scale token exists, so 324 font sizes are hard-coded

**Severity: Medium**

The `:root` block (`app/globals.css:3-18`) defines colour, two radii, `--sidebar-width`,
`--topbar-height` and `--space-page`. It defines no type scale and no spacing scale. The result is 324
`font-size` declarations across the fourteen stylesheets in seventeen distinct pixel values, the
commonest being `12px` (68), `11px` (56), `13px` (53) and `10px` (45) — four neighbouring sizes used
for what is, visually, the same rank of secondary text.

`--space-page` is used seven times in `globals.css` and by only three feature stylesheets
(`board.css`, `brand.css`, `workspace.css`).

Concrete inconsistency: the timeline's day label (`timeline.css:197`) is `#222` at one size, the
credits table header (`credits.css:130`) is `10px`/`var(--muted)`, and the board result count
(`board.css:77`) is `11px`/`var(--muted)` — three renderings of "small supporting label" on three
adjacent surfaces.

Recommendation: add `--text-xs/sm/base/lg` and a four-step spacing scale to `:root`, and convert the
four dominant sizes first; the remaining thirteen values are then visibly exceptional and can be
judged individually.

### J08-5 — Five implementations of the eyebrow treatment

**Severity: Medium**

| Selector | Size | Tracking | Transform |
| -------- | ---- | -------- | --------- |
| `.eyebrow` (`globals.css:197-204`) | `10px` | `1.4px` | none — caps are baked into the copy string |
| `.login-story .eyebrow` (`auth.css:26-32`) | `11px` | `0.25px` | `none` (explicit override) |
| `.board-identity p` (`board.css:68-75`) | `11px` | `0.09em` | `uppercase` |
| `.credit-table th` (`credits.css:129-136`) | `10px` | `0.1em` | `uppercase` |
| `.brand-art-eyebrow` (`brand.css:478-483`) | `clamp(8px, 2.3cqw, 15px)` | `1px` | `uppercase` |
| `.nav-section-label` (`globals.css:430-436`) | `10px` | `1.3px` | none — `WORKSPACES` is a literal |

Because `.eyebrow` applies no `text-transform`, the same class renders `THE FILES THAT MATTER`
(`assets-page.tsx:93`) in caps and `Available balance` (`credits-page.tsx:155`) in sentence case, and
`brand-sections.tsx:178` reaches a third state by calling `{label.toUpperCase()}` in JavaScript. Three
casing mechanisms for one visual treatment.

Recommendation: put `text-transform: uppercase` on `.eyebrow`, write the strings in sentence case, and
fold `board-identity p`, `credit-table th` and `nav-section-label` into the class.

### J08-6 — `status-badge` differentiates four project statuses and flattens every other domain

**Severity: Low**

`app/globals.css:592-635` gives variant styling to `.internal_review`, `.changes_requested`,
`.approved` and `.delivered` only. The same component is used with briefing statuses
(`briefings-page.tsx:112`, `briefing-detail.tsx:54`: `draft`, `awaiting_review`, `budget_confirmed`,
`accepted`), credit-request statuses (`credits-page.tsx:369`: `pending`, `fulfilled`, `rejected`) and
with no status at all (`team-settings.tsx:83`, `:124`).

Concrete inconsistency: on the briefings list every row's badge is visually identical, so `Draft`,
`Awaiting review` and `Budget confirmed` are distinguished only by their text, while two clicks away
on the board the badge itself carries the state. `.status-badge` also hard-codes four colours
(`#dfdfda`, `#f3f3ef`, `#60605b`, `#d6d6cf`) that are near-twins of `--border`, `--surface-subtle` and
`--muted`, and a literal `border-radius: 5px`.

Recommendation: either add briefing variants, or scope the variant selectors to project status and
give briefings a deliberately flat badge — the current state is neither.

### Checked and found consistent (J08)

- **Logo proportions are correct at every site.** The supplied asset `brand/brianna-dawes-studios.webp`
  is copied verbatim to `apps/web/public/brand/logo.webp` (identical 19646-byte file) and its intrinsic
  dimensions are **2409 × 619** (VP8L header). All four `<Image>` usages declare exactly
  `width={2409} height={619}` and differ only in `sizes`: `features/auth/login-page.tsx:42-48`
  (`280px`), `features/workspace/app-shell.tsx:210-217` (`166px`),
  `features/settings/account-recovery.tsx:44-50` (`220px`),
  `features/settings/invitation-acceptance.tsx:50-55` (`220px`). No CSS rule sets both `width` and
  `height` on `.brand-logo`, so the ratio cannot be distorted.
- **No unapproved decorative asset appears.** `apps/web/public/` contains exactly one file. Every other
  graphic in the product is a `lucide-react` glyph or client-derived content (initials monograms,
  uploaded artwork). There are no stock images, no illustrations and no CSS gradients.
- Client monograms are one component with one scale token (`--client-mark-size`,
  `app/globals.css:457-475`), reused by the topbar and the board identity header.

---

## J09 — Empty, error, loading and confirmation surfaces

### Inventory

**Loading** — 12 routes use the shared `PageStatus` (`settings-page.tsx:24`, `board-page.tsx:248`,
`project-page.tsx:52`, `home-page.tsx:56`, `draft-editor.tsx:30`, `briefings-page.tsx:21`,
`brand-page.tsx:24`, `briefing-detail.tsx:35`, `reviews-page.tsx:17`, `briefing-editor.tsx:47`,
`assets-page.tsx:63`, `credits-page.tsx:67`). 15 in-panel loads use a bare `<p role="status">`
(explicitly evaluated and rejected as a primitive in `features/shared/README.md`). Four pre-shell
routes use `.centered-state` (`app-shell.tsx:152`, `app/login/page.tsx:7`,
`app/auth/invite/page.tsx:8`, `app/auth/recovery/page.tsx:8`).

**Error** — `FormError` is used at 46 call sites in 27 files; the three exceptions
(`search-page.tsx:49`, `notifications-page.tsx:50`, `briefing-detail.tsx:248`) are documented in the
shared README and are correct.

**Empty** — 15 use `.empty-state`; 5 do not (see J09-1).

**Confirmation** — 15 files use the shared `Modal`; one uses `window.confirm` (see J09-3).

### J09-1 — Five empty-state visual languages, two of them showing identical copy

**Severity: Medium**

`.empty-state` (`app/globals.css:637-661`) is the shared language: 220px minimum height, 36px padding,
`1px dashed var(--border-strong)`, `var(--radius-lg)`, translucent white fill, centred icon, heading
and 13px paragraph. Five empty states bypass it:

| Class | Location | Treatment |
| ----- | -------- | --------- |
| `.board-list-empty` | `board.css:694-706` | no border, 40px padding, `h2` 15px, `p` 12px |
| `.kanban-empty` | `board.css:541-549` | dashed, `border-radius: 10px` (not `--radius-lg`), 11px |
| `.comment-empty` | `projects.css:515-527` | no border, 50px padding, `h3` 13px, `color: #666` |
| `.version-empty` | `projects.css:221-231` | no border, 12px, fixed `408px` basis |
| `.credit-note` | `credits-page.tsx:384` | a plain paragraph |

The sharpest case is the board, where **the same two strings render in two different visual
languages depending on a layout toggle**:

- `features/board/board-nodes.tsx:131-142` (Canvas view) — `<div className="board-stack-notice empty-state">`
  with `<h2>{data.filtered ? "No projects match." : "A fresh space for your next idea."}</h2>`, the
  paragraph `"Try a different search or clear your filters."` / `"Start with a briefing. We'll take it
  from there."`, **and a `Clear filters` button**.
- `features/board/board-page.tsx:399-408` (List view) — `<div className="board-list-empty">` with the
  identical two headings and identical two paragraphs, **and no button**.

Switching from Canvas to List therefore redraws the same message in a different frame and silently
removes the only recovery action it offered.

The credits page shows two empty languages at once: `.empty-state` with
`<h2>No activity in this view.</h2>` (`credits-page.tsx:292-295`) and, further down the same page,
`<p className="credit-note">No credit requests yet.</p>` (`:384`).

Recommendation: give the board list view the same `.empty-state` markup the canvas notice already
uses, including the `Clear filters` button, and convert `.credit-note` and `.comment-empty` to
`.empty-state`. `.kanban-empty` and `.version-empty` are genuinely space-constrained slots and can
keep a compact variant, but should take it from a shared modifier rather than from two private rules.

### J09-2 — The same failure is stated twice on one screen

**Severity: Medium**

Most error routes state the failure once, in the heading. Two state it twice:

- `features/credits/credits-page.tsx:79-80`:
  `<h1>Credits unavailable.</h1>` followed by
  `<FormError>Your credit report could not be loaded. Please try again.</FormError>`
- `features/briefings/briefings-page.tsx:26-27`:
  `<h1>Briefings unavailable.</h1>` followed by
  `<FormError>We could not load this workspace. Please try again.</FormError>`

Compare the sibling routes, which use a heading plus a plain explanatory paragraph and no alert:
`features/board/board-page.tsx:252-253` (`<h1>Board unavailable.</h1>` /
`<p>This workspace is unavailable or you do not have access.</p>`),
`features/projects/project-page.tsx:56-57`, `features/assets/assets-page.tsx:67-68`,
`features/briefings/briefing-detail.tsx:40-41`, `features/brand/brand-page.tsx:28-29`.

Because `FormError` carries `role="alert"`, the credits and briefings routes also announce the failure
to a screen reader twice — once as the page heading, once as an alert. The briefings copy is also
wrong about its subject: the heading says "Briefings", the alert says "this workspace".

Recommendation: drop the `FormError` from both page-level error blocks and keep the explanatory
`<p>`, matching the five sibling routes.

### J09-3 — Confirmation is a browser dialog in one place, a `Modal` everywhere else, and absent for destructive actions

**Severity: Medium**

`features/brand/draft-editor.tsx:104` is the product's only confirmation prompt:

```
if (dirty && !window.confirm("Leave this draft without saving your changes?"))
```

Every other dialog in the product is the shared `Modal` (15 consumer files). A native `confirm()` is
OS chrome: it ignores the design system, cannot be styled, blocks the main thread and reads in the
browser's own language rather than the product's.

Meanwhile, genuinely destructive actions have no confirmation at all:
`features/projects/project-details.tsx:124-131` removes a designer from a project on a single click;
`features/briefings/briefing-attachments.tsx:119` and
`features/briefings/briefing-editor-details.tsx:147` remove a file on a single click.

Recommendation: replace the `window.confirm` with a `Modal`, and decide one rule for destructive
actions — either they all confirm through `Modal`, or none do.

### J09-4 — Six verbs for one loading state

**Severity: Low**

`PageStatus` is used consistently, but the copy inside it is not:

- **Opening** — `Opening the board…` (`board-page.tsx:248`), `Opening the project…`
  (`project-page.tsx:52`), `Opening settings…` (`settings-page.tsx:24`), `Opening your draft…`
  (`draft-editor.tsx:30`), `Opening the brand hub…` (`brand-page.tsx:24`), `Opening your workspace…`
  (`app-shell.tsx:153`)
- **Loading** — `Loading briefings…` (`briefings-page.tsx:21`), `Loading the briefing…`
  (`briefing-detail.tsx:35`), `Loading your credits…` (`credits-page.tsx:67`), plus nine in-panel
  variants
- **Gathering** — `Gathering your workspace…` (`home-page.tsx:56`), `Gathering reviews…`
  (`reviews-page.tsx:17`), `Gathering files…` (`assets-page.tsx:63`)
- **Preparing** — `Preparing your briefing…` (`briefing-editor.tsx:47`)
- **Finding** — `Finding your brand files…` (`brand-assets.tsx:86`)
- **Getting … ready** — `Getting your starting points ready…` (`brand-templates.tsx:47`)
- **Looking through** — `Looking through your workspace…` (`search-page.tsx:46`)
- **Checking** — `Checking your invitation…` (`invitation-acceptance.tsx:59`), `Checking your
  session…` (`account-recovery.tsx:54`), `Checking balance…` (`briefing-detail.tsx:216`)

Concrete inconsistency: `Gathering files…` and `Finding your brand files…` are the same operation
(fetching a file list) on two routes, phrased differently.

Recommendation: standardise on one verb for route loads (`Loading …`) and keep the softer phrasings
only where the wait is genuinely an action the studio is taking.

### J09-5 — Two full-page status components for one job

**Severity: Low**

`PageStatus` renders `<div className="page-content" role="status">` (`page-status.tsx:10`).
`.centered-state` renders `<main className="centered-state" role="status">` with `min-height: 100dvh`
and centred content (`globals.css:347-361`). Both mean "this route is loading".
`features/workspace/app-shell.tsx:152` uses the latter for `Opening your workspace…` while
`features/workspace/home-page.tsx:56` uses the former for `Gathering your workspace…` — two
descriptions of the same wait, in two layouts, on consecutive frames of the same navigation.

`features/shared/README.md` records `centered-state` as rejected for the shared layer on the grounds
that it is a wrapper around arbitrary children; that reasoning stands, but the two components should
not both be answering "the route is loading".

Recommendation: keep `.centered-state` for the pre-shell routes (login, invite, recovery, app-level
error), and have the shell's own loading state use `PageStatus` so that the in-shell wait has one
appearance.

### Checked and found consistent (J09)

- **There is no toast system.** `grep -i "toast|sonner|snackbar"` across `features/` and `app/`
  returns nothing but two unrelated `javascript:alert(1)` XSS test fixtures. The duplicate
  toast-and-dialog noise this row warns about therefore cannot occur, and no outcome is reported
  twice by two mechanisms.
- **`FormError` adoption is effectively complete** — 46 call sites in 27 files, with the three
  exceptions individually justified in `features/shared/README.md` and each one correct on
  inspection.
- **`Modal` adoption is complete** for in-product dialogs (15 files), with one exception (J09-3). All
  15 share focus trap, scroll lock, focus restore, light dismiss and `Close {title}` labelling from
  one implementation.
- **`SettingsSuccess`** is used at all eight of its call sites inside `features/settings`; no other
  feature renders a bespoke inline success message.
- **Error-page headings** follow one pattern (`<Noun> unavailable.`) across eight routes.
- No screen was found rendering the same error through two different components (the J09-2 cases
  duplicate the *message*, not the component).

---

## Method

- Source of truth was the rendered JSX and the applied CSS, read file by file; no conclusion here
  rests on a file's name or location.
- Every label map, every `Intl.DateTimeFormat` construction, every `border-radius`, `font-size` and
  hex literal in the fourteen stylesheets, every `role="status"`, `FormError`, `PageStatus`, `Modal`,
  `empty-state` and `button primary` call site was enumerated by grep and then read in context.
- The logo's intrinsic dimensions were read from the WebP VP8L header rather than assumed.
- The running app at `localhost:3003` was deliberately not driven: another session holds the browser,
  and every claim above is verifiable from source.
- No file outside this report was modified; no test was run.
