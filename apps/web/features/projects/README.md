# Projects

The project workspace lives at `/projects/:projectId`. It shows one project as a canvas of
deliverables and their versions, opens a single design in a viewer, and carries the two comment
channels that keep the studio conversation separate from the client one. The channel is not a
browser filter: an agency session chooses between working files and the shared client view, a
designer session is always internal, and a client session is always the client channel, with
Supabase policies rather than the interface deciding what each one may read.

The client logo/name, client navigation (Board active) and signed-in profile use the same floating
`workspace/canvas-header.tsx` as every client section and the main board. A full-width floating card
centers the large project title with status and due date beside it; this group wraps on phones.
For the client and the studio, the card's right corner shows the credits the project used
(`credits/project-credits-chip.tsx`; designers never see it). Outside that card, a separate
row places Working files / Shared with client on the left and All deliverables on the right; both
wrap on narrow screens and remain reachable above the canvas. Project details, Conversation and
Playground live in `project-tool-bar.tsx`, a floating bar (group **Project actions**) centred at the
bottom of the canvas. While a side panel is open the bar re-centres in the space between the zoom
pill and the panel; on canvases narrower than 800 px it hides until the panel closes. The open
panel's button is selected. On phones it moves to the bottom right with touch-sized buttons, clear of
the zoom pill. It is not shown while reviewing a design; the viewer keeps its own Playground button.
The bar opens with the studio's animated mark (`shared/brand-mark.tsx`) in a tile of the menu
colour, as branding rather than a control.
The Playground (or, in Miro mode, its asset strip) and the side panels do not stack: opening the
Playground closes an open panel, and opening a panel closes the asset strip.
The canvas fills the viewport beneath these cards. The shell has no duplicate desktop topbar or client sidebar links.
The header's measured height keeps the first deliverable, Fit View and secondary panels
clear of the floating controls. Playground independently fills the entire viewport above the app. Opening preserves a readable width-based zoom; Fit View includes
height with the existing 20% project zoom floor. On phones and short windows the design viewer
scrolls its artwork/feedback body while keeping the header and viewer controls accessible.

Conversation and Project details open one floating inspector beneath the project controls.
Close/Escape restores focus to the trigger without changing canvas position. Details retain real
edit, assignment and resource actions. For the studio and the client, Details also shows **Requested
by** (the briefing's requester, read by `useBriefingRequester`) and its version history names who
decided ("Approved by <name> · <date>"); designers see neither. Notifications sit to the left of
the signed-in profile in `workspace/canvas-header.tsx` and open the shared animated, nonmodal
account popover on every client surface. Notification read actions remain explicit and
recipient-scoped.

Design previews open feedback with a desktop double-click. A single click keeps canvas interaction
available; Enter/Space, the explicit arrow action and a single touch tap also open the design.
The main board already uses double-click to enter a project. During design review the channel/action
row is replaced by a compact deliverable/design title bar directly below the title, over the
artwork column. The design tools (navigate, Add pin, edit and Playground) head the feedback column
beside it, level with that bar. The artwork canvas is above the design/version navigation footer,
so artwork cannot overlap the counter. Notifications remain in the account card.

## Feedback inside the design viewer

Version cards show their number, status, design count, available workflow actions and a feedback
shortcut with the unresolved comment count. Long release notes and review feedback no longer
appear as truncated blocks beside artwork. The shortcut opens that version's own feedback panel
beside the board, including for an empty working version.

The feedback column is 310–380 px on desktop and runs the viewer's full height: the design tools,
then the heading with **Show resolved** on its right, then an independently scrollable,
keyboard-focusable comment history. The composer uses a 60–120 px growing textarea and adjacent
send button; privacy context is shown once in the heading. Phones stack the title bar, the tools,
the artwork and a taller feedback section; the title bar and tools stay put while the rest scrolls,
as they do in short windows. Pending pins, long comments, errors and drafts remain accessible.

The viewer holds only that design's feedback: its comments and image/video pins, each pin named
beside its author (with its timecode on video). Version-wide feedback (the version's notes, the
client's review decision and unpinned version discussion) lives in the version's panel on the board;
the user removed the viewer's **General feedback** tab on 2026-09-24. While the latest client
publication waits for a decision, the client can **Review version** from the top of the viewer's
feedback column, from the version panel and from the version card; `reviewFor` in
`project-page.tsx` is the one rule for all three. Existing release notes and review feedback are
rendered in full from their original records, never copied into comments. A version comment has a
version/publication ID and no design ID; queries filter both that context and the channel. Project
Conversation retains the existing aggregate of unpinned messages. Draft bodies, pending pins and
retry keys remain scoped to viewer/project/channel and design, or version for version-wide
feedback, so moving between a design and its version cannot mix unsent comments. Counts use only
authorized unresolved comment rows and refresh with the existing comment invalidation path.
Clients never query working versions, designs or internal comments.

The **Playground** action opens a persistent brainstorm canvas for the current role and project.
It is also available as **Open Playground** in the design upload/edit form. The form remains
mounted while its dialog is temporarily closed. The project-owned Playground board rises from the bottom over the entire viewport, covering the header and sidebar in a native fullscreen dialog. Covered app controls are inert until it closes. Closing slides it back down; **Back to upload** restores the selected file and all
unsent fields. Brainstorm attachments stay in a separate private bucket and do not automatically
become production designs or client publications. See the [Playground and widgets specification](../../../../docs/architecture/playground-and-board-widgets.md).

The project board and single-design viewer share a subtle 24-unit dot grid,
two-axis trackpad/scroll panning and pinch zoom. Zoom/fit buttons animate over
200 ms unless reduced motion is requested. Direct dragging remains immediate;
pin placement still disables canvas dragging. See the
[shared canvas primitives](../shared/README.md#canvas-background-and-controls).

`project-data.ts` owns every Supabase read and write for the feature, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useProjectDetail`
reads the internal `design_versions`/`designs` tables or the published `published_versions`/
`published_designs` snapshot according to that channel. Actual client sessions only query the published projection. The agency’s Shared with client tab also enables a separate cached working-detail read to target authorized creation actions; `useProjectDetail` takes an optional enabled gate for that read. `useProjectComments` reads `internal_comments` or `client_comments` for the same reason, and
labels internal authors as the signed-in person or "Studio team" rather than exposing designer
identity. `projectQueryKeys` lists the four keys every project write invalidates; `assignments` and
`asset-url` are deliberately outside that set, because the assignment panel refetches its own read
and a signed URL expires on its own schedule.

`canvas-layout.ts` computes the canvas geometry from the deliverables and their version counts, so
the canvas lands in its final shape on first paint instead of being measured after render.
Each deliverable is one frame: a white title bar with the deliverable's name centred and its format
beside it, then every version line and the Add version row inside a single border, like the board's
campaign frames. The frame node is emitted first so the lines draw on top of it, and it is neither
selectable nor draggable, so dragging across it still pans the canvas.
Deliverable, version and creation nodes pass those dimensions as xyflow `width`/`height` as well as CSS.
This keeps controlled nodes visible when a dialog or query update recreates them without a new
DOM resize; relying on a discarded measurement can otherwise hide the completed upload's canvas.
`project-nodes.tsx` holds what the canvas draws and `project-canvas-view.tsx` places the opening
view once the pane knows its width. `project-events.ts` subscribes to the Postgres changes each role
is allowed to see and polls while the socket is down, so a dropped connection degrades instead of
silently freezing the canvas.

## Creation cards

Each editable version row ends with an Add design tile matching the artwork dimensions. A dashed
Add version row sits below the versions of each deliverable, including a deliverable with no version
yet. These replace the small header plus buttons and the duplicate empty-row action. Geometry
includes both creation slots, so they stay outside existing artwork and clear the next deliverable.
A row still limits previews to five, with a more-designs control before its creation tile.

Agency and assigned designers use these cards in Working files. The agency also sees Add version
and an Add design tile on the newest shared version of each deliverable. Those shared-view actions
are labeled In Working files (and the target working version for a design); clicking switches to
Working files and opens the existing real creation dialog. Add design targets the latest internal
version for that deliverable, not the publication ID or a guessed number match. Adding a version
retains the existing option to copy designs from the latest internal version.

Client accounts receive the read-only published layout and their existing review actions, with no
production creation cards or internal fetches. Creating working content never changes the published
snapshot or sends it automatically; explicit agency publication remains required. The backend
permissions and write commands are unchanged.

Every card and toolbar action above opens `ProjectActionDialog` (`project-action-dialog.tsx`) with
one of `ProjectAction`'s seven `kind`s. That component is only a dispatcher: it renders one
component per kind — `project-action-version.tsx`, `project-action-design.tsx` (design and
edit-design share a form, so they share this one component), `project-action-publish.tsx`,
`project-action-miro.tsx` (also the home of `MiroField`, which `project-action-publish.tsx` reuses),
`project-action-submit.tsx` and `project-action-review.tsx` — so a change to one action never
requires reading the other six. `project-action-shell.tsx` holds what every kind renders alike: the
`Modal` shell, the error paragraph and the Cancel/submit footer, plus the `useProjectActionClose` and
`useCloseOnSuccess` hooks each kind's own mutation calls into. `project-action-design.tsx` stays the
largest of the six, because it alone owns the image/video upload state machine described below;
`project-action-design-text-options.tsx` and `project-action-design-upload-status.tsx` hold its two
purely presentational fragments (the text-concept fields and the live upload/processing line) to keep
that file smaller without splitting the mutation itself.

`artwork-files.ts` owns an uploaded design artwork's whole lifecycle: `sanitizeArtwork` re-encodes
the image and enforces the type, size and megapixel limits, `uploadArtwork` stores it under an
opaque `<project UUID>/<random UUID>.png` path in the private `internal-assets` bucket, and
`discardUnreferencedArtwork` removes an upload the dialog never attached to a design — but only
after checking that no `designs` row points at it, so a retried submit does not delete the file the
stored design now uses. The signed URL that displays a stored artwork is a read and lives with the
other read hooks in `project-data.ts`. `media-client.ts` talks to the media service for publication
snapshots, delivery files, and the video-sanitisation round trip; `comment-draft.ts` keeps an unsent
comment and its pending pin.

`uploadDesignAsset` is the single entry point `project-action-design.tsx` calls for a design file,
and it takes one of two paths depending on the file's declared type — the two paths differ because
the browser can prepare one of them and not the other. An **image** goes through `sanitizeArtwork`:
a canvas decode-and-re-encode that strips metadata as a side effect, enforces `ARTWORK_MAX_BYTES`
and a 40-megapixel guard, and finishes in about a second, so `uploadArtwork` stores the result with
one `PUT`. A canvas cannot decode **video**, so there is no browser-side sanitisation step to run;
the file goes to `internal-assets` as-is, under a `.raw` name, through `uploadResumable` — a TUS
transfer chunked at 6 MB so a dropped connection loses one chunk instead of the whole file, which
matters at the `VIDEO_MAX_BYTES` gigabyte ceiling `sanitizeVideoAsset` then asks `apps/media` to
remux the raw upload with a metadata-stripping `-c copy` pass and delete the raw object, which is
why the caller reports upload progress only on this branch: the transfer itself is the part with a
progress signal, and the remux that follows it can run for several more minutes with none. The
transfer resumes across a reload or a dropped connection: its tus fingerprint (`videoFingerprint`)
is scoped to the user, the project and the file's name, size and modification time, so choosing the
same file again in the same browser within the 24-hour resumable window continues it, and the dialog
says **Continuing from N%** instead of **Sending N%**. One Cancel stops the transfer (asking Storage
to terminate the partial upload and forgetting the resume point) or the processing call (then
deleting the raw upload through the media service's `POST /designs/discard-raw`) and returns the
dialog to choosing a file; saving the design itself, like every other action, cannot be cancelled
midway. A transient processing failure (network error, timeout, 408, 429 or 5xx) is retried once
automatically with the same raw path, and a second one offers **Try processing again**, which
reprocesses the stored raw file without sending it again; invalid content (415 or 422) is never
retried, and a missing raw file (410) reads as **The upload expired; choose the file again**. The
media service's hourly sweep removes raw uploads and orphaned processed outputs older than 24 hours.
The full design is in `docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md`.
`isVideoAsset` (`video-pins.ts`) reads a stored design's kind back from the returned path's
extension rather than a database column, for the same reason `apps/media` names every object after
the container it verified: what a browser claims about a file at upload time is not what the file
actually is.

Video thumbnails are lightweight **Video** tiles beside the existing design title. They do not
request a signed URL or mount a media element. `useDesignAssetUrl` accepts an optional `enabled`
flag that defaults to true; inactive video thumbnails disable both signing and renewal timers.
Image previews retain their existing behavior. Opening a video design creates the real player
with native controls and metadata preloading.

The single-design viewer refits its known artwork bounds when its actual canvas dimensions
change, including sidebar transitions and desktop/mobile resizing, with a maximum zoom of 1.
Playback, comments and ordinary rerenders do not reset manual pan or zoom. Explicit node
dimensions preserve the artwork frame across controlled-node updates.

`video-player.tsx` keeps one video element for a design, channel and asset path. A signed URL
renewal snapshots the playhead, playback rate and paused/playing state before replacing the
source, then restores them after metadata loads. Overlapping renewals keep the original pending
snapshot. Muting and volume remain on the same element, and ordinary query/callback rerenders do
not reload it. `onVideoReadyChange` keeps timed pin actions unavailable until metadata and any
restoration seek finish. Changing design, channel or asset starts a fresh viewing session.

Failed background signing leaves an already usable source visible. A transient range error with
buffered media also leaves controls and the frame intact. An unusable source exposes **Retry
preview**, which renews or reloads the source while retaining the last usable playhead. If the
browser refuses automatic playback resumption, the player explains that it is paused and leaves
native Play available. Video signatures retain their one-hour expiry and 55-minute renewal,
with the same user-scoped cache and channel-selected private bucket. These display changes do
not alter sanitization, publication, uploads or file metadata.

Publishing is the agency's alone and produces an immutable snapshot. `publishVersion` passes no
submission key, which makes one internal version map to exactly one client publication: reopening
the dialog and sharing an unchanged version returns the existing snapshot instead of minting a
second one. Editing a project's details and editing a working design are both compare-and-set
writes, guarded on the `updated_at` / title+content+path the form was opened on; a lost race raises
the "changed while you were editing" message rather than overwriting the other edit.

Feature styles are local to `projects.css`. The shared controls, shell and modal styling stay in
`app/globals.css`, which holds no selector this feature owns alone — `.project-canvas` and
`.design-viewport` appear there only inside a grouped `.react-flow__attribution` rule shared with
`.board-canvas`.

## Bulk image drop

Dropping a bundle of PNG/JPG/WebP files onto the canvas is available only in **Working files**, to
the agency or the assigned designer — the same `canProduce` gate the Add design tile already uses.
A client gets no overlay, the agency's **Shared with client** view shows **Switch to Working files
to add designs**, and a page-level guard keeps a file dropped anywhere else on the project page from
opening in the tab; the canvas itself holds every drag, so a dropped link cannot navigate either. `bulk-drop-model.ts` is pure logic: it classifies each file (exact pixel-size
match first, then the same aspect ratio within 1%, otherwise unmatched or a tie that the person
settles), sorts naturally (`1, 2, 10`), and builds one plan per affected deliverable with its
default version: the current one, or a new one when the current version is already shared with the
client. "Shared" is the version's `reviewed` status, which only `publish_version` sets and which
the canvas already shows as **Share update**; `published_versions.version_number` counts client
publications per deliverable, so it cannot identify an internal version.

`bulk-drop-upload.ts` runs the confirmed plan against injected dependencies. Up to three files
upload at once across the whole drop, while each deliverable registers its designs strictly in
natural order: `add_design` computes `sort_order` as a plain `count(*)` with no row lock
(`supabase/migrations/202609200002_workflows.sql:121`), so one version's registrations must never
overlap. A new version is created just before its deliverable's first registration, so a
deliverable whose uploads all fail leaves no empty version, and every stored file that ends up
unregistered (its `add_design` failed, its version could not be created, or a permission refusal
stopped the drop) is discarded. Cancel stops the files still waiting to upload; a file already
uploading finishes and is registered. `bulk-drop-dialog.tsx` renders one block per deliverable with
its size, file count and version choice, the picker for unmatched or tied files, the files that
cannot be added with their reasons, per-file progress, and **Try again** for the failed files only,
reusing any version the first attempt created. `project-page.tsx` mounts one dialog per drop.
Neither `artwork-files.ts` nor `project-action-design.tsx` changed for this feature; only their
existing exports (`uploadArtwork`, `discardUnreferencedArtwork`) are called. `createDesignVersion`
now returns the created version's id, which bulk drop needs to register several designs into a
version it just created.

## Miro frame links

A version can carry a link to a Miro board/frame, kept per channel in its own table under its own
RLS: `publication_miro_links` (keyed by `publication_id`) for the client channel and
`design_version_miro_links` (keyed by `version_id`) for the internal one. Reading one channel's
table for the other channel's versions never happens; `readMiroLinks` in `project-data.ts` takes
the channel as an explicit argument rather than inferring it, so the client board and the internal
board stay apart even though both render through the same `MiroView` in Miro mode. Only the agency writes
either table — `set_publication_miro_link` / `set_version_miro_link` / `clear_publication_miro_link`
/ `clear_version_miro_link` (Supabase RPCs, called from `setMiroLink` / `clearMiroLink`) parse and
validate the pasted URL server-side; `miro-links.ts`'s `parseMiroBoardUrl` only lets the dialog
refuse an obviously bad link before it is sent. A designer or client never sees the write path.

The card's **Share with client** / **Share update** button (`project-nodes.tsx`) opens the publish
dialog, titled **Share with the client.**, which carries an optional **Miro frame** field alongside
the client note. `useLatestMiroLink` prefills it from the newest earlier client-channel link on the
same deliverable (not the version being published), so republishing the same deliverable keeps its
board without retyping the URL. The field is genuinely optional: leaving it blank when publishing
leaves any existing client-channel link on the published version untouched, because
`project-action-publish.tsx`'s `mutationFn` only calls `setMiroLink` when the field is non-empty.
Removing a link is not possible from the publish dialog; it only happens through the separate
version dialog below, by saving that dialog's field empty. That dialog (`project-action-miro.tsx`,
dispatched for `kind: "miro"`, titled **Add a Miro link.** or **Change the Miro link.** depending on
whether the version already has one) sets or clears a single version's link on whichever channel
opened it, prefilling from that version's own existing link, or otherwise the deliverable's newest
link on that channel; saving it empty clears the link (`clearMiroLink`).

On the version card, only an agency session sees the `Link2` icon button beside the card's comment
shortcut (`canManageMiro: profile?.role === "agency"` in `project-page.tsx`), `aria-label`
"Add/Change Miro link for version N" depending on whether a link already exists; it renders for the
agency alone in both channels, sized like every other `.icon-button` (`--control-height`). Whenever
the current channel's version carries a link, every role that can open the project additionally sees
a plain **View on Miro** action next to it, matching `.version-comments`'s own height, padding and
font size so the two controls read as one aligned row.

### Miro mode

Miro is the project's first view: a project opens on Miro whenever the viewer's channel has a linked
version (otherwise on Versions), and choosing **Versions** is kept as `view=versions` so a reload
respects it; with no link the URL stays clean. Clicking **View on Miro**, or the header's **Miro**
control, does not leave the project: it switches
the canvas pane into Miro mode rather than opening a separate panel. `miro-mode.ts` owns the pure
rules — `linkedVersions` filters the viewer's own channel-specific versions down to the ones carrying
a link (so a client only ever sees client-board links and a designer only internal-board links),
`pickMiroVersion` resolves the requested version if it is still linked or otherwise the newest linked
one, and `readProjectView`/`writeProjectView` keep `view=miro` and `version=<id>` in the URL so a
reload or a shared link returns to the same frame. `project-page.tsx` mounts `MiroView`
(`miro-view.tsx`) in place of the `ReactFlow` canvas, which stays mounted underneath (`visibility:
hidden`, `aria-hidden`) rather than unmounting, so switching back to **Versions** is instant. The
header folds into one compact bar, `MiroBar` (same file), so the board keeps the height: back, `Project
title / Deliverable`, a **Miro version** toggle (`V1`, `V2`, … — the linked versions of the shown
deliverable, oldest first), the **Project view** switch, **Open in Miro** (`miroBoardUrl`,
`target="_blank"` — the embed can fail to sign in behind third-party-cookie restrictions, so this link
is the way through to the real board regardless) and a **More** menu holding the credits the project
used (`ProjectCreditsChip`), the agency's channel switch and the deliverable filter (which changes
the deliverable). The shown version's status (`versionStatusLabel`) sits beside the version toggle, followed by the
project's due date (`Due Sep 24` or `No due date`); the project status is left to Versions. When the
work area is under 1000 px wide (`@container board`), the title keeps the first row beside the back
arrow and the rest of the bar wraps below it. A client whose shown version awaits their review (the same rule as the canvas's **Review version**:
their latest pending publication of that deliverable, project not delivered) gets `MiroReviewBar` at
the bottom of the board, with the tool bar raised above it; **Request changes** and **Approve** open
the review dialog with that decision preselected (`ReviewAction.decision`). The sidebar folds while Miro mode is shown (`useFoldSidebarWhile` from
`workspace/app-shell.tsx`) and returns to its previous state on leaving. `MiroView` renders the optional asset strip and
`iframe.miro-view-frame`, which runs from the header to the bottom edge with the tool bar floating
over it (on phones, where the bar sits over Miro's zoom controls, the embed stops above the bar); the
iframe is rebuilt from the stored `boardId`/`widgetId` via `miroEmbedUrl` with
`autoplay=true`, never from the pasted URL again; `key={current.id}` reloads the frame when the
toggle changes the version. Miro's own top bar (board name, menu, collaborators) is cropped off:
`.miro-view-crop` shifts the frame up by `--miro-top-bar` (64 px, Miro's current layout — re-check it
if Miro changes its bar), because the embed has no option that hides only that bar and keeps editing
and paste; the board's menu and sharing are reached through **Open in Miro**. The header's **Project view** segmented control (Versions/Miro,
`project-header.tsx`) only renders when `miroAvailable` — the viewer's channel has at least one
linked version under the current deliverable filter — and is the other entry point beside a
version card's **View on Miro**; clicking the option already pressed is a no-op, never a jump back
to the newest linked version. A reconcile effect in `project-page.tsx` keeps Miro mode from holding
a phantom state: whenever the deliverable filter, a channel switch, or an unresolved requested
version leaves nothing linked to show, it falls back to Versions, and the URL always records the
version actually resolved and shown, never the raw requested id. Details/Conversation narrow the
Miro view exactly as they narrow the canvas (`projects.css`, mirroring the tool bar's own footprint
math). While in Miro mode, the Playground's icon button no longer opens the full Playground; it
toggles `PlaygroundAssetStrip` (see [the Miro mode strip](../playground/README.md#miro-mode-strip))
above the frame instead, whose **Open full Playground** button switches to the full board; leaving
Miro mode by any path also closes this strip. `frame-src https://miro.com` is the one
Content-Security-Policy exception this feature requires (`apps/web/next.config.ts`); Miro mode is
never reachable at all unless a link exists for the viewer's channel.

## Deviation from the data-access contract: reads that are not hooks

`findUnchangedDesign`, `findDesignByAsset` and `downloadDesignAssetFile` in `project-data.ts` are
exported as plain `async (database, input)` functions instead of `use<Thing>()` hooks.

Both are called from inside `mutation.mutationFn` in `project-action-design.tsx`
(both by name, inside `mutationFn`), where React does not permit a hook
to be called at all. This is the case [rule 2 of the contract](../../../../docs/architecture/data-access.md)
now names directly, so it is the rule for these call sites rather than a licence this feature
claimed for itself; the reason is also recorded above the two functions in `project-data.ts`.

Both exist to make a resubmitted dialog idempotent. `findUnchangedDesign` asks whether a design row
already holds exactly what this save would write, so an unchanged save is a no-op instead of a
conflict. `findDesignByAsset` asks whether this version already carries the artwork that was just
uploaded, so a retried submit rewrites that design rather than adding a second one beside it. A hook
would answer from a cache populated before the upload it is meant to judge, and neither row is ever
put on screen. Both still live in `project-data.ts`, still return through `assertResult(...)`, and
are unit-tested like the writes: exact table, exact columns, exact filters and their order — including
the `.is("internal_asset_path", null)` branch — and the surfacing of the database error message.

`downloadDesignAssetFile` exists for the Playground's album copy flow
(`apps/web/features/playground/playground-albums.ts`): dragging or Enter-adding a design onto a
Playground board downloads that design's stored bytes with the viewer's own session, from whichever
bucket its channel maps to — the same choice `useDesignAssetUrl` makes for display. It runs from a
drag or keyboard handler, never on render, so it is a plain function for the same reason as the two
above. It is unit-tested the same way: which bucket it downloads from per channel, and its entry in
the shared failures table.

## Verification

`npx playwright test tests/e2e/project-feedback.spec.ts` verifies persisted review decisions,
version/design comment isolation, draft restoration, client-only reads and five viewport sizes.
The mutation scenario uses a disposable isolated client; the populated SABRE scenario is read-only.

`npx playwright test tests/e2e/miro-version-links.spec.ts` verifies Miro mode by role on the seeded
SABRE landing page: a client enters from the header and from a version card, keeps the project's
other tools (Conversation, the Playground asset strip and its clipboard copy) usable beside the
frame, keeps Miro mode across a reload, and never sees the internal board; an assigned designer sees
only the internal board; a stale `version` in the URL falls back to the newest linked one. It sets
both links through the `set_publication_miro_link` / `set_version_miro_link` RPCs before the run and
clears them in `afterAll` through the matching `clear_*` RPCs, so the seeded project is unchanged
afterward; the embed itself is never loaded, only the iframe's rebuilt `src` and each role's gating.
See [the verification record](../../../../docs/verification/miro-mode-2026-09-26.md) (and the
superseded [pre-Miro-mode record](../../../../docs/verification/miro-version-links-2026-09-26.md)
for the panel this replaced).

Video loading and playback-state regressions can be run from `apps/web` with:

```sh
npx vitest run features/projects/artwork.test.tsx features/projects/project-asset-url.test.tsx features/projects/video-pins.test.ts features/projects/project-data.test.ts
```

These tests exercise real query activation against mocked Storage and media-element lifecycle
behavior. Browser decoding, actual network cost and timed-pin interactions require the separate
browser scenarios. The repeatable loading baseline and its limits are recorded in the
[video baseline report](../../../../docs/engineering/handoffs/2026-09-23-video-optimization-baseline.md).

Executed for the data-access migration of this feature:

- `npm run check` from the repository root: typecheck, eslint, prettier and the unit suites.
  19 files / 320 tests pass. The two lint warnings it reports are pre-existing and belong to
  `features/board`.
- `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/projects/*.tsx` returns `0` for every
  file, which is the contract's own check that no component issues a query.
- `npm run test -- features/projects` covers `canvas-layout.test.ts` (canvas geometry),
  `media-client.test.ts` (media-service contract), `project-data.test.ts` (every extracted read and
  write) and `artwork-files.test.ts` (the discard path, including the case where a design already
  references the file).

These tests use stubbed Supabase clients and prove argument shape, not authorization. Role
isolation, real storage transport and the publish flow end to end are proved only by the
orchestrator's database and browser suites in
[the acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).

Current navigation and creation-card evidence: [verification record](../../../../docs/verification/client-menu-and-project-creation-2026-09-23.md).
