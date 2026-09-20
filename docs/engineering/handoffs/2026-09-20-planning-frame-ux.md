# Planning frame UX/UI — Timeline and Kanban

- Updated at: 2026-09-20T16:51:21Z
- Reporting agent and tool: Planning frame UX/UI worker / Claude Code
- State: implemented, tested and verified in a rebuilt container; the Playwright acceptance suite was deliberately not run
- Objective: fix the Planning frame's visible defects and density in the new two-column board — the stray divider, the wasted period row, status-blind bars, the redundant lane titles, the unaligned open affordance, the heavy scrollbar, and the Kanban's keyboard reachability at the new frame width
- Owned paths: `apps/web/features/board/project-timeline.tsx`, `apps/web/features/board/board-kanban.tsx`, `apps/web/features/board/timeline.css`, `apps/web/features/board/timeline-model.ts`, `apps/web/features/board/timeline-model.test.ts`, and this report
- Dependencies: `board-layout.ts` sizes the frame (`PLANNING_MIN_W`, `PLANNING_MIN_H`, `LANE_H`, `PLANNING_CHROME`); `board.css` supplies `.board-planning-body .project-timeline` padding; `globals.css` supplies `.icon-button`, `.button`, `.status-badge` and the brand tokens. All four are owned by other writers and were only read.
- Acceptance criteria: the stray line gone at its cause; the period bar consolidated; bars that carry status from the board's own vocabulary; the Kanban still scrollable, keyboard reachable and not vertically squashed; `npm run check` green; measured before/after density

## Completed work and changed files

### `timeline.css` — rewritten

The calendar's row class was `.timeline-row`, which `apps/web/app/globals.css` also defines for a
project activity timeline that no longer exists in the markup. The board's rows therefore inherited
`position: relative`, `padding: 18px 0`, `gap: 16px` and — the actual defect — a
`.timeline-row::before` vertical connector (`1px` wide, `background: var(--border-strong)`,
`left: 95px`, `top: 30px`, `bottom: -30px`). The sticky label covered it inside the row's content
box; the inherited 18px padding strips above and below each row did not, which is exactly the short
segment that appeared between lanes, 111px from the frame's left edge (95px rule offset + 16px
frame padding). Verified in the running container before the change: computed `::before` was
`content: ""`, `width: 1px`, `height: 87px`, `background: rgb(202, 202, 196)`, `left: 95px`.

The fix renames the calendar's rows to `.timeline-lane` / `.timeline-lane-head` so the two
stylesheets cannot collide, rather than masking the pseudo-element. A unit test now fails if
`.timeline-row` reappears in this stylesheet.

Also in this file: a sticky head row; a compact period control in the head's label cell; the status
tints and dot shapes; a restrained scrollbar (`scrollbar-width: thin`,
`scrollbar-color: var(--border-strong) transparent`, plus the WebKit equivalents); lane min-height
56px; `.timeline-calendar` min-width lowered from 850px to 780px, which removes a 6px horizontal
scrollbar that had nothing to scroll to at the 880px frame width.

### `project-timeline.tsx`

- The full-width period row is gone. The period label, `Previous two weeks`, `Today` and
  `Next two weeks` now sit in the calendar head's own label cell, which previously held only the
  static caption `Project / Campaign`. The control is still inside a `<header>` element containing a
  `<strong>`, so the existing acceptance selector `.project-timeline header strong` keeps working
  (confirmed live).
- The head row is `position: sticky; top: 0`, so the period control and the weekday scale stay
  visible once a board has more lanes than the frame shows.
- Lane titles drop the leading segments that every lane in scope repeats. The seeded titles are
  `Client / Work / Variant`, so inside Acme's workspace the lanes now read `AI-Enhanced Add-On` and
  `Blog Design / Infographic` instead of truncating to `Acme / Blog Design / Infog…`. The full title
  stays the link's `aria-label` and the `title` tooltip.
- The bar no longer repeats the title. It carries the status dot and the status label, which is the
  one thing the grid cannot show, and its `aria-label` is
  `"<full title>, <status>, <dates spoken in full>"`. A one-day bar is too narrow for the label and
  carries only the dot; the tooltip and accessible name still say everything.
- The `↗` affordance is pinned to the title's grid row instead of floating in the middle of the
  cell, is `aria-hidden` (the link already carries the name), and strengthens on hover and focus.
- Per-cell `Intl` formatting moved out of the render into `timelineDays`.

### `board-kanban.tsx`

- The scroll region gains `tabIndex={0}` and `role="group"` beside its existing
  `aria-label="Projects by status"`, matching the calendar's `role="group"` /
  `aria-label="Schedule grid"`. Without a tab stop, a stage scrolled off the right of the 880px
  frame could only be reached with a pointer.
- Card titles use the same shared-prefix rule as the lanes; the link's `aria-label` carries the full
  title, the campaign and the due date.

### `timeline-model.ts` / `timeline-model.test.ts`

New pure functions with tests: `timelineDays`, `periodLabel`, `longDate`, `scheduleLabel`,
`sharedTitlePrefix`, `distinctTitle`. `timeline-model.test.ts` grew from 5 to 19 tests, including
two that read `timeline.css` and hold it to `boardStatuses` and to the class-name separation above.

## Decisions and interface changes

**Status colour.** `boardStatuses` is an order, not a palette, and `globals.css` gives status badges
no colour at all — it differentiates them by dot shape and border style. `timeline.css` already
carried an olive family (`#eef1e7` / `#4e5f39`), an amber one for `changes_requested`
(`#faf0de` / `#795b23`) and a neutral one for finished work. No new hue was introduced: the bars are
tonal steps inside those three existing families, ordered by `boardStatuses`, and the dot shapes
follow `.status-badge` exactly (hollow for `internal_review`, square for `delivered`). Colour is
never the only channel — every bar wide enough writes its status out. Measured contrast: bar text on
bar fill ranges 6.4:1 to 7.9:1; every bar border is ≥3.0:1 against the white grid.
`docs/architecture/design-system.md` line 21 asks that status chrome stay "monochrome"; that line
predates the olive and amber already in this stylesheet, so the orchestrator should rule on whether
the tonal ramp is acceptable or whether the bars should be a pure neutral ramp with the same shapes
and labels. Switching is a one-block edit in `timeline.css`.

**Titles.** The rule is "drop the leading `/`-separated segments that at least two lanes in scope
share, never the last segment", not "strip the client name". It needs no new prop, is deterministic,
and does nothing when the titles differ from the first segment.

### Interface requests — files this worker does not own

1. **`apps/web/features/board/board-layout.ts` — the chrome constants now disagree with the render.**
   Measured in the rebuilt container at the 880×420 frame: frame border 2, frame head 56, body
   border-top 1, `.project-timeline` padding 16+16, `.timeline-scroll` borders 1+1, calendar head row
   58.19 — total 151.19 above the first lane; one lane is exactly 56.0.
   - `LANE_H`: `88` → **`56`**
   - `PLANNING_CHROME`: `PLANNING_HEAD + 56 + 64 + 24` (= 200) → **`152`** (the `56` for the period
     bar no longer exists as a row; the `64` weekday header is now a 58px head row that also holds
     the period control)
   - Optional: `PLANNING_MIN_H` is `420`, which with the seeded two lanes leaves ~215px of empty
     frame. `planningContentHeight(2)` under the new constants is 264; a floor near 280 would fit two
     lanes with margin. `PLANNING_MIN_W` should stay at `880` — the calendar now needs only 816, but
     the Kanban still needs 1140 and scrolls.
2. **`apps/web/app/globals.css` — delete the dead activity-timeline block.** `.timeline-board`,
   `.timeline-row`, `.timeline-row::before`, `.timeline-row:last-child::before`, `.timeline-row h3`,
   `.timeline-row .eyebrow`, `.timeline-row > svg`, `.timeline-date` and `.timeline-dot`
   (approx. lines 1440–1490, plus 2111–2123 in the narrow media query) have no markup left anywhere
   in `apps/web`. The rename makes the collision impossible to recur, but the dead rules should go.
3. **`docs/architecture/design-system.md`** — the Timeline paragraph (approx. line 96) could record
   that the period control now lives in the calendar's own corner and that a bar carries the status
   label rather than the project title. Not edited here: the file is already modified in the working
   tree by the orchestrator, and concurrent edits to a shared document are what the continuity rules
   forbid.
4. **No e2e change is requested.** `apps/web/tests/e2e/workspace-actions.spec.ts:71` reads
   `.project-timeline header strong`; that selector, and the `Previous two weeks` / `Today` /
   `Next two weeks` / `Kanban` / `Timeline` control names it drives, were all exercised live and
   behave as the spec expects.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check --prefix apps/web` | macOS host, 2026-09-20 | **pass** — typecheck clean; ESLint 0 errors and 1 pre-existing warning in `board-page.tsx` (not an owned file); Prettier clean; 181 unit tests in 9 files | terminal |
| `npx vitest run features/board/timeline-model.test.ts` | macOS host | **pass** — 19 tests | terminal |
| `docker compose --env-file .env.production up --build -d --wait` | Docker, 2026-09-20 | **pass** — `dawes-studios-web:local` and `dawes-studios-media:local` both rebuilt, both containers healthy; all later measurements were taken against this build | terminal |
| Timeline geometry, before, agency at 1600×1000 / 1440×900 / 1280×800 / 1100×800 / 820×800 | localhost:3003, seeded SABRE board | lane 88.0px; calendar head 100.5px; separate period row 40px + 20px margin; scroll clientH 267 / scrollH 277 (overflowed with 2 lanes); clientW 844 / scrollW 850; 1 lane fully visible; `::before` = 1px × 87px at `left: 95px`, `rgb(202,202,196)`; row `padding: 18px 0`, `gap: 16px`, `position: relative` | `before.json` (scratchpad), `before-timeline-*.png` |
| Timeline geometry, after, same five widths | localhost:3003 | lane 56.0px; head row 58.19px (period control + weekday scale, sticky); scroll clientH 327 / scrollH 327 (no overflow at 2 lanes); clientW 844 / scrollW 844; **4 lanes fully visible**; `::before` computed `content: none`; row padding `0px`, gap `normal`, position `static` | `after.json`, `after-timeline-*.png`, `closeup-planning.png` |
| Lane overflow under 14 lanes (DOM-cloned, client-side only) | localhost:3003 | scrollH 842 vs clientH 327; head row stays pinned while lanes scroll under it; 4 lanes fully visible | `closeup-planning-stress.png` |
| Kanban, before and after, five widths | localhost:3003 | unchanged: board clientW 878 / scrollW 1140, columns 148px, headings computed `sticky`; 12-card stress scrollH 1795 vs clientH 327 — **not squashed**. Changed: `tabIndex` −1 → 0, `role` null → `group`, label kept | `before.json`, `after.json`, `closeup-kanban.png` |
| Kanban keyboard scrolling | localhost:3003 | focus lands on `.kanban-board`; 20 × ArrowRight scrolls 0 → 262 = `scrollWidth − clientWidth` | `kanban-keyboard-scrolled.png` |
| Period paging and Today | localhost:3003 | `Sep 14 – 27, 2026` → `Sep 28 – Oct 11, 2026` → back → Today restores; value survives a Kanban round trip | terminal |
| Keyboard order out of the grid | localhost:3003 | scroll region → Previous two weeks → Today → Next two weeks → first lane link | terminal |
| All seven statuses rendered | Kestrel Outdoor, Otto & Sons, Northfield Bank, SABRE, Acme boards | planned (white, dashed), in_progress (deepest olive), internal_review (light olive, hollow dot), client_review (mid olive), changes_requested (amber), approved (neutral, filled dot), delivered (neutral, square dot) — each with its label written out | `status-kestrel.png`, `status-otto.png`, `status-northfield.png` |
| Narrow fallbacks | 820×800 and 600×800 | 820 keeps the canvas; below 640 the board is still the list layout with 2 rows and no canvas | `after-kanban-820x800.png`, `after-list-600x800.png` |
| Console/page errors across every run | localhost:3003 | none | measurement output |
| `npm run test:e2e` | — | **not run**, by instruction; the suite mutates the shared seeded baseline | — |

Screenshots were read back as images, not inferred from the DOM. Evidence files live in this
session's scratchpad and are not committed; the committed verification screenshots under
`docs/verification/screenshots/` were not regenerated, because that is the acceptance run the
orchestrator owns.

## Remaining risks and next action

- **The frame will size itself wrongly until `board-layout.ts` is updated.** `LANE_H` 88 against a
  real 56 and `PLANNING_CHROME` 200 against a real 151.19 mean `planningContentHeight` overestimates
  by 48 + 32 per lane. The visible symptom today is empty space, not clipping, because
  `PLANNING_MIN_H` dominates at two lanes — but a board with many lanes would reserve far more height
  than the calendar uses. This is interface request 1 and is the next required action.
- **Density beyond four lanes is extrapolated, not observed with real data.** Every seeded client has
  exactly two projects, so the 14-lane overflow check was done by cloning lane nodes in the browser.
  The lane height, head height and scroll arithmetic are real measurements; the count of lanes a
  20-project board would show is arithmetic on them.
- **The styled scrollbar could not be photographed.** Headless Chromium on this host draws overlay
  scrollbars (`offsetHeight − clientHeight` stays 2px, the border, even under overflow), so no bar is
  painted into the screenshots. What is verified is that the declarations reach the element:
  computed `scrollbar-width: thin` and `scrollbar-color: rgb(202, 202, 196) rgba(0, 0, 0, 0)` on
  `.timeline-scroll`. A reviewer on a machine with classic scrollbars should confirm the appearance.
- **The status tint question above needs an orchestrator ruling** against
  `docs/architecture/design-system.md` line 21.
- Long titles can still truncate after the shared prefix is removed — `Creative Direction /
  Operations` does not fit 220px. The tooltip and accessible name carry the whole title. Widening the
  label column was ruled out by the brief.

## Ownership at handoff

All five owned paths are released: `project-timeline.tsx`, `board-kanban.tsx`, `timeline.css`,
`timeline-model.ts`, `timeline-model.test.ts`, and this report. No process is left running against
them. `board-layout.ts`, `board-nodes.tsx`, `board-page.tsx`, `board.css` and `globals.css` were read
only and were never written. The running containers were rebuilt from the working tree as it stood at
the time of this report, which included other writers' in-flight changes to `board-page.tsx`,
`board-layout.ts`, `board-nodes.tsx`, `board.css`, `planning-view.ts`, `planning-project.tsx` and
`project-thumbnail.tsx`. Intended recipient: the orchestrator.
