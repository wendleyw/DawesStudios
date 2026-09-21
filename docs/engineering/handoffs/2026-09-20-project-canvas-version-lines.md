# Project canvas: each version as one horizontal line, deliverables as stacked sections

- Updated at: 2026-09-20T19:05:00Z
- Reporting agent and tool: Project canvas layout worker / Claude Code
- State: implemented, unit tested (255 vitest tests, 33 of them in this module), and verified in a rebuilt container at 1600 x 1000 and 390 x 844; the Playwright acceptance suite was deliberately not run (the orchestrator coordinates it)
- Objective: make every version read as a horizontal line — the version's label and meta on the left, its designs in a row beside them, the next version as the line below — instead of a card whose header stacks above its designs
- Owned paths: `apps/web/features/projects/canvas-layout.ts`, `apps/web/features/projects/canvas-layout.test.ts`, `apps/web/features/projects/project-page.tsx`, `apps/web/features/projects/projects.css`, one paragraph of `docs/architecture/design-system.md`, and this report
- Dependencies: `project-data.ts`, `artwork.tsx`, `design-viewer.tsx`, `comment-panel.tsx`, `project-details.tsx`, `project-action-dialog.tsx` (all read only, none changed); `board-layout.ts` (read only) is the model this module follows
- Acceptance criteria: label and designs side by side on one line, versions stacked as a list, no node measured after paint, declared height equal to rendered height, zero overlapping pairs, every existing behaviour preserved, `npm run check` green, and browser-measured geometry reported

## Completed work and changed files

### `canvas-layout.ts` / `canvas-layout.test.ts`

The module keeps its character — exported constants, small pure functions, `buildCanvas` returning
plain frames — and changes what it describes.

- A version line is `CARD_BORDER + LABEL_W + designsWidth(count)` wide. `LABEL_W` is 200, exactly one
  tile, so the label column starts the line on the same rhythm as the images.
- A version line is `CARD_BORDER + max(versionLabelHeight(version), ROW_PAD * 2 + artwork + CAPTION_H)`
  tall. The designs usually win; the label column only decides for an empty version.
- `designsWidth` adds a trailing slot (`TILE_GAP + MORE_W`) when the row hides designs, so the
  "+N more designs" control stays **on** the line instead of adding a row beneath it. `MORE_H` is gone.
- `buildCanvas` now stacks sections: every frame is at `x: 0`, versions are `VERSION_GAP` (12) apart,
  deliverables `SECTION_GAP` (40) apart, and a deliverable with no version yet ends at its header.
  Overlap is impossible by construction, not by arithmetic.
- `deliverableHeadWidth` caps the header at the label column plus two tile slots (634), so a
  five-tile section does not strand its "new version" control 1300 px from the name.
- `canvasBounds` / `canvasFit` compute the opening viewport from the frames (see the decision below).

`versionCardWidth` now includes `CARD_BORDER`. It did not before, so the old 432 px card offered its
two tiles 430 px of interior for 432 px of content and clipped the second tile by 2 px.

33 unit tests, no rendering.

### `project-page.tsx`

- `VersionCard` renders a `.version-label` column (header with `V1` + status + add-design, the note,
  client feedback, and a footer holding the design count above the version's one action) and a
  `.version-designs` row beside it. The more control moved inside that row.
- `fitView` / `fitViewOptions` were replaced by `CanvasOpeningView`, which applies `canvasFit` once
  per mount from the frames and the pane's own size (a `ResizeObserver` on `.project-canvas`, not on
  any node). `defaultViewport` is `{x: 0, y: 0, zoom: 1}`, as on the board.
- Unchanged: the deliverable header node, the empty-version state, notes, client feedback,
  publish/submit/review controls, the `!format || deliverable.id === format` filter, the
  "+N more designs" control, `draggable: false` / `selectable: false`, and the `.version-card`,
  `.design-preview`, `.deliverable-header` class names the acceptance suite selects on.
- No node is measured after paint: `nodeHeights`, `measureNodes` and `onNodesChange` remain absent.

### `projects.css`

`.version-card` became a flex row; `.version-label` is a 200 px column with a faint background and a
right divider; `.version-designs` gained its own padding and holds the tiles, the invitation and the
trailing more slot. Fixed sizes mirror the module: header 56, footer 66, note 40, feedback 70 + 20
margins, empty 144 inside 12 px padding, tile 200, more slot 112.

### `docs/architecture/design-system.md`

The "Project canvases" paragraph now describes stacked sections and version lines, the ragged right
edge, the header cap, and the opening view. This is a shared file; the edit is confined to that
paragraph.

## Decisions and interface changes

### Deliverables became stacked sections, not side-by-side columns

Putting the label beside the images makes a line `2 + 200 + 24 + n * 200 + (n - 1) * 8` wide:
426 for one design, 634 for two, 842 for three, 1258 for five, 1378 for five plus the more slot.
The canvas pane measures **1360 x 759** in a 1600 px window (the workspace sidebar takes the rest).

Side by side with the old 40 px column gap that gives:

| Two sections of | Total width | Fit zoom in a 1360 px pane | Tile at that zoom |
| --- | --- | --- | --- |
| 2 designs | 1308 | 1.0 | 200 |
| 3 designs | 1724 | 0.76 | 152 |
| 5 designs | 2796 | 0.47 | 94 |

Columns only survive the seed's current two-design maximum; the row is built to hold five, and at
five they do not fit at any readable zoom (94 px is below `ARTWORK_MIN_H`, the size under which this
module refuses to draw a preview at all). The second reason is the one the shape is for: sections of
different widths put their label columns at different `x`, so the labels stop lining up and the
canvas stops reading as a list. Stacked at `x: 0` they form one rail, which is the calendar's sticky
label column applied to versions. Measured: the widest node in either real project is a single line,
so both open at zoom 1 instead of 0.76–0.85 as columns.

### The opening view is computed, and pinned to the top

Stacking costs height: Northfield Bank / Digital Ad (Animated) is 1568 px of content in a 759 px
pane. xyflow's `fitView` would have opened it at zoom 0.41 **and centred it**, hiding the first
deliverable header and V1 above the pane — observed in the first rebuilt container before this
change. `canvasFit` fits the width, never magnifies past 1, floors the zoom at
`ARTWORK_MIN_H / TILE_W` = 0.7, and anchors `y` at 24 so the list opens at its top and scrolls.
This follows `boardFit` in `features/board/board-layout.ts`, which answers the same problem for the
board's tall stack. **It is a near-duplicate with different constants** (floor 0.7 vs 0.4). Extracting
a shared helper would mean writing a board-owned file, so it stayed local — flagged for the
orchestrator. The Fit View control still shows the whole project on request.

### `MIN_ROW_DESIGNS` removed, `MAX_ROW_DESIGNS` kept at 5

`MIN_ROW_DESIGNS = 2` floored every card at two tile slots so a column kept a straight right edge.
With one rail at `x: 0` the left edge is straight by construction, and the right edge now carries
information: a three-design line is visibly longer than a one-design line. A phantom slot beside a
lone design would read as a missing image on a line rather than as a free slot inside a card. It is
replaced by `EMPTY_SLOTS = 2`, which applies only to the "no design yet" invitation.

`MAX_ROW_DESIGNS` stays 5, but its reason changed: it used to be what left room for the next
deliverable column. There are no columns now, so the limit is the line itself — five tiles plus the
label column and the more slot come to 1378 px against a 1360 px pane, measured at fit zoom 0.952.
A sixth tile (1586 px) would open every project at 0.83 and keep falling.

### Other constants

`HEADER_H` 60 → 56 (a 32 px icon button; 36 px left the status too little room in a 200 px column),
`FOOTER_H` 48 → 66 (the count sits above a full-width action, which does not fit beside it),
`EMPTY_H` 168 → 144 (the row now supplies its own padding), `VERSION_GAP` 24 → 12,
`COLUMN_GAP` → `SECTION_GAP`, `columnWidth` → `sectionWidth`, `CanvasLayoutColumn` →
`CanvasLayoutSection`. Harbor & Pine's V1 — two designs and a note, square artwork — is now a 261 px
line where the same version was a 385 px card (2 + 60 header + 235 designs + 40 note + 48 footer).

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check --prefix apps/web` | macOS host, 2026-09-20 | pass — typecheck, lint (2 pre-existing warnings in `features/board`), format, 255 tests in 12 files, 33 of them in this module | terminal |
| `docker compose --env-file .env.production up --build -d --wait` | web and media rebuilt together, twice | both containers healthy each time | terminal |
| Harbor & Pine / Branded Specialty Design, agency internal, 1600 x 1000 | rebuilt container | pane 1360 x 759, zoom 1, top pinned 24 px below the pane edge; head 634 x 64 @ (0,0), V1 634 x 261 @ (0,80) with 2 tiles, V2 426 x 261 @ (0,353), head 426 x 64 @ (0,654), V1 426 x 344 @ (0,734), V2 426 x 344 @ (0,1090); declared = rendered on all 6 nodes; **0 overlapping pairs**; label beside designs on every line | `shots/harbor.png` |
| Northfield Bank / Digital Ad (Animated) (reel 1080 x 1920), 1600 x 1000 | rebuilt container | zoom 1; head 634 x 64 @ (0,0), V1 634 x 361 @ (0,80) with 2 tall tiles, V2 426 x 361 @ (0,453), head 426 x 64 @ (0,854), V1 426 x 311 @ (0,934), V2 426 x 311 @ (0,1257); declared = rendered on all 6; **0 overlapping pairs** | `shots/northfield.png` |
| Harbor & Pine, client channel | rebuilt container | head 634 x 64 @ (0,0), V1 634 x 261 @ (0,80), head 426 x 64 @ (0,381), V1 426 x 344 @ (0,461); declared = rendered; 0 overlaps; no designer metadata on screen | `shots/harbor-client-canvas.png` |
| Kestrel Outdoor / Content Production, client channel | rebuilt container | client feedback panel exactly 70 px and not clipped, status "Changes Requested" not truncated, line 261 declared and 261 rendered | `shots/kestrel-feedback.png` |
| Deliverable filter → adaptation only | rebuilt container | one section at (0,0), head 426 x 64, V1 and V2 426 x 311 at y 80 and 403; 0 overlaps | `shots/filtered.png` |
| Open a design from a tile | rebuilt container | the design viewer opens (1 `.design-viewer`) | `shots/viewer.png` |
| Eight designs on one version, injected into the REST response in the browser only | rebuilt container | line 1378 x 261 declared and rendered, 5 tiles plus a trailing "+3 more designs" slot on the same line, footer reads "8 designs", zoom 0.952, 0 overlaps | `shots/seven-designs-canvas.png` |
| Every version emptied, injected into the REST response in the browser only | rebuilt container | each line 634 x 170 declared and rendered, invitation and "Add design" present, 0 overlaps | `shots/empty-versions.png` |
| Northfield Bank at 390 x 844 | rebuilt container | pane 390 x 540, zoom clamped to the 0.7 floor, top pinned, declared = rendered, 0 overlaps; the line is wider than the pane and pans | `shots/northfield-390-canvas.png` |
| Console and page errors across every scenario above | rebuilt container | none | measurement output |

Screenshots were read back and inspected, not only captured. They live in this session's scratchpad,
not in the repository; re-run the measurement against the rebuilt container to reproduce them.

## Acceptance suite call sites that depend on the canvas shape

Not edited, as instructed. All of them still pass against the new markup by inspection — the class
names, the `V2` text inside a `.version-card`, and the vertical ordering of cards are preserved — but
they are the surfaces to re-run first:

- `apps/web/tests/e2e/design-audit.spec.ts:193` — `.version-card` count of 2
- `apps/web/tests/e2e/design-audit.spec.ts:199` — two version cards must not overlap vertically (still true: `VERSION_GAP` 12)
- `apps/web/tests/e2e/design-audit.spec.ts:214` — `.deliverable-header` must not overlap its first version (still true: `HEAD_GAP` 16)
- `apps/web/tests/e2e/design-audit.spec.ts:98`, `:100`, `:129`, `:131` — `.design-preview` visible and clickable
- `apps/web/tests/e2e/production-workflow.spec.ts:151`, `:153`, `:162`, `:164` — `.version-card` count, filtered by the `V2` text, then a button inside it
- `apps/web/tests/e2e/production-workflow.spec.ts:94`, `:105` — `.design-preview` counts of 0 and 2
- `apps/web/tests/e2e/workspace.spec.ts:20` — `.design-preview` click
- `apps/web/tests/e2e/workspace-actions.spec.ts:311`, `apps/web/tests/e2e/canonical-workspaces.spec.ts:50`, `apps/web/tests/e2e/workspace.spec.ts:17`, `apps/web/tests/e2e/design-audit.spec.ts:97` — `.project-canvas .react-flow` visible

## Remaining risks and next action

- The release note and client feedback now clamp inside a 200 px column, roughly two lines of 28
  characters, where they previously had the card's full width. The longest seeded note (54
  characters) and feedback (45) still fit — measured, not clipped. The `design-audit` long-note
  fixture will show less of its note; that test asserts non-overlap only.
- On a phone the line is wider than the pane and pans horizontally instead of shrinking to fit. That
  is the deliberate cost of the 0.7 floor: the alternative fits the whole list at 0.41, where nothing
  can be read. If the audit prefers the old behaviour, the lever is `MIN_FIT_ZOOM`, not the geometry.
- `canvasFit` duplicates the shape of `boardFit` with different constants. Extraction needs an owner
  who may write both features.
- The five-tile row and the empty-version state do not occur in the seed and were exercised by
  rewriting the REST response in the browser. Nothing was written to the database and the baseline is
  untouched. If the acceptance matrix wants either on screen from real data, the seed owner would
  have to give one version four or five designs, or leave one version empty.
- The Playwright acceptance suite was not run. Running it is the next concrete action, starting with
  `design-audit.spec.ts` and `production-workflow.spec.ts`.
- `docs/engineering/handoff.md` was not touched; the shared checkpoint belongs to the orchestrator.

## Ownership at handoff

All owned paths are released; no worker or process of mine is still writing. Containers were left
running and healthy on the rebuilt image. The intended recipient is the orchestrator.
