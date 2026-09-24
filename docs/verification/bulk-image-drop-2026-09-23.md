# Bulk image drop — 2026-09-23

Orchestrator: Claude Code (session `a375ed7c`), executing the
[plan](../superpowers/plans/2026-09-23-bulk-image-drop.md) for the
[design](../superpowers/specs/2026-09-23-bulk-image-drop-design.md) on `main` (`422178d..03abf91`,
then this record). Every check below was run in this session, on the local stack with the SABRE
overlay active, finishing on 2026-09-24 02:10 EDT after the concurrent deliverable-frame commit
`317c7bc` from another session.

## What this records

Evidence for the three success criteria of the design:

1. One drop adds every accepted image to the right deliverable and version, with no silent
   misplacement; an unmatched image waits for assignment or **Skip**.
2. The person decides current or new version per affected deliverable before anything uploads.
3. A partial failure keeps what succeeded and offers a retry, without orphaned files or empty
   versions.

## Decisions that differ from the plan

- **"Shared with the client" is the version's `reviewed` status.** The plan read
  `published_versions` for the same deliverable and version number, but that number counts client
  publications per deliverable (`max(version_number)+1` in `publish_version`) and is not the internal
  version number. On the local data the number rule misjudged 7 of 101 deliverables. `reviewed` is
  set only by `publish_version` and already drives the canvas's **Share update** label, and an
  assigned designer can read it, so there is no designer-only degradation.
- **Uploads overlap; registration does not.** Up to three files upload at once, including within one
  deliverable, while each deliverable registers strictly in natural order.
- **No empty versions, no orphans.** A new version is created just before the deliverable's first
  registration, and every stored file that ends up unregistered is discarded.
- **Cancel is read live.** The plan captured the cancel flag when the run started, so Cancel could
  not stop anything.
- **Drops never navigate.** A page-level guard swallows a file dropped outside the canvas, and the
  agency's Shared with client view shows the switch hint (the plan's condition could never be true).

## Checks executed

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, eslint, prettier, unit suites) | 704 tests / 59 files pass |
| `bulk-drop-model.test.ts` | 23: natural sort, bounded concurrency, exact/ratio/tie/none matching with the 1% boundary on both sides, rejection reasons, no pixel read for a rejected file, title and content, the default-version rule |
| `bulk-drop-upload.test.ts` | 11: three uploads in flight within one deliverable, natural-order registration despite out-of-order completion, a single version per deliverable, no version when every upload failed, isolation of upload and `add_design` failures, a failed version creation discarding what it stored, a permission refusal stopping the drop and discarding, cancel stopping queued files |
| `bulk-drop-dialog.test.tsx` | 10: one block per deliverable with its size, confirm gating on unmatched files, hand assignment, a skipped file marked Skipped, shared-version preselection, the all-rejected drop, retry limited to failed files with the created version reused, Cancel read during the run, choices fixed once a run starts, and the confirmed versions kept after the project refreshes |
| `project-data.test.ts` | `createDesignVersion` resolves to the new version's id |
| `npx playwright test tests/e2e/bulk-image-drop.spec.ts` | 4 passed: a mixed out-of-order drop lands as `square-1, square-2, square-10, unmatched` in the current square version and `story-1, story-2` in a new story version while the shared version is untouched; a client session gets no overlay or dialog; the agency's Shared with client view shows the hint; a drop on the project header is prevented |
| Project browser specs with the frame commit (`bulk-image-drop`, `project-feedback`, `production-workflow`, `project-creation-cards`, `video-designs`, `design-audit`) | 17 passed, 1 failed: `design-audit` expects the canonical 7 SABRE projects on the board and finds 50 under the demo overlay, a dataset assumption unrelated to this feature |

Every drop assertion checks that the drop's default action was prevented, which is what stops a
browser from opening the file; a dispatched event never navigates by itself, so a URL check could
not fail.

## Visual check

The drop overlay, the confirmation dialog (matched, unmatched, not-added and a long file name) and
the finished summary were captured at 1600 × 1000 and 390 × 844 into the ignored
`outputs/bulk-image-drop/` directory. The pass found three defects, fixed in `03abf91` with tests:
a finished run relabelled its blocks with the next version after the project refreshed, a skipped
file showed no feedback, and a single dragged image read "add them". The dialog's heading shows the
shared Modal's focus ring when it opens from a drop; that is existing Modal behaviour. No images are
committed.
