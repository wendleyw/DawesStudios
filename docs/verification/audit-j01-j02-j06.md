# Acceptance audit — J01 layout, J02 long data, J06 accessibility

Measurement pass executed on 2026-09-21 against the rebuilt container serving `http://localhost:3003`
(image built 2026-09-21T04:33:42Z, newer than the branch head at 04:20:46Z). The container was not
stopped, restarted or rebuilt. No application code, CSS or existing spec was changed.

**J07 (persisted pin alignment under zoom and sidebar resize) was already Verified and was not
re-audited.**

## Method

Measurements were taken with a temporary Playwright probe under `apps/web/tests/e2e/`, run against
the live container with Playwright Chromium, `reducedMotion: "reduce"`, one worker and an isolated
output directory. The probe was deleted after the run and is not committed; the existing verification
specs (`design-audit.spec.ts`, `brand-accessibility.spec.ts`) were read for helper reuse but never
modified or executed as part of this audit.

- **Layout sweep.** 19 routes × 40 viewport widths = 760 measurements of
  `document.documentElement.scrollWidth` against `clientWidth`, plus the offending element chain
  whenever they differed. Widths: 320, 360, 374, 375, 390, 414, 480, 520, 521, 540, 600, 640, 641,
  650, 651, 700, 701, 720, 721, 760, 761, 768, 800, 801, 834, 860, 900, 901, 960, 1000, 1001, 1024,
  1100, 1101, 1150, 1200, 1201, 1280, 1440, 1600. The set brackets every breakpoint declared in the
  stylesheets (374, 520, 640, 650, 700, 720, 760, 800, 900, 1000, 1100, 1200) from both sides and
  includes the 1440/1200/1100/900/700 widths the engineering handoff records as measured manually but
  which the automated spec does not cover.
- **Board mount-time sweep.** Board canvas and list views re-mounted (full navigation, not resize) at
  16 widths, because the default board view is chosen at mount.
- **Control collision sweep.** Five chrome pairs (`.sidebar`/`.main-content`,
  `.topbar-identity`/`.topbar-actions`, `.board-identity-name`/`.board-tools`,
  `.project-heading`/`.project-toolbar`, `.page-heading`/`.page-actions`) intersected at 23 widths
  across 8 routes.
- **Long data.** Two throwaway production fixtures were created with `createProductionFixture` and
  removed with `cleanupTestProject` in `finally`. Long values were written to the fixture's own
  project title, briefing title/overview/goals, deliverable name, design title and comments — never to
  seeded rows. Two content shapes were used: a 200-character title with normal word spacing, and a
  107-character unbroken token (`Supercalifragilistic…silicovolcanoconiosis`), plus a 1 385-character
  briefing overview and a ~950-character comment.
- **Accessibility.** `@axe-core/playwright` default rule set across 16 routes × 3 widths, followed by a
  keyboard-only journey (sign in → open a client → open a dialog → close it) with focus, outline and
  focus-return measured at every step, and a reduced-motion check.

Database counts were confirmed before and after: **10 clients, 25 projects**, with zero rows left
matching `title like 'Acceptance %'` in `projects` or `briefings`.

---

## J01 — Shell, page, canvas and inspector alignment

> *Shell/page/canvas/inspector alignment follows consistent grid and spacing; no overlapping controls
> or accidental horizontal overflow.*

**Findings: 1 (1 Medium, 0 High, 0 Low).**

### J01-1 — Board header spills 4px at 320px · Medium

- **Where.** `/clients/{clientId}/board`, `a.button.primary` ("New briefing") inside `div.board-tools`.
- **When.** Viewport width 320px only. Present in both Canvas and List view, and on a fresh mount as
  well as a resize.
- **Measured.** `documentElement.scrollWidth = 324`, `clientWidth = 320`. The button's box runs
  `left: 280 → right: 324`. Its parent `div.board-tools` is `display: flex; flex-wrap: nowrap;
  gap: 8px` with a 288px content box (`left: 16 → right: 304`); the grandparent
  `header.board-identity` does set `flex-wrap: wrap` but the spill happens inside `.board-tools`,
  which cannot wrap. The 320px viewport is the only measured width where the row's intrinsic content
  exceeds the gutter-reduced line.
- **Recommendation.** Allow `.board-tools` to wrap (or let the adjacent search field shrink further)
  below the existing 374px breakpoint.

### What passed

- **759 of 760 layout measurements had zero horizontal overflow.** Every width in the list above was
  clean on `/home`, `/search`, `/notifications`, `/settings`, `/settings/account`, `/settings/team`,
  `/settings/clients`, `/settings/presets`, `/settings/workspace`, `/clients/{id}/briefings`,
  `/clients/{id}/briefings/new`, `/clients/{id}/reviews`, `/clients/{id}/assets`,
  `/clients/{id}/credits`, `/clients/{id}/brand/overview`, `/clients/{id}/brand/colors`,
  `/clients/{id}/brand/templates` and `/projects/{id}`. `/clients/{id}/board` was clean at every width
  except 320.
- **The intermediate band 900–1200 is clean.** 1200, 1201, 1150, 1100, 1101, 1024, 1001, 1000, 960,
  901 and 900 produced no overflow on any route — including the two React Flow canvases, whose nodes
  are clipped by `.react-flow { overflow: hidden }` rather than pushing the document.
- **No overlapping controls.** 5 chrome pairs × 23 widths × 8 routes = 0 intersections. The sidebar's
  right edge never crossed the workspace's left edge at any measured width; below 901px the sidebar is
  removed from flow and the workspace reclaims the full line rather than being overlapped.
- **The board canvas fits its chrome** at 1600, 1440, 1200, 1100, 1024, 1000, 960, 900, 834, 768, 720,
  700, 640, 540 and 390 in both views.

---

## J02 — Heading, field, table, card and modal spacing; long data

> *Heading, field, table, card and modal spacing is consistent; long names/comments/briefs wrap or
> truncate intentionally without hiding essential content.*

**Findings: 3 (0 High, 2 Medium, 1 Low).**

All three are the same underlying gap: `overflow-wrap: anywhere` is applied to body copy on 21
selectors across the stylesheets but is not applied to the headings beside them, so an unbroken token
that is wider than its container is neither wrapped nor clipped and pushes the document sideways.
Titles containing normal word spacing wrap correctly everywhere (see *What passed*), so this is
specifically an unbroken-token defect. The database permits it: `project_title_valid` and
`campaigns_title_check` allow 200 characters with no token-length rule, `clients_name_check` and
`profiles_display_name_check` allow 120.

### J02-1 — Long unbroken headings overflow the page and are cut off · Medium

- **Where and when.** Three headings, each with `overflow-wrap: normal`, `word-break: normal`,
  `overflow-x: visible`, no clipping ancestor and no `title` attribute:

  | Selector | Route | Widths with document overflow | Worst measurement |
  |---|---|---|---|
  | `.briefing-summary h2` (`features/briefings/briefings.css:283`) | `/clients/{id}/briefings/{briefingId}` | **all 8 measured (1600 → 320)** | 1600px viewport: `scrollWidth 1781` vs `clientWidth 1600`; heading `scrollWidth 1465` in an 838px box |
  | `.project-heading h1` (`features/projects/projects.css:19`) | `/projects/{id}` | 1200, 1100, 900, 768, 640, 390, 320 (clean at 1600) | 1200px viewport: `scrollWidth 1332`; 320px: `765` in a `146px` box |
  | `.briefing-list-row h2` (`features/briefings/briefings.css:34`) | `/clients/{id}/briefings` | 768, 640, 390, 320 (clean at 1600–900) | 320px viewport: `scrollWidth 809`; heading `793` in a `168px` box |

- **Measured (stability).** The project page was re-measured three times at 400ms intervals after a
  1.5s settle at 14 widths; the overflow is stable, not a transient pre-`fitView` state.
  `documentElement.scrollWidth` equals the heading's left offset plus its `scrollWidth` exactly at
  every width, confirming the heading is the sole cause.
- **Impact.** The text past the viewport edge is only reachable by scrolling the whole document
  sideways, and there is no ellipsis and no `title` fallback signalling that anything was cut. The
  paragraph directly beneath each of these headings (`.briefing-summary p`, `p.preserve-lines`) already
  carries `overflow-wrap: anywhere` and wraps correctly, so the heading is the outlier on its own page.
- **Recommendation.** Add `overflow-wrap: anywhere` to these three heading rules, matching the body
  copy beside them.

### J02-2 — Design viewer toolbar is protected on mobile only · Medium

- **Where.** `.design-viewer-toolbar > div:not(.viewer-mode-switch)` — the design title/deliverable
  block rendered by `features/projects/design-viewer.tsx:159`.
- **When.** Desktop and tablet. `features/projects/projects.css:718-723` sets `min-width: 0;
  max-width: 150px; overflow-wrap: anywhere` on this element **only inside `@media (max-width: 700px)`**;
  the base rule at line 386 sets neither, so a long unbroken design title widens the flex row.
- **Measured.** `/projects/{id}` with the feedback viewer open and a 107-character unbroken design
  title: document overflow at 1200 (`scrollWidth 1247`), 1100 (`1247`), 900 (`1023`) and 768 (`1023`).
  Clean at 1600 (the title fits) and at 640 and 390 (the mobile rule applies). The title element itself
  reports `overflow-wrap: normal` at ≥768 and `anywhere` at ≤640, confirming the breakpoint boundary.
- **Recommendation.** Move `min-width: 0` and `overflow-wrap: anywhere` onto the base
  `.design-viewer-toolbar > div:not(.viewer-mode-switch)` rule and keep only the sizing overrides in
  the media query.

### J02-3 — Board list row title truncates without a hover fallback · Low

- **Where.** `.board-list a.project-row strong` on `/clients/{id}/board` in List view.
- **When.** Any width where the title exceeds the column; measured at 640, 390 and 320.
- **Measured.** At 390px the title element reports `scrollWidth 622` in a `240px` box
  (`178px` at 320px), with `text-overflow: ellipsis` and the overflow contained by `div.board-list`.
  No `title` attribute is present. The two sibling surfaces do carry one: the canvas card
  `.board-card-head h2` (`-webkit-line-clamp: 2` plus `title`) and the timeline
  `.timeline-label strong` (`nowrap` + ellipsis + `title`) both expose the full 200-character value on
  hover.
- **Impact.** Low — the truncation is deliberate and the full title is one navigation away on the
  project page — but the inconsistency with the other two board views is unnecessary.
- **Recommendation.** Add the same `title` attribute the canvas and timeline rows already use.

### What passed

Long content that wrapped or truncated **deliberately**, with nothing essential hidden:

- **Board canvas card heading** — a 200-character project title clamps to two lines
  (`-webkit-line-clamp: 2`, `height: 41px` against `scrollHeight: 142`) and carries the full value in
  its `title` attribute. Clean at 1600, 1200, 1100, 900 and 768.
- **Board timeline label** — the same title is `nowrap` + ellipsis (`scrollWidth 1256` in a `234px`
  box) with the full value in `title`.
- **Credits ledger table** — a 200-character project title in `td strong` wraps to 13 lines inside
  `.credit-table-wrap`, which is the horizontal scroller. **Zero document overflow at all 8 widths**,
  including with an unbroken token; the value is reachable by scrolling the table, not the page.
- **Briefing overview and goals** — a 1 385-character body in `p.preserve-lines` /
  `.briefing-summary p` (`white-space: pre-wrap`, `overflow-wrap: anywhere`) wrapped cleanly at 1600
  (270px tall), 390 (686px) and 320 (956px) with no overflow.
- **Conversation panel comments** — a ~950-character comment ending in the 107-character unbroken
  token, in `.comment > p` (`overflow-wrap: anywhere`), produced no document overflow at 1600, 1200,
  1100, 900, 768, 640 or 390.
- **Long titles with normal word spacing** — a 200-character multi-word project title, briefing title,
  deliverable name and campaign title produced **zero document overflow on every surface at every
  width** (home, board, briefings, briefing detail, project, search, notifications, credits × 1600,
  1200, 1100, 900, 768, 640, 390, 320). The defects above require an unbroken token.
- **React Flow deliverable node** — grows to fit a long name (measured 444–634px) but is clipped by
  `.react-flow { overflow: hidden }`; it never contributes to document overflow, including at 320px
  where the node's right edge sits 148px past the viewport.

### Coverage gap

The **client** comment channel could not be seeded directly: `post_comment` with
`p_channel: "client"` on an unpublished project is rejected by
`client_comments_publication_id_project_id_fkey`. The long-comment measurement above therefore covers
the internal channel plus the shared `.comment > p` rule the client channel also uses, not a
client-channel render on a published snapshot. That render is untested here.

---

## J06 — Keyboard, focus, labels, contrast, accessible controls, reduced motion

> *Keyboard, visible focus, dialog focus return, labels, contrast, accessible controls and
> reduced-motion behaviour support real task completion.*

**Findings: 2 (0 High, 1 Medium, 1 Low).**

### J06-1 — Board search input renders 18px wide at 390px · Medium

- **Where.** `/clients/{clientId}/board`, `input[aria-label="Search projects"]` in `.board-toolbar`.
- **When.** 390px viewport (List view, the mobile default).
- **Measured.** Bounding box **18 × 40 px**. It was the only interactive element below 24×24 found in
  a sweep of every `button`, `a[href]`, `input`, `select` and `[role="button"]` on `/home`, the board,
  `/credits`, `/briefings` and `/settings` at 390px — those four other routes returned zero
  undersized controls. `.board-toolbar .search-field { width: auto; min-width: 0 }`
  (`features/board/board.css:383`) lets the field collapse to whatever the row leaves.
- **Impact.** The control is labelled and keyboard-reachable, and axe does not flag it (target size is
  not in the default rule set), but an 18px-wide text field is not a usable touch target and gives no
  room to read what has been typed.
- **Recommendation.** Give `.board-toolbar .search-field` a `min-width` of at least 44px below 640px,
  or collapse it to an icon-triggered field on narrow widths.

### J06-2 — Focus resets to `<body>` after sign-in navigation · Low

- **Where.** `/login` → `/home` after submitting the form with Enter.
- **Measured.** `document.activeElement.tagName === "body"` immediately after the URL settles. Focus
  is not moved to the new page's `h1` or `#main-content`.
- **Impact.** Low. Next's route announcer still announces the new route, and the next Tab lands on the
  visible "Skip to content" link, so the journey continues without a keyboard trap or a dead end.
- **Recommendation.** Optionally move focus to the routed page's main landmark after navigation.

### What passed

- **axe-core: 49 surface captures, 0 violations.** `@axe-core/playwright` default rule set (which
  includes colour-contrast) across 16 routes × 3 widths (1600×950, 900×950, 390×844):
  `/login`, `/home`, `/search`, `/notifications`, `/settings`, `/settings/account`, `/settings/team`,
  `/settings/clients`, `/settings/presets`, `/settings/workspace`, `/clients/{id}/board`,
  `/clients/{id}/briefings`, `/clients/{id}/briefings/new`, `/clients/{id}/reviews`,
  `/clients/{id}/assets`, `/clients/{id}/credits`, `/projects/{id}`. No contrast failure on any
  primary control, and no unlabelled control, on any of the 49 captures. This extends the existing
  suite's coverage to the four `/settings/*` sub-pages and the project canvas, which it did not reach.
- **Keyboard-only core journey completed end to end** at 1600×1000:
  1. `/login` — Tab order is email input → password input → "Forgot password?" link. Credentials typed
     with `keyboard.type`, Enter submitted the form, landing on `/home`.
  2. The SABRE-style sidebar client link (`a.nav-item.client-nav`) was reachable in **5 Tab presses**
     and Enter navigated to its board.
  3. `Help & support` was focused, opened with Enter, and focus moved **into** the dialog
     (`<h2>Help & support</h2>`).
  4. **16 alternating Tab / Shift+Tab presses all stayed inside the dialog** — no escape, no trap
     beyond the intended containment.
  5. Escape closed the dialog and **focus returned to the `Help & support` trigger**
     (`activeElement === trigger`).
- **Visible focus on every control sampled.** `outline: 2px solid rgb(37, 37, 35)` on light surfaces
  and `2px solid rgb(232, 233, 226)` inside the dark sidebar (`.sidebar :focus-visible` at
  `features/workspace/workspace.css:18`). No control was focused without a computed outline.
- **Skip link is revealed on focus.** First Tab on a page focuses `a.skip-link`; `:focus` matches, the
  `translateY(-160%)` resets to `matrix(1, 0, 0, 1, 0, 0)` and the link renders at `top: 10px`,
  `bottom: 51px` — inside the viewport. Verified on `/home`, `/clients/{id}/board` and
  `/clients/{id}/credits`.
- **Reduced motion is honoured.** `@media (prefers-reduced-motion: reduce)` at
  `apps/web/app/globals.css:1049` zeroes `animation-duration`, `animation-iteration-count`,
  `scroll-behavior` and `transition-duration` on `*`, `*::before` and `*::after`. Under emulation
  `matchMedia("(prefers-reduced-motion: reduce)").matches === true` and the four animated elements in
  the app (`.sidebar` width/transform, `.workspace` margin-left, `button.button`, `.nav-item`) all
  computed `transition-duration: 1e-05s`.
- **Touch targets** at 390px: zero controls below 24×24 on `/home`, `/credits`, `/briefings` and
  `/settings`; one on the board (J06-1).

### Not covered

Manual screen-reader verification, Safari/WebKit and Firefox rendering, and a systematic 44×44 (rather
than 24×24) target-size measurement were not performed. Zero axe violations is evidence for the rules
axe checks, not a complete accessibility certification.

---

## Summary

| Row | High | Medium | Low | Total |
|---|---|---|---|---|
| J01 | 0 | 1 | 0 | 1 |
| J02 | 0 | 2 | 1 | 3 |
| J06 | 0 | 1 | 1 | 2 |

The worst single finding is **J02-1** on `.briefing-summary h2`: a briefing whose title contains one
unbroken token wider than the content column pushes the whole document sideways at every width
measured, including 1600px, and the cut-off text has no ellipsis and no hover fallback.

No High-severity finding was recorded. No content was unreachable, no focus trap or lost focus was
observed, and no contrast failure was reported on any primary control.

## Fixture integrity

Verified after the run:

```
docker exec supabase_db_dawes-studios psql -U postgres -d postgres -tAc "select count(*) from public.clients"   # 10
docker exec supabase_db_dawes-studios psql -U postgres -d postgres -tAc "select count(*) from public.projects"  # 25
```

Both fixtures created during this audit were removed by `cleanupTestProject`; `projects` and
`briefings` hold zero rows matching `title like 'Acceptance %'`. `git status` shows no modified
tracked files from this audit and the temporary probe spec has been deleted.

## Follow-up observed during the fix pass (2026-09-21)

**94 of 106 `<label>` elements wrap their control instead of using `htmlFor`; only 3 use the
explicit association.** This is valid HTML and axe reports no violation — the association is
correct. The consequence is that the *computed accessible name* concatenates the label text with
the control's current value, producing names like `ClientChoose a client` and
`RoleDesignerAgencyClient`.

Two costs: a screen reader announces the label and the value as one run-on string, and any test
addressing the control by label becomes brittle, because selecting a different option changes the
name. `tests/e2e/intake-admin.spec.ts:575` now encodes one of these concatenated names for exactly
that reason — bare `Client` collides with the role select's own computed name.

Not fixed here: 94 sites is its own task, and the change is mechanical but wide. Recorded so the
next person treats the concatenated selector as a symptom rather than a convention to copy.
