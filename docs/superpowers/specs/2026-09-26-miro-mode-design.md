# Miro mode on the project page

Date: 2026-09-26

Status: design approved in chat; awaiting written-spec review

## Objective

When a version has a Miro frame link ([Miro frame links](2026-09-26-miro-version-links-design.md)),
the project page can switch its canvas area to that Miro board. The project's own tools stay
around it: the bottom tool bar, the Details and Conversation panels, and the Playground. In this
mode the Playground opens only its asset strip, and each image there can be copied and pasted
into Miro.

A spike on 2026-09-26 with the user's board settled what the embed allows:

- The live embed loads without a Miro login in Chromium and WebKit and, on a board shared as
  "anyone with the link can edit", opens in Editing mode.
- Without `autoplay=true` the embed shows a "See the board" preview that needs an extra click.
- Copying an image on the product's page and pasting it inside the embed (Cmd/Ctrl+V) creates the
  image on the board. Verified by automation and by the user.
- Dragging an image from the product's page into the embed does **not** work (tested by the user).
  Drag is therefore out of scope.

Success means all of the following hold:

1. A viewer with a Miro link on their channel can switch the project page to Miro mode from the
   header (**Versions | Miro**) or from a version card (**View on Miro**), and back.
2. Miro mode shows the chosen version's frame, loads without the extra click, and offers a
   selector of the versions that have a link plus **Open in Miro**.
3. Details and Conversation open beside Miro exactly as they do beside the canvas.
4. In Miro mode the Playground button opens the asset strip at the top of the view; every image
   in it has **Copy**, which puts a PNG on the clipboard with a confirmation to paste in Miro.
5. The URL records the mode and version, so a reload or a shared link returns to the same state.
6. No role reads anything it could not read before; the client never sees the internal board and
   a designer never sees the client board.
7. Both themes, 1440 px and 390 px widths and keyboard use work.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Where Miro appears | As a view of the project page, replacing the canvas (A). The full-screen Miro panel is removed. |
| Which frame opens | The version entered from; the header switch opens the newest version with a link for the current deliverable filter; a selector inside the view lists only versions with a link (A). |
| Asset strip content | The existing album row (Brand Hub folders and project versions) plus a **Playground** album with the images on this role's Playground board (B). |
| Moving assets into Miro | Copy and paste only. Drag does not reach the embed; a Miro Web SDK app would be required for drag and is out of scope. |

## Non-goals

- No drag into Miro, no Miro Web SDK app, no Miro REST API, OAuth or sync.
- No new tables, policies or RPCs. Links, albums and Playground items are read exactly as today.
- No copy for non-image files (PDF, video, SVG, documents); they stay listed and disabled.
- No change to how links are set (agency-only, publish dialog and card link action).

## Page behaviour

**Entering and leaving.**

- The project header shows a **Versions | Miro** segmented control next to the channel control,
  only when at least one version on the viewer's current channel has a link.
- Choosing **Miro** selects the newest version with a link among the deliverables the header's
  deliverable filter shows; choosing **Versions** returns to the canvas with its viewport intact
  (the canvas stays mounted but hidden).
- **View on Miro** on a version card enters Miro mode on that version.
- The agency's channel switch keeps working in Miro mode: switching channel re-selects the newest
  linked version on the new channel, or returns to Versions when that channel has none.

**The Miro view.**

- The embed fills the canvas area. Its source is built from stored ids with `autoplay=true`
  (`miroEmbedUrl`), never from a pasted URL.
- A slim row at the top of the view holds a version selector (label
  `<deliverable> · V<n>`, only linked versions, newest first) and **Open in Miro ↗** (new tab).
  Changing the selection reloads the embed on that frame.
- The bottom tool bar stays. Details and Conversation open as the side panel and narrow the view,
  as with the canvas. The Conversation panel keeps its current version context: it follows the
  version chosen in Miro mode.

**URL state.** `?view=miro&version=<version id>` on the project route. On load, an unknown,
unlinked or other-channel version id falls back to the newest linked version, and a project with
no link on the channel falls back to Versions. The agency's existing `channel` parameter is kept.

## Asset strip in Miro mode

- In Miro mode the Playground button toggles the asset strip docked at the top of the Miro view
  instead of opening the full-screen Playground. The strip has **Open full Playground**.
- Albums: the Brand Hub folders and project versions `PlaygroundAlbumsPanel` already builds for the
  viewer's role, plus a **Playground** album of the images on the viewer's role board for this
  project (`usePlayground`), newest first.
- The strip is the existing `PlaygroundAlbumsPanel` with a mode prop: `"board"` (today's add and
  drag into the Playground) or `"clipboard"`. In `"clipboard"` mode each previewable image
  (PNG, JPEG, WebP) shows **Copy**; other files stay listed and disabled with their reason.
- Copy downloads the file through the existing private download paths (`CopyDependencies` for
  brand and design files, `getPlaygroundDownload` for Playground files), converts it to PNG in a
  canvas, and writes it with `navigator.clipboard.write([new ClipboardItem({ "image/png": … })])`
  inside the click. It then announces "Copied — paste in Miro with ⌘V / Ctrl+V" in a polite live
  region.
- Failure (no image clipboard support, download error, permission denied) announces
  "Couldn't copy this image." and offers **Download** for that file.

## Removed and moved code

- `MiroBoardPanel` (`features/projects/miro-board-panel.tsx`, its test and styles) is removed.
- `useFullscreenLayer` and `.fullscreen-layer` go back to the Playground as its own lifecycle, since
  Playground becomes the only consumer (`apps/web/features/shared/README.md` rule: a shared
  primitive needs two real consumers). Playground behaviour does not change.

## Access and security

- Links are read as today (`CanvasVersion.miro`, channel-scoped by table and RLS).
- Album and Playground reads are the ones the viewer already has; the clipboard receives only a
  file the viewer can already download.
- The Content-Security-Policy stays `frame-src https://miro.com`. Clipboard writes need no new
  permission policy.

## Testing

- Unit:
  - the linked-version selection rules (newest linked version, deliverable filter, fallback);
  - URL parsing and writing for `view` and `version`;
  - the header control appearing only when a link exists;
  - the selector listing only linked versions;
  - the album panel's clipboard mode: Copy on images only, success and failure announcements,
    **Download** fallback;
  - the Playground album built from board items.
- Browser (Playwright on the local stack, links set and cleared by the spec):
  - the client enters Miro mode from the header and from a card, switches version, opens
    Conversation beside Miro, and copies an image (clipboard permission granted);
  - the assigned designer sees only the internal board;
  - a reload with `?view=miro` returns to Miro mode;
  - the Content-Security-Policy spec reports no violation.
- Visual: Miro mode with the strip and with a side panel, at 1440 px and 390 px, light and dark.

## Documentation

- `apps/web/features/projects/README.md`: Miro mode replaces the panel description.
- `apps/web/features/playground/README.md`: clipboard mode and the Playground album.
- `apps/web/features/shared/README.md`: remove the full-screen layer entry.
- `docs/architecture/permissions.md` and `backend.md`: unchanged rules; update the Miro wording
  where it mentions the panel.
