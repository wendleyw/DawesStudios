# Project canvas: a version's designs in one row, the next version below

- Updated at: 2026-09-20T22:40:00Z
- Reporting agent and tool: Project canvas layout worker / Claude Code
- State: implemented, unit tested, and verified in a rebuilt container at 1600 x 1000 and 390 x 844; the Playwright acceptance suite was deliberately not run (the orchestrator coordinates it)
- Objective: lay each version's designs out in a single row with the next version underneath, so a version that gathers several images stays organised; replace the measured `nodeHeights` layout with computed geometry
- Owned paths: `apps/web/features/projects/canvas-layout.ts` (new), `apps/web/features/projects/canvas-layout.test.ts` (new), `apps/web/features/projects/project-page.tsx`, `apps/web/features/projects/projects.css`, one paragraph of `docs/architecture/design-system.md`, and this report
- Dependencies: `project-data.ts` (read only) supplies `deliverables.width/height` and the version/design records; `artwork.tsx` (read only) renders the tile's artwork and is sized from outside through a CSS custom property; `board-layout.ts` (read only) is the model this module follows
- Acceptance criteria: one row per version, versions stacked in order under their deliverable, card width driven by the row and floored at a shared minimum, columns that cannot overlap, every existing behaviour preserved, `npm run check` green, and browser-measured geometry reported

## Completed work and changed files

### `canvas-layout.ts` / `canvas-layout.test.ts` (new)

The canvas geometry as pure functions, in the shape of `board-layout.ts`: exported constants, small
pure functions, and a `buildCanvas` that returns plain frames with `x`, `y`, `width`, `height`, the
column's `artworkHeight`, and how many designs the row shows (`visible`) or hides (`hidden`).
24 unit tests, no rendering.

- `artworkHeight(width, height)` gives a deliverable its own proportions — 1080 x 1080 square is a
  200 px square, 1080 x 1350 is 250 px, 1080 x 1920 clamps at `ARTWORK_MAX_H` 300 — and falls back to
  a square for the deliverables that carry no dimensions.
- `versionCardWidth(count)` is `ROW_PAD * 2 + slots * TILE_W + (slots - 1) * TILE_GAP`, with slots
  floored at `MIN_ROW_DESIGNS` and capped at `MAX_ROW_DESIGNS`.
- `versionCardHeight(version, artwork)` sums fixed parts: border, header, the design row or the empty
  invitation, the optional more control, the optional note and feedback blocks, and the footer.
- `columnWidth(versions)` takes the widest card in the column; `buildCanvas` advances `x` by that
  width plus `COLUMN_GAP`, which is what makes an overlap impossible.

`MIN_ROW_DESIGNS` is **2**. The board answers the same problem with `MIN_ROW_CARDS`. Two is the floor
here because a single tile in a card would read as the old stacked column rather than a row, the free
slot is where the next design lands, and against the current baseline — 28 versions holding one
design, 5 holding two — it gives every version card the same width, so each column keeps a straight
edge. `MAX_ROW_DESIGNS` is **5**: a sixth tile would take the card past 1250 px and push the next
deliverable column off a 1600 px canvas, so the rest stay behind the existing "+N more designs"
control.

### `project-page.tsx`

- `nodeHeights`, `measureNodes` and `onNodesChange` are gone. Nodes are built from `buildCanvas`
  frames, and each node carries an explicit `width` and `height`.
- `VersionCard` renders `designs.slice(0, data.visibleDesigns)` instead of a hard-coded two, and the
  more control opens `designs[visibleDesigns]`.
- The designs row sets `--artwork-height` from the frame, so every tile of a deliverable shows that
  deliverable's proportions.
- Client feedback text moved into a `<span>` inside `.version-feedback` so it can be clamped
  independently of its label.
- Unchanged: the deliverable header node and its dimensions line, the empty-version state, version
  notes, publish/submit/review controls, the `!format || deliverable.id === format` filter, and
  `draggable: false` / `selectable: false`.

### `projects.css`

Fixed heights that mirror the module (header 60, caption 35, note 40, feedback 70 + 20 margins,
footer 48, more control 34 + 8, empty 168, deliverable header 64), a 200 px tile that no longer
flexes, an artwork box driven by `--artwork-height` that also holds while the preview is still
loading, and two-line clamps on the note and the feedback. The `:has(.design-preview:nth-child(2))`
rules that shrank the artwork for a second design were removed — tiles are now uniform.

### `docs/architecture/design-system.md`

The "Project canvases" paragraph now describes the implemented layout instead of the reference's
308 px columns. This is a shared file; the edit is confined to that one paragraph.

## Decisions and interface changes

- No interface request: `deliverables.width/height` already existed and nothing outside the owned
  paths had to change.
- The card's height no longer depends on text wrapping, which is why the note and feedback are
  clamped. Both fit the current data (longest note 54 characters, longest feedback 45) on one line.
- `.version-card > .more-designs` is deliberately more specific than `.button`, so the shared 40 px
  minimum cannot re-grow that row and break the computed height.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check --prefix apps/web` | macOS host, 2026-09-20 | pass — typecheck, lint (2 pre-existing warnings in `features/board`), format, 246 tests in 12 files, 24 of them new | terminal |
| `docker compose --env-file .env.production up --build -d --wait` | web and media rebuilt together | both containers healthy | terminal |
| Agency, `SABRE / Social Post (Static)`, 1600 x 1000 | rebuilt container, 2026-09-20 | columns at x 0 and x 472 (432 + 40 gap); every node's rendered height equals its declared height (64/64, 435/435, 385/385); 0 overlapping pairs; V1 shows two tiles in one row, V2 sits below | `shots/after-sabre.png` |
| Same project with a version of seven designs, injected into the REST response in the browser only | rebuilt container | row shows 5 tiles and "+2 more designs"; card 1056 x 477 declared and rendered; next column moved to x 1096; 0 overlaps | `shots/wide-seven.png` |
| `Acme / Blog Design / Infographic` (1080 x 1920) | rebuilt container | artwork box clamped to 300, card 485 declared and rendered | terminal |
| `Kestrel Outdoor / Content Production`, client channel | rebuilt container | feedback panel exactly 70 px, card 475 declared and rendered, text not clipped | `shots/after-client-feedback.png` |
| Deliverable filter, open a design, 390 x 844 | rebuilt container | filtered canvas is one column at x 0; a tile still opens the design viewer; the phone fits the whole canvas at zoom 0.387; no console errors | `shots/filtered.png`, `shots/viewer.png`, `shots/phone.png` |

Screenshots were read back and inspected, not only captured. They live in this session's scratchpad,
not in the repository; re-run the measurement against the rebuilt container to reproduce them.

## Remaining risks and next action

- No seeded version holds more than two designs, so the five-tile row and the "+N more designs"
  control were exercised by rewriting the REST response in the browser. Nothing was written to the
  database and the eight-table baseline is untouched. If the acceptance matrix wants that case on
  screen from real data, the seed owner would have to give one version four or five designs.
- A version with no design at all does not occur in the seed either; `EMPTY_H` is covered by unit
  tests only.
- At 390 px the canvas now fits a wider board, so the fit zoom fell from roughly 0.6 to 0.387 and the
  card text is small until the viewer zooms in. The zoom and fit controls still work. If the audit
  wants readable text on a phone, the fix is a `minZoom` in `fitViewOptions`, not a change to the
  geometry.
- A one-design version card keeps an empty tile slot on its right, which is the deliberate cost of
  the floor and matches how the board frames a one-project campaign.

## Ownership at handoff

All owned paths are released; no worker or process of mine is still writing. The shared checkpoint in
`docs/engineering/handoff.md` was not touched — that belongs to the orchestrator, which is the
intended recipient.
