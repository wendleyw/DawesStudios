# Bulk image drop on the project canvas

Date: 2026-09-23

Status: design approved in chat, section by section; awaiting written-spec review

## Objective

The studio updates a project by dragging a whole bundle of images onto its canvas. Today every
design goes through the **Add design** dialog one file at a time, into one version the person has
already picked. This feature lets the agency, or the designer assigned to the project, drop many
images at once onto the canvas. The system places each image in the deliverable it belongs to,
asks for each affected deliverable whether the images join its current version or start a new
one, and uploads them in file-name order.

Success means all of the following hold:

1. One drop adds every accepted image to the right deliverable and version, with no silent
   misplacement. An image that matches no deliverable waits for the person to assign or skip it.
2. For each affected deliverable, the person decides between the current version and a new
   version before anything is uploaded.
3. A partial failure keeps what succeeded and offers a retry for what failed, without leaving
   orphaned stored files or empty versions.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Matching | Exact pixel size first, then the same aspect ratio. Unmatched images go to a list with a deliverable picker. |
| Current or new version | Asked separately for each affected deliverable. |
| File types | Images only (PNG, JPG, WebP). Videos keep using Add design until the video upload lifecycle work lands. |
| Approach | Orchestrate in the browser with the existing upload path and RPCs (A). A batch RPC (B) and media-service bundling (C) were rejected. |

## Non-goals

- No videos in the bundle yet, no folders or archives, and no drop into the client-facing
  **Shared with client** view.
- No schema, RPC, policy or permission change.
- No change to `artwork-files.ts` or to the Add design dialog. The approved
  [video upload lifecycle plan](../plans/2026-09-23-video-upload-lifecycle.md) modifies those files,
  so this feature only calls their existing exports.

## Current state

- `deliverables` rows carry `format`, `width` and `height`. The dimensions can be null for
  formats without a fixed size.
- `design_versions` numbers versions per deliverable (`version_number`). A version is **shared
  with the client** when a `published_versions` row exists for the same deliverable and version
  number.
- `apps/web/features/projects/artwork-files.ts` exports `uploadArtwork(database, projectId, file)`
  (the browser-sanitized image path) and `discardUnreferencedArtwork(database, path)`.
- `apps/web/features/projects/project-data.ts` already wraps the `create_design_version` and
  `add_design` RPCs. Their backend permission checks (agency, or the assigned designer) stay the
  only authority.

## Design

### Interaction

- **Where it works.** Only in the project's **Working files** view, and only for someone who can
  produce on the project: the agency, or the assigned designer. For clients, for unassigned users,
  and in **Shared with client**, there is no drop overlay, and a drop is swallowed without letting
  the browser open the file. In Shared with client, a drop shows the hint **Switch to Working
  files to add designs**.
- **While dragging,** an overlay covers the canvas: **Drop N images to add them to this
  project**.
- **Accepted files:** PNG, JPG and WebP within the existing artwork size limit. Anything else is
  listed as not added, with its reason: a video (**use Add design**), an unsupported type, or a
  file that is too large.
- **Matching.** Each image's pixel size is read in the browser. It matches a deliverable with the
  same width and height exactly. Otherwise it matches one whose aspect ratio is within 1%. When
  two deliverables tie, the person chooses. Deliverables without dimensions only receive images
  assigned by hand. Unmatched images appear in a list with a deliverable picker. Confirmation
  stays disabled until each one is assigned or marked **Skip**.
- **Confirmation (Add N images).** One block per affected deliverable shows its name, size and
  file count, and asks **Add to V{current}** or **Create V{current + 1}**. The default is the
  current version, unless that version is already shared with the client, in which case the
  default is a new version. A deliverable with no version yet simply creates V1, with no question.
- **Order.** Files are added in natural file-name order (1, 2, 10), after the version's existing
  designs.
- **Progress.** Each file shows its status. At the end a summary reads, for example, **10 added ·
  2 failed · Try again**. Cancelling stops the files still queued; designs already registered
  stay.

### Units

All units live in `apps/web/features/projects/`, with colocated tests.

- `bulk-drop-model.ts` is pure logic. It reads dimensions through an injected reader, classifies
  each file (exact, ratio, tie, none, rejected), sorts naturally, and builds the plan per
  deliverable, including the default-version rule.
- `bulk-drop-dialog.tsx` renders the confirmation: deliverable blocks with the per-deliverable
  choice, the unmatched list with pickers, and progress with retry.
- The project canvas gains the drop handler and overlay, gated by the same production-access
  check the existing Add design controls use.
- Data calls go through `project-data.ts`: `create_design_version` and `add_design`.

### Flow per file

1. Upload with `uploadArtwork`, which is the existing browser-sanitized image path. Confirm in the
   code that sanitization happens inside it; if the caller applies `sanitizeArtwork`, do the same
   here.
2. For a deliverable that chose a new version, call `create_design_version` just before
   registering its first design. This happens once per deliverable, so a fully failed deliverable
   leaves no empty version.
3. Register the file with `add_design` in the chosen version, at the next sort order.

At most three files are in flight at a time.

### Failure handling

| Situation | Result |
| --- | --- |
| Upload fails | The file is marked failed and can be retried alone. |
| Upload succeeds but `add_design` fails | `discardUnreferencedArtwork` removes the stored object before the file is offered for retry. |
| `create_design_version` fails | That deliverable's files are marked failed with the message; the other deliverables continue. |
| Permission denied | The batch stops and shows a clear message; nothing further is attempted. |
| Cancel during upload | Queued files are dropped; registered designs remain and are counted in the summary. |

## Verification

- **Unit (model):** exact match, ratio match within 1%, a tie between two deliverables,
  deliverables without dimensions, unmatched and rejected files, natural ordering, and the default
  version (current, or new when shared, or V1 when none).
- **Component (dialog):** one choice per deliverable; confirmation blocked until unmatched files
  are assigned or skipped; retry offered only for failed files.
- **Browser (Playwright, with a project fixture that has two sized deliverables):** drop three
  square images, two story images and one unmatched image. Choose the current version for one
  deliverable and a new version for the other. Assign the unmatched image. Verify the `designs`
  rows land in the expected versions and order. A deliverable whose current version is shared
  preselects a new version. A client session has no drop overlay.
- **Gate:** `npm run check` and the projects browser specs.

### Definition of done

All three success criteria are demonstrated by the checks above. The projects README and a
verification record under `docs/verification/` are updated. Every task is committed.

## Risks

- **Browser memory with many large images.** Reading dimensions and sanitizing are bounded by
  processing three files at a time.
- **Aspect-ratio ambiguity.** Two deliverables with the same ratio but different sizes are
  resolved by exact size first, and a true tie is asked, never guessed.
