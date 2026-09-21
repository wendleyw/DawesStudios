# Board card selection, opening a project in the Planning frame, and card artwork

- Updated at: 2026-09-20T20:05:00Z
- Reporting agent and tool: Board card interaction worker / Claude Code
- State: implemented, unit tested, and verified in a rebuilt container for the agency, client and designer roles; the Playwright acceptance suite was deliberately not run
- Objective: one click on a project card selects it and does not navigate; two clicks open that project inside the Planning frame as a third state of that frame with a clear way back to Timeline or Kanban; each card carries the artwork its viewer is allowed to see
- Owned paths: `apps/web/features/board/board-nodes.tsx`, `apps/web/features/board/board.css`, `apps/web/features/board/board-page.tsx`, the new `apps/web/features/board/planning-view.ts`, `planning-view.test.ts`, `planning-project.tsx`, `project-thumbnail.tsx`, and this report
- Dependencies: `board-layout.ts` (read only) supplies the frame geometry and `CARD_W`/`CARD_H`; `project-timeline.tsx` and `board-kanban.tsx` (read only) remain the other two frame states; `features/projects/project-page.tsx` and `project-data.ts` (read only) remain the only definition of what each role may see in a project; `private.can_produce` and `private.can_client_channel` enforce the artwork sources
- Acceptance criteria: single click selects only, visibly and for assistive technology; double click opens the double-clicked project in the Planning frame; dragging still works and still persists, and is never read as a click; no client is served designer identity, internal comments, source metadata or unpublished artwork; `npm run check` green

## Completed work and changed files

### `planning-view.ts` / `planning-view.test.ts` (new)

The frame's rules as pure functions, so they can be tested without a canvas: `PlanningMode` (moved
here from `board-nodes.tsx`), `PlanningView`, `planningView`, `planningBackLabel`,
`planningFrameHeight` and `selectionFromChanges`. 14 new unit tests.

`selectionFromChanges` exists because selection on this board has to be controlled. With a
controlled `nodes` prop, xyflow's `handleNodeClick` does not change its own store — it only emits a
`select` change and rebuilds its internal nodes from the array it is next given, so a selection the
board does not record is discarded on the next rebuild.

### `board-nodes.tsx`

- `PlanningNode` gained `projectId` and `onCloseProject`. When a project is open the header replaces
  the Timeline/Kanban control with `Back to Timeline` / `Back to Kanban` (named after the layout it
  will return to) and an `Open full view` link to `/projects/:id`, and the body renders
  `PlanningProject` instead of the timeline or the kanban.
- `ProjectCard` no longer wraps its body in a `Link`. The body is a plain element with an
  `onDoubleClick`, the artwork band sits above the title, and an explicit `Open … in planning`
  button in the card's corner gives the second click a keyboard and pointer equivalent. The card's
  description was dropped to make room for the band inside the fixed `CARD_H`.

### `planning-project.tsx` (new)

Renders `ProjectPage` itself rather than a summary of it, so the channel a role reads, what a client
is never sent, and who may produce, publish or review stay defined in one place. Two details the
board forces: `<ReactFlow>` reuses an enclosing store instead of creating one, so the project canvas
is wrapped in its own `ReactFlowProvider` or it would share the board's nodes; and the component is
memoised on the project id so the board's constant node rebuilds do not re-render the project.

### `project-thumbnail.tsx` (new)

`useProjectThumbnails` resolves one signed URL per project for a whole board in a single query and a
single `createSignedUrls` call. The source is chosen by role — `designs.internal_asset_path` in the
private `internal-assets` bucket for the agency and the assigned designer, `published_designs.asset_path`
in `published-assets` for a client — and RLS is the real enforcement; the role check only keeps a
client from ever asking for an internal path. This follows the `brand-assets.tsx` precedent,
including the `@next/next/no-img-element` exception for caller-scoped expiring URLs. Most projects
have no artwork, so `ProjectThumbnail`'s empty band is a quiet tile, not a broken image.

### `board-page.tsx`

- `openProjectId` and `selectedProjectId` state; both are resolved against the board's own project
  scope every render, so switching workspace cannot leave a stranger's project open, while a filter
  that merely hides a card does not close it.
- `changeNodes` now records selection from the reported changes before the existing drag handling,
  and every project node carries `selected` and `aria-current`. Two visually hidden `role="status"`
  regions announce selection and opening separately.
- Two visible-defect fixes described under decisions: every node now states its own `width`/`height`,
  and the canvas ResizeObserver is attached through a callback ref.

### `board.css`

Frame header tools for the project state; `.planning-project` sizing that makes the page-shaped
project view fit the frame; the inner canvas's controls moved to the frame's bottom-right so they do
not land on top of the board's own controls; the artwork band and its empty state; the card's open
button; and a selection ring strong enough to read across a board of cards.

### `docs/architecture/design-system.md`

The board paragraph said Timeline and Kanban were the frame's modes and that Planning and the
campaign frames should be connected "by highlighting the matching card on hover" — the hover
rebuild that this board is documented as having to avoid. Updated to the three states, to selection
rather than hover, and with a paragraph describing the card's two-step pointer behaviour, the
reuse of the project view, and the role-scoped artwork.

## Decisions and interface changes

**Every node states its own size.** The first working version failed on the second card every time.
Instrumenting the DOM showed the second `pointerdown` of a double click landing on
`.react-flow__pane`. Cause: `adoptUserNodes` rebuilds its internal node from the array it is given
and keeps `measured` only when the object is reference-equal. This board rebuilds every node object
on each render, so on the click that changed the selection the card lost its dimensions, was
rendered `visibility: hidden` and clamped to its parent's corner until the resize observer ran
again — long enough to miss the second click. Passing `width`/`height` on every node removes the
window entirely. This also removes a pre-existing flicker on every filter change and every drag
step. Dragging is unaffected: the measured shortfall in a scripted drag is exactly one interpolation
step, which is the pre-existing `nodeDragThreshold={4}`, and the persisted offset matches the
on-screen offset exactly.

**The board never fitted itself on load.** The ResizeObserver was attached in an effect that ran
while the component was still returning its loading state, so `canvas.current` was null and the
effect — keyed on `layout` — never ran again. `measured` stayed false, the auto-fit was gated off,
and the viewport stayed at `translate(0px, 0px) scale(1)` while the board is 1820px wide in the new
two-column layout, i.e. it opened clipped. Replaced the ref with a callback ref. The auto-fit is
additionally gated on xyflow's pan/zoom instance existing, because `setViewport` is silently dropped
before it does. Measured: the board now opens at `translate(24px, 24px) scale(0.720879)`, which is
the same fit the manual control produces for the measured canvas.

**Interface request — `board-layout.ts` (not edited).** `buildStack` should learn about the frame's
third state. Beside the campaigns, `board-page.tsx` raises the Planning node to
`PLANNING_PROJECT_MIN_H` (640) through `planningFrameHeight`, which is safe because Planning owns
its own column there. Stacked, it cannot: `buildStack` places the campaign frames below Planning
using `planningHeight(open, viewportWidth)`, so growing the node would overlap them. An opened
project therefore has 380px at stacked widths (measured at 1024 and 760), which works — it scrolls —
but is tight. Requested: `StackInput` gains something like `planningProject: boolean`, and
`planningHeight`/`buildStack` reserve roughly 640px for it in both layouts, after which
`planningFrameHeight` can be deleted.

**Interface request — `features/projects/project-page.tsx` (not edited, not board-owned).** Its
header opens with an icon link back to `/clients/:clientId/board`, which inside the frame is the
board the viewer is already on. `board.css` hides that one link within `.planning-project`. An
optional `embedded` or `onBack` prop would replace the CSS override with a real decision in the
component.

**Not done deliberately.** The project view's own `<h1>` now appears inside a page that already has
a visually hidden `<h1>`. Heading order does not skip a level, so this is left as is rather than
worked around in CSS.

## Playwright acceptance call sites this change affects

Not run and not modified — the orchestrator owns the suite because it mutates the shared seeded
database. Every place that clicks a project card on the canvas, with what it now needs:

| File and line | Current call | What it now needs |
| --- | --- | --- |
| `apps/web/tests/e2e/workspace.spec.ts:15` | `page.locator(".board-card-body").first().click();` then expects `.project-canvas .react-flow` and the `Working files` button | `.dblclick()`. Both assertions still resolve, but inside the Planning frame; `agency-project.png` will capture the board with the project open. For the full page, follow with `page.getByRole("link", { name: "Open full view" }).click()`. |
| `apps/web/tests/e2e/workspace.spec.ts:33` | same, client role, then `Shared designs` and the absent production controls | `.dblclick()`. The client assertions hold unchanged inside the frame — verified manually. |
| `apps/web/tests/e2e/design-audit.spec.ts:96` | `.board-card-body` click, then `.project-canvas .react-flow` and `.design-preview` | `.dblclick()`. The `project` capture becomes the board with the project open; the axe and overflow audit will now measure the embedded view. |
| `apps/web/tests/e2e/design-audit.spec.ts:128` | same, in the 1024 / 1000 / 768 loop | `.dblclick()`. At these widths the board is stacked and the frame is 380px, so the capture is denser than before. |

Unaffected but worth knowing: `workspace-actions.spec.ts:25` (grip drag and persistence) passed
manually after the change; `workspace-actions.spec.ts:62` and `:67` assert links in the list and the
kanban, neither of which changed; no test asserts an `<a href>` inside a canvas card, which no longer
exists; `.board-card-body` no longer contains the project description.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check --prefix apps/web` | macOS host, 2026-09-20 13:02 local | pass — typecheck, lint (1 pre-existing `react-hooks/exhaustive-deps` warning on the fit callback, 0 errors), prettier, 181 vitest tests in 9 files (was 167) | terminal |
| `docker compose --env-file .env.production up --build -d --wait` | both `web` and `media` rebuilt together, 4 times during the task; last at 13:00 local | both containers healthy | terminal |
| Single click, agency / client / designer | Chrome via playwright-core against `http://localhost:3003` | URL unchanged; node gains `selected` and `aria-current="true"`; live region reads "<title> selected."; no project view opened | `docs/verification/screenshots/board-card-selected-agency.png` |
| Double click, agency / client / designer | same | project view appears inside the Planning frame; the title shown equals the double-clicked card's title; timeline replaced; header shows `Back to Timeline`; URL unchanged | `docs/verification/screenshots/board-card-opened-in-planning-agency.png`, `…-client.png` |
| Double click on a *second*, different card | agency | frame switches to that project — the case that failed before the node-dimension fix | terminal |
| Opened from Kanban | agency | back control reads `Back to Kanban` and restores 7 kanban columns | terminal |
| Keyboard | agency | node focus + Enter selects and sets `aria-current`; Escape clears; the card's open button is reachable and its Enter opens the project | terminal |
| Pane click | agency | clears the selection and the announcement | terminal |
| Switching workspace with a project open | agency | the opened project closes; the other board renders normally | terminal |
| Drag by the grip, then reload | agency | card moves; URL unchanged; no project opened by the drag; persisted offset from the campaign frame equals the on-screen offset exactly (226, 235) | `shots/agency-07-persisted.png` (scratchpad) |
| Client artwork source | client role | signed URL path is `published-assets/…`; no `internal-assets` path served | terminal |
| Agency and designer artwork source | both roles | `internal-assets/…` | terminal |
| Artwork coverage | agency SABRE board | 1 of 2 cards has artwork; the other shows the empty band | screenshots above |
| Widths 1600 / 1280 / 900 / 760 with a project open | Chrome | project view renders at all four; frame is 640px where the board splits and 380px where it stacks; the frame's canvas controls never overlap the board's | `docs/verification/screenshots/board-card-opened-in-planning-stacked-760.png` |
| Browser console and page errors | all runs | none | terminal |
| Playwright acceptance suite (`npm run test:e2e`) | — | **not run** by instruction | — |
| `supabase test db` | — | **not run**; no schema or policy change was made | — |

## Remaining risks and next action

- The acceptance suite has not been run against this change. The four call sites above will fail
  until they are switched to `dblclick`; that is the orchestrator's call, together with whether the
  `agency-project.png` / `project` captures should stay as the embedded view or follow
  `Open full view`.
- `docs/architecture/design-system.md` is a shared document; only the board paragraph was touched.
- `board-layout.ts` changed on disk mid-task (another writer). The geometry numbers in this report
  were measured against the tree as of 13:00 local.
- Next concrete step: the orchestrator decides the two interface requests, then updates the four
  acceptance call sites and runs the suite.

## Ownership at handoff

All owned paths released. No background processes left running; the Docker stack is up and serves
the build described here. Recipient: the orchestrator.
