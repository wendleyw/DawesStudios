# Playground albums

Date: 2026-09-23

Status: design approved in chat, section by section; awaiting written-spec review

## Objective

In each project's Playground, the people brainstorming should be able to pull in the material
the studio already has, without downloading and re-uploading it. Below the **Playground** title,
a row of albums lists the client's Brand Hub folders and the project's design versions. Clicking
an album opens a row of its images, and dragging one onto the board adds a copy exactly where it
is dropped.

Success means all of the following hold:

1. Every role sees only the albums and files it can already see elsewhere in the product. A client
   never sees, and never requests, an internal design.
2. Dragging an album file onto the board creates a Playground item that behaves exactly like an
   uploaded file: the same validation, the same storage, the same role isolation.
3. Files the Playground cannot hold are visible but disabled, with the reason.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| What an album is | Brand Hub asset folders plus the project's design versions, filtered by what each role can see. |
| What the board stores | A copy, created through the Playground's existing file flow. |
| Approach | Browser orchestration over existing read hooks and the existing drop flow (A). A privileged server-side copy (B) was rejected. |

## Non-goals

- No schema, RPC, policy or bucket change, and no new privileged endpoint.
- No links to originals. Later changes to a Brand Hub asset or a design do not affect copies
  already on a board.
- No album editing from the Playground. Folders and versions are managed where they live today.
- No change to `artwork-files.ts` or the Add design dialog (owned by the approved video upload
  lifecycle plan).

## Current state

- The Playground is a project-only, role-isolated board in a full-viewport dialog
  (`apps/web/features/playground/`). Its drop flow lives in `use-playground-drop.ts` (`addFiles`,
  bounded queue, position from the drop point). Its allow-list comes from `playground-types.ts`
  over the shared vocabulary in `features/shared/upload-rules.ts`, with a 25 MiB limit that
  matches the `playground-assets` bucket.
- Brand Hub assets have one-level client folders plus Unfiled (`features/brand/brand-data.ts`:
  folder and asset hooks, preview URLs, `downloadBrandAssetFile`). Clients and designers can
  browse and download them.
- Design versions and designs are read through `features/projects/project-data.ts`. Clients read
  only published snapshots (`published_versions`, `published_designs`); RLS keeps
  `internal-assets` away from them.

## Design

### Interaction

- **Placement.** A row of album chips sits directly below the Playground title, scrolling
  horizontally when it does not fit. There are two groups:
  - **Brand Hub:** one chip per client folder that holds files, plus **Unfiled** when it has
    files.
  - **Project:** one chip per deliverable version, for example **Square · V2** and **Story · V1**.
- **Visibility by role.**

  | Role | Brand Hub | Project |
  | --- | --- | --- |
  | Agency | All folders | All working versions |
  | Assigned designer | All folders | All working versions of the project |
  | Client | All folders | Only versions shared with them, as their published copies |

- **Opening an album.** Clicking a chip opens one row below it with that album's thumbnails, in
  the album's own order. Clicking it again closes the row; clicking another chip switches to it.
  Only one album is open at a time.
- **Adding to the board.** Dragging a thumbnail onto the board creates the item exactly at the drop
  point. Clicking a thumbnail toggles its selection (Shift+click selects a range), and dragging any
  selected thumbnail drags the whole selection; the files land as a stack, the way a multi-file
  drop already does. Opening another album clears the selection. For keyboard users, **Enter** on a focused thumbnail adds it at the
  center of the current view.
- **Disabled files.** Files the Playground does not accept are shown dimmed and cannot be dragged.
  The reason appears on hover and focus: SVG and video (**Stays in the project**), or larger than
  the Playground's 25 MB limit.
- **Progress.** While a copy is prepared, the board shows a placeholder with progress. A failure
  keeps the placeholder with **Try again**.

### Units

These live in `apps/web/features/playground/`, with colocated tests.

- `playground-albums.ts` is pure logic. It builds the album list per role from folders, assets,
  versions and designs, orders files, and marks each file accepted or disabled with a reason
  (checked against the Playground's own allow-list and size limit).
- `playground-albums.tsx` renders the chip row and the thumbnail row. It is mounted below the
  title in `playground-board.tsx`.

### Data

- The Playground does not query Supabase. It consumes the owning features' hooks: `brand-data.ts`
  for folders, assets, previews and downloads, and `project-data.ts` for versions and designs
  (working versions for agency and designer, published ones for clients). Any missing read hook
  is added to `project-data.ts` with its colocated test, following the data-access contract.
- Thumbnails load only for the open album, through the signed-URL hooks already in use.

### Copy flow

1. Download the source file with the viewer's own session, using the same path the product uses
   to show or download that file.
2. Wrap the blob in a `File` named after the asset or design title with its extension.
3. Pass it to the Playground's existing `addFiles`, at the drop point (or the view center for
   keyboard adds). From there the item goes through the existing validation, upload and save.

### Security

- Each album comes from the same hook the rest of the interface uses for that role, so the album
  list cannot show more than the role already sees. RLS on `internal-assets` remains the
  authority.
- Copies are created by the viewer's own upload to their own role's board, so a copy can never
  reach another role's board.
- A browser test asserts that a client session never requests an object from `internal-assets`
  while using albums.

## Failure handling

| Situation | Result |
| --- | --- |
| Download fails | The placeholder stays with **Try again**. |
| The Playground rejects the file (type or size) | The existing validation message is shown; nothing is uploaded. |
| Upload or save fails | The Playground's existing retry applies. |
| An album is empty after filtering | Its chip is not shown. |

## Verification

- **Unit (album model):** visibility for each role (a client gets no working versions), file
  order, and the disabled reasons (SVG, video, oversize).
- **Component (album row):** one row open at a time, disabled thumbnails not draggable, and Enter
  adding at the view center.
- **Browser (Playwright):**
  - An agency session drags a Brand Hub asset and a working design onto the project Playground;
    both persist as Playground items stored in `playground-assets`.
  - A client session sees Brand Hub folders and only shared versions, drags a published design onto
    its board, and never requests an `internal-assets` object.
- **Gate:** `npm run check` and the Playground browser specs.

### Definition of done

All three success criteria are demonstrated by the checks above. The Playground README and a
verification record under `docs/verification/` are updated. Every task is committed.

## Coordination

The approved bulk image drop plan may add read helpers to `project-data.ts`. Implement the two
features one after the other so that file has a single writer at a time.

## Risks

- **Large copies in the browser.** Files are bounded by the Playground's 25 MB limit, and copies
  run through the Playground's existing bounded queue.
- **Many albums.** The chip row scrolls horizontally, and thumbnails load only for the open album.
