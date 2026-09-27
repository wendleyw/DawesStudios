# Playground

Playground is a persistent brainstorming canvas inside an individual project. Each project has separate agency, designer and client boards. People collaborate with their own role only; access still requires the underlying project permission. Playground files and notes are independent of production designs, billing and immutable client publications. Legacy workspace records are retained by the backend; this UI does not open or assign them to a project.

`PlaygroundBoard({ clientId, projectId, onClose, returnLabel? })` requires both scope IDs and mounts
only while open. Its named native dialog occupies the entire viewport in the browser's top layer,
covering the sidebar, client/project headers and canvas. It rises from the screen's bottom edge
on entry, the edge its button sits at in the project's bottom bar, and slides back down before
invoking `onClose` once; `returnLabel` defaults to **Back to project**.
Reduced motion skips animation, and a short timer ensures completion if an animation event is
unavailable. The transparent backdrop lets the previous surface remain visible during the slide.
The covered app is inert and body scrolling is locked until exit completes. Focus starts on the
heading; Escape/native cancellation uses the same unsaved/busy guard as the return button. Closing
restores scrolling and focus to the opener or resumed upload form.

The consuming project keeps the underlying canvas mounted, preserving its viewport and selection.
When opened from a design upload, it temporarily closes that native dialog while retaining its
mounted form and selected file; it reopens after Playground exits. Consumers own entry points and
that round trip. This feature owns fullscreen framing, animation, state, validation, styles and
data access.

`playground-board.tsx` composes four colocated hooks for its cross-cutting concerns:
`use-fullscreen-layer.ts` (the dialog's open/close
animation phase, focus and body-scroll lock/restore), `use-playground-navigation-guard.ts` (the
unsaved/busy same-tab navigation guard covering Escape, the close button, same-tab link clicks and the browser's
reload/close prompt, all routed through one `requestClose` gate), `use-playground-drop.ts`
(the canvas drop target, file-picker input and the bounded 3-transfer upload queue) and
`use-playground-items.ts` (item drafts, persistence, selection and the remove/download flows,
kept in one hook since nearly every action reads or writes them). `usePlaygroundItems` and
`usePlaygroundDrop` need each other's functions — the drop hook's viewport `origin` places a
dropped batch and the items hook's `writeDraft`/`select`/`persist` save it — so `addNote` and
`discardAndClose` take the other hook's `origin()` point and the fullscreen layer's `beginExit` as
plain arguments from `playground-board.tsx` instead of the hooks depending on each other directly.
Three colocated, presentation-only sub-components render the board's chrome from that state:
`playground-header.tsx` (title, team-visibility caption, Add note/Add files, save status,
Refresh and the close icon), `playground-notices.tsx` (album-copy, load-error, cleanup-error,
rejected-upload and unsaved/busy-close banners) and `playground-inspector.tsx` (the selected
item's editor, retry/conflict recovery and download/remove actions). `playground-node.tsx` renders
a canvas item and `playground-viewport.tsx` keeps the selected item framed; both are unchanged by
this split.

## Working on the canvas

- Add notes and edit their title/text in the item editor. **Save note** persists the changes; unsaved copy remains visible until saved or explicitly discarded.
- Add or drop multiple raster images, PDF, text/CSV, Word, Excel, PowerPoint and RTF documents. `playground-types.ts` allows up to 25 MiB (`PLAYGROUND_MAX_FILE_BYTES`) per file, matching the effective `file_size_limit` (26214400 bytes) that `supabase/migrations/202609230003_playground.sql` sets on the `playground-assets` Storage bucket; `202609230007_project_playground.sql` only changes project scoping and does not touch that bucket. The board's own allow-list stays in `playground-types.ts`, typed as `satisfies readonly UploadMime[]`; its MIME/extension vocabulary is the shared one in `features/shared/upload-rules.ts`, extended there with the document types only this board accepts, and `playground-model.ts` builds `playgroundFormats` from that shared map rather than a second copy. Invalid entries are listed individually while valid entries continue. The upload queue allows three transfers per batch.
- Drag and resize items. These operations save when the gesture finishes. The **Position and size** fields provide the same controls with a keyboard; save the item after editing those fields. Shift selection supports moving several items together. The canvas uses the shared 24-unit dot grid on the sidebar menu's colour (`--menu-surface`) in both themes, so it never reads as the project beneath it; it is a `.dark-surface` (`globals.css`), so items, notes, hints and controls on it take the dark palette in the light theme too. Miro mode's asset strip (`playground-asset-strip.tsx`) is the same dark surface. Scroll/trackpad gestures pan in both axes and pinching zooms. Zoom/fit buttons animate over 200 ms unless reduced motion is requested; direct dragging stays immediate. When the usable canvas changes size, a selected item that would be clipped is fitted back into view. Typing does not recenter the canvas.
- Images use private signed previews. Documents remain download-only. **Download file** obtains a fresh signed download URL. **Remove item** asks for confirmation before deleting the item and its file.
- Each board allows 500 active items. Title, note length, coordinates and dimensions are checked before saving and independently validated by the database.

## Albums

Below the title, a horizontally scrolling row of album chips lists the client's Brand Hub folders
(**Unfiled** first when it holds files, then named folders alphabetically), for whichever role is
signed in. Project designs live in Miro, so there is no project album. An album with no stored file gets no chip; a file the Playground cannot hold still
appears in its album, dimmed, with its reason on hover and focus (SVG and video: **Stays in the
project**; a file over 25 MB, though Brand Hub stores no byte size today, so only a caller that
knows one can trigger it). Clicking a chip opens its thumbnail row and a second click closes it;
only one album is open at a time, and switching albums clears the selection. Clicking a thumbnail
toggles its selection, Shift+click selects a range, and Enter on a focused thumbnail adds it at the
center of the current view. The reason is text of its own, linked to the thumbnail with
`aria-describedby` and shown just below the panel while the thumbnail is hovered or focused, since a
`title` tooltip never appears on keyboard focus. While the board holds 500 items every thumbnail is
disabled the same way, with **This Playground holds 500 items. Remove an item before adding more.**
— the message a native drop at the cap already shows.

Dragging a thumbnail (or the whole selection, when the dragged one is part of it) onto the canvas
downloads each file with the viewer's own session — `downloadBrandAssetFile` from `brand-data.ts` — wraps it in a `File` named after
its title and stored extension, and passes the result to this board's own `addFiles` at the drop
point: the same validation, storage, retry and **Waiting to upload…** placeholder a native drop
produces. At most three downloads run at once. A download in progress shows as **Copying…** in the
list below the album row; a failed one stays there with **Try again**, which replaces the failed
row, without affecting the other files of the same drag. `playground-albums.ts` holds the logic
(`buildBrandAlbums`, `computeDisabledReason`, `copyAlbumFilesToBoard`) and
`playground-albums-panel.tsx` renders it. The panel reads no project data, so no session ever
requests an `internal-assets` object through it.

`PlaygroundAlbumsPanel`'s props are `{ clientId; extraAlbums? } & (BoardMode | ClipboardMode)`.
Board mode (`mode?: "board"`, the default) is everything above, unchanged. Clipboard mode
(`mode: "clipboard"`, plus `onCopy`/`onDownload`) renders the same chip row and album but clicking a
thumbnail calls `onCopy(file)` instead of selecting or dragging it — there is no selection, Shift
range, Enter-to-add or drag in this mode. Every open album's files are filtered through
`clipboardDisabledReason` (only images can be copied, overriding any board-only reason), and each
thumbnail's accessible name becomes **Copy \<title\>** with no `aria-pressed`. A status line below
the row announces **Copied — paste in Miro with ⌘V / Ctrl+V**, or **Couldn't copy this image.** with
a **Download \<title\>** fallback button that calls `onDownload(file)`. `extraAlbums` (used by
`PlaygroundAssetStrip` for the viewer's own Playground album) render first, ahead of the Brand Hub
albums, with the divider drawn before the first Brand Hub album
whenever at least one extra album is present.

### Miro mode strip

`PlaygroundAssetStrip({ clientId, projectId, onOpenPlayground })` is docked inside the project's
Miro view: it reads `usePlayground` for the viewer's own images (`buildPlaygroundAlbum`, newest
first) and renders `PlaygroundAlbumsPanel` in clipboard mode alongside an **Open full Playground**
button. Copying downloads the source file with the viewer's own session —
`downloadBrandAssetFile` or a signed `getPlaygroundDownload` URL for a
Playground-owned image — and hands it to `copyImageToClipboard` (`album-clipboard.ts`), which
converts it to PNG and writes it with the Clipboard API inside the same click's user activation.
Download falls back to `saveBlob` with `fileNameFor`'s stored-extension name; a download that fails
too announces "Couldn't download this file." in the same polite status region.
`project-workspace.tsx` mounts this strip above the Miro embed, toggled by the project's own
Playground icon button.

## Compact header

A single header contains the title, a short team-visibility caption, Add note/Add files icons,
save status, Refresh and the close/return icon. Tooltips and accessible names preserve the actions;
the close icon retains Back to project/Back to upload semantics. The full privacy explanation is
available to assistive technology, with team scope also stated in the lock caption's tooltip.
On phones the saved-state message is visually condensed, while saving and unsaved changes remain
visible. The header belongs to the fullscreen Playground, independent of the covered project's
header height. Opening it preserves the underlying canvas viewport and channel controls. There is
no second permanent toolbar row.

## Persistence and recovery

All Supabase queries and Storage access live in `playground-data.ts`. The board owns file validation, drafts, stable item IDs, stable storage paths, revision expectations and retry state. A successful file upload is retained if the subsequent item save fails, so **Retry save** does not resend its bytes. An uncertain upload retries the same `File` and path; the data layer verifies an existing object's content rather than overwriting it. If a staged upload expires, the retained file can be uploaded again on retry.

Committed items carry revisions. A conflict preserves local text and offers explicit discard/reload; it never silently overwrites another person's saved work. All newer successful canonical query snapshots, including automatic refetches, supersede committed local overlays, so a remote deletion does not leave a phantom item. Explicit conflict reload immediately returns ownership to the query; unsaved and failed drafts remain local. Failed deletion retains its original arguments until Storage cleanup succeeds, even when the server has already hidden the item. A stale-revision deletion instead offers a saved-item reload; explicitly discarding that rejected attempt leaves the collaborator's item intact. The data layer also retries durable cleanup after a later opening/refetch and exposes failures as `cleanupError`.

Closing is disabled during queued transfers, saves or deletion cleanup, with a visible status. After failure, closing is available but prompts before discarding unsaved work. Discarding new staged files cleans them up first; cleanup failure leaves the board and retry available. Covered app navigation cannot receive pointer or keyboard interaction while the fullscreen dialog is open. The existing same-tab link guard also rejects dispatched navigation while work is unsaved or busy, showing an inline save/discard notice. Downloads remain available inside the board.

Full page navigation/reload while unsaved work exists uses the browser's unsaved-changes warning. Browser history traversal and programmatic app-router transitions are not intercepted; unfinished local text/files are held in memory and can be lost when those actions unmount the board. There is no durable browser draft store. Server cleanup handles abandoned staged uploads.

## Verification

Run the colocated validation and recovery tests from `apps/web`:

```sh
npx vitest run features/playground/playground-model.test.ts features/playground/playground-board.test.tsx features/playground/playground-viewport.test.tsx features/playground/playground-albums.test.ts features/playground/playground-albums-panel.test.tsx features/playground/playground-asset-strip.test.tsx
```

The component tests mock the data boundary and canvas renderer to exercise user-visible retry, conflict, cleanup, closing and batch behavior, plus dialog semantics, scroll restoration, native cancellation, animation completion, reduced motion, Escape, focus and guarded navigation. jsdom stubs native dialog methods; real top-layer bounds and background focus isolation are verified in Playwright. Responsive framing tests use the installed xyflow bounds calculation with explicit item sizes, including controlled nodes whose internal measurement flag remains false. The viewport waits for pan/zoom readiness and item arrival; it does not wait for transient node measurements. These tests do not prove backend isolation or rendered browser geometry. The orchestrator verifies those through the Playground database tests and real browser workflows, including exact full-viewport bounds at five sizes, slide keyframes, background focus isolation,
upload return, persistence, download, resizing, keyboard access and mobile layout. See the [project-layer plan](../../../../docs/architecture/project-playground-and-video-optimization.md) and [feature specification](../../../../docs/architecture/playground-and-board-widgets.md).
