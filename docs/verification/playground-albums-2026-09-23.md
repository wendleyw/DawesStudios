# Playground albums — 2026-09-23

Orchestrator: Claude Code (session `a375ed7c`), executing the
[plan](../superpowers/plans/2026-09-23-playground-albums.md) for the
[design](../superpowers/specs/2026-09-23-playground-albums-design.md) on `main` (`3fe4cac..65dc8c9`,
then this record). Every check below was run in this session, on the local stack with the SABRE
overlay active, on 2026-09-24.

## Checks executed

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, eslint, prettier, unit suites) | 747 tests / 61 files pass |
| `playground-albums.test.ts` | 26: previewable types, disabled reasons (SVG, both video containers, the 25 MB branch), the design-upload and Playground ceilings kept equal, file names, Brand Hub and project album building and ordering, empty albums hidden, disabled files kept, channel stamping, and the copy step (input order, one failure isolated, three downloads at most, design files downloaded by their own channel) |
| `playground-albums-panel.test.tsx` | 11: one album open at a time, a disabled thumbnail kept visible, `aria-disabled` and not draggable, selection cleared on switching albums, Shift+click ranges, Enter adding only the focused file at the view center, dragging an unselected file dragging only it, dragging a selected file dragging the selection, `canAdd=false`, and the client and designer channel mapping |
| `playground-board.test.tsx` | 25 (2 new): an album add reaches the board through `addFiles`, and **Try again** retries a failed copy and replaces its row |
| `project-data.test.ts` | 42 (3 new): `downloadDesignAssetFile` reads `internal-assets` on the internal channel and `published-assets` on the client channel, and surfaces a storage error |
| `npx playwright test tests/e2e/playground.spec.ts` | 11 passed, 2 new: an agency session drags a Brand Hub asset and a working design onto its board and both persist as items with an object in `playground-assets`; a client session sees the Brand Hub folder and only its shared version, drags the published design onto its board, and never requests an `internal-assets` object |

## The spec's success criteria

1. **Every role sees only what it already sees.** The album lists come from the same role-scoped
   reads the rest of the product uses; the client scenario proves no `internal-assets` request
   during a whole Playground session, including the drag.
2. **An album file behaves like an uploaded file.** The copy's only way onto the board is the
   Playground's own `addFiles`; the agency scenario proves both copies persist as real items.
3. **Files the Playground cannot hold are visible but disabled.** Unit and panel tests cover SVG
   and video, and the size branch with a synthetic size.

## Final review fix pass

The whole-branch review found two Important issues, both fixed test-first on 2026-09-24:

| Finding | Test (RED → GREEN) |
| --- | --- |
| A disabled thumbnail's reason lived only in `title`, which keyboard and screen-reader users never get | `describes a disabled thumbnail's reason to keyboard and screen-reader users, not only on hover` |
| At the 500-item cap, dragging or pressing Enter on a thumbnail silently did nothing | `explains why nothing can be added while the board is full, instead of ignoring the attempt`; `tells the albums panel why nothing can be added once the board holds 500 items` |

After the pass: `npm run check` 754 tests / 61 files, and `playground.spec.ts` 11 passed. A focused
SVG thumbnail in the SABRE **Unfiled** album showed **Stays in the project.** below the panel at
1600 × 1000 and 390 × 844, hidden again on blur (captures in the ignored
`outputs/playground-albums-fix/`).

## Decisions that differ from the plan

- **Try again replaces the failed row.** The plan retried under a new id and left the old error
  row on screen.
- **Copy progress is a polite status.** The rows use `role="status"` rather than `role="alert"`, so
  **Copying…** does not interrupt a screen-reader user on every copy.
- **The fixture cleans up its Brand Hub rows.** The plan removed only the stored object, so the
  acceptance client could not be deleted afterwards.

## Visual check

The chip row, an open album with a selected image and a disabled video, the board after a drag, and
the phone layout were captured at 1600 × 1000 and 390 × 844 into the ignored
`outputs/playground-albums/` directory. Spacing and alignment follow the Playground header; a
disabled video shows the generic document icon, which a later pass could replace with a video icon.
No images are committed.

## Known limitations

- Neither `brand_assets` nor `designs`/`published_designs` stores a byte size, so the 25 MB reason
  cannot fire for a Brand Hub asset between 25 MB and its own 50 MB ceiling; the Playground's
  existing validation still refuses such a file when it is added. A design's stored image can never
  be oversized, because its upload ceiling equals the Playground's.
- During a download itself, progress shows in the list below the album row rather than as a
  placeholder at the drop point; once downloaded, the Playground's own placeholder takes over.
