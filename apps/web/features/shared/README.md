# Shared UI primitives

Everything in this directory is used by **two or more features**. The consumer
list under each entry is the justification for the primitive living here: a
primitive that drops to a single consumer should move back into that feature.

A candidate only becomes a shared primitive when the shared markup is the
substance of the call site — the component body is fixed markup and the
variation is leaf values. A container class wrapped around arbitrary children is
not a primitive; it adds an import and an indirection without removing
duplication.

Each primitive reproduces the markup, class names and accessibility attributes
its consumers used before extraction, exactly. Where consumers differ, the
difference is a prop, never a normalisation.

## Shared visual contracts

`app/globals.css` owns shared tokens and primitives. Standard page wrappers use the 1280 px content token, responsive page gutters and a 32 px section rhythm. Panel padding is 24 px, panel radius 12 px, and control radius 8 px. Supporting text uses the 11/12/13/14 px token scale; page titles use 28 px.

The CSS-only `.section-tabs` primitive is consumed by `brand/brand-page`, `briefings/briefings-page`, `credits/credits-page`, and `settings/settings-page`. It shares target size, spacing, horizontal scrolling and the active underline while leaving link/button markup, accessibility state and route/filter behavior with each owner. Existing feature classes remain for placement and test locators; they do not redeclare the shared item appearance.

## Components

### Folder tile

`FolderTile` (`folder-tile.tsx`) is one folder in a directory view: an icon, the folder's name and
a count, laid out by the `.folder-tiles` grid in `globals.css`. A `href` opens a route; `onOpen`
opens an in-page directory. Consumers: `assets/assets-page` (campaign folders) and
`brand/brand-assets` (the Assets directory and its Products entry).

### Brand mark

`BrandMark` (`brand-mark.tsx`) is the studio's animated mark: `public/brand/logo-mark.webm` plays,
rests on the finished mark for ten seconds and plays again, or shows the still
`public/brand/logo-mark.webp` with reduced motion or when the video cannot play. It is decorative
and carries its own `.brand-mark` class; each consumer sizes and screens it. Consumers:
`workspace/app-shell` (the sidebar lockup) and `projects/project-tool-bar` (a tile in the menu
colour beside the first tool).

### Canvas background and controls

`CanvasBackground` (`canvas-background.tsx`) renders a 24-unit dot grid (1.5-unit dots, after the
Higgsfield canvas the user chose) using `--canvas-background` and `--canvas-grid`. Each instance
has a unique SVG pattern
ID so the mounted project and Playground backgrounds remain independent. The
Playground feature overrides the tokens locally for a slightly darker surface.

`CanvasControls` (`canvas-controls.tsx`) is one horizontal pill at the bottom left: Zoom Out, the
live zoom level (a whole percent in tabular figures, hidden at 380 px and narrower), Zoom In, a
divider and the fit button. Moves animate over 200 ms, or immediately when reduced motion is
requested. Zoom buttons respect the current canvas limits. The optional `onFit(duration)`,
`fitLabel` and `fitIcon` preserve the board's custom readable framing and return icon. Its look
lives in `app/globals.css` (`.canvas-zoom`) and takes its colours from the theme tokens through
xyflow's variables. The optional `portalTarget` mounts the same pill in the board's tool dock,
which places it at the bottom left of a wide board and below the rail's bottom bar on small
screens; a null target waits for the dock to mount, and omitting it keeps the in-canvas position
for the other consumers.

Consumers: `board/board-canvas-view` and `board/board-canvas-controls`,
`projects/project-versions-canvas`, `projects/design-viewer`, `playground/playground-board`.

These canvases also use `canvasNavigation` (`canvas-navigation.ts`): two-axis
scroll panning at native delta speed, pinch zoom, and no accidental wheel or
double-click zoom. Direct dragging, node selection and pin-mode restrictions
remain owned by each feature. No transform easing is applied to pointer gestures.

### `Modal` — `modal.tsx`

The native `<dialog>` overlay: focus trap, scroll lock, focus restore on close
and light dismiss.

| Prop              | Type                             | Default | Notes                                                  |
| ----------------- | -------------------------------- | ------- | ------------------------------------------------------ |
| `open`            | `boolean`                        | —       | Opens and closes the dialog.                           |
| `onClose`         | `() => void`                     | —       | Called by the close button, Escape and the backdrop.   |
| `title`           | `string`                         | —       | Labels the dialog through `aria-labelledby`.           |
| `description`     | `string`                         | —       | Describes it through `aria-describedby`.               |
| `children`        | `ReactNode`                      | —       | The dialog body.                                       |
| `footer`          | `ReactNode`                      | —       | The action row.                                        |
| `size`            | `"sm" \| "md" \| "lg" \| "xl"`   | `"md"`  | Width class; `xl` is the new-briefing modal's 1200 px. |
| `initialFocusRef` | `RefObject<HTMLElement \| null>` | —       | Element focused on open.                               |

Consumers: `assets/assets-page`, `assets/upload-file-dialog`,
`brand/brand-assets`, `brand/section-editor`, `campaigns/campaign-dialog`,
`credits/credit-actions`, `credits/credits-page`,
`projects/project-action-dialog`, `projects/project-details`,
`settings/campaign-settings`, `settings/client-settings`,
`settings/preset-settings`, `shared/copy-button`, `team/team-page`,
`workspace/app-shell`.

### `CopyButton` — `copy-button.tsx`

Copies text to the clipboard, announces the result, and falls back to a
selectable textarea in a `Modal` when the clipboard is unavailable.

| Prop        | Type     | Default          |
| ----------- | -------- | ---------------- |
| `text`      | `string` | —                |
| `label`     | `string` | `"Copy"`         |
| `className` | `string` | `"button quiet"` |

Consumers: `brand/brand-assets`, `brand/brand-sections`,
`projects/project-details`.

### `FormError` — `form-error.tsx`

`<p className="form-error" role="alert">{children}</p>`. The inline error
paragraph used by forms, dialogs and data-loading failures. It pairs the
`form-error` style with `role="alert"` so the message is always announced.

| Prop       | Type        | Default |
| ---------- | ----------- | ------- |
| `children` | `ReactNode` | —       |

Consumers include: `assets/assets-page`,
`assets/upload-file-dialog`, `auth/login-page`, `board/board-notices`,
`brand/brand-asset-upload`, `brand/brand-assets`, `brand/brand-folder-dialog`,
`brand/brand-asset-folder-picker`,
`brand/draft-editor`,
`brand/section-editor`, `briefings/briefing-attachments`,
`briefings/briefing-detail`, `briefings/briefing-editor-form`,
`campaigns/campaign-dialog`,
`credits/credit-actions`, `credits/credits-page`, `projects/comment-panel`,
`projects/project-action-dialog`, `projects/project-details`,
`settings/account-recovery`, `settings/account-settings`,
`settings/campaign-settings`, `settings/client-settings`,
`settings/invitation-acceptance`, `settings/preset-settings`,
`settings/workspace-settings`, `team/team-page`,
`workspace/notifications-page`.

Two `form-error` paragraphs are deliberately **not** `FormError`:
`workspace/notifications-page` nests its paragraph inside a `<div role="alert">`
that already announces the whole block, and `briefings/briefing-detail` shows a
standing balance note that is not an alert. Turning those into `FormError` would
add a live region each site does not have today.

### `PageStatus` — `page-status.tsx`

`<div className="page-content" role="status">{children}</div>`. The full-page
status message shown while a route loads its data, and the one appearance that
wait has anywhere inside the workspace shell. Its copy opens with `Loading`;
softer verbs are kept only where the wait is a check rather than a fetch.

| Prop       | Type        | Default |
| ---------- | ----------- | ------- |
| `children` | `ReactNode` | —       |

Consumers: `assets/assets-page`, `board/board-page`, `brand/brand-page`,
`brand/draft-editor`, `briefings/briefing-detail`, `briefings/briefing-editor`,
`briefings/briefings-page`, `credits/credits-page`, `projects/project-page`,
`reviews/reviews-page`, `settings/settings-page`, `workspace/app-shell`,
`workspace/home-page`.

### `WelcomeHeader` — `welcome-header.tsx`

The greeting at the top of a dashboard: `eyebrow` (the page's role name) above an `<h1>`, an
optional `subtitle` paragraph and `actions` — the same `page-heading` markup every page already
used, so no page's look changes by adopting it. `card` (default `false`) switches the wrapping
`<header>` from the plain `page-heading` on `/home` to `page-heading client-page-heading`, the
white client header card the client-facing routes use. Callers wrap `actions` in their own
container; the component adds none. `welcomeTitle(displayName)` builds the greeting's copy —
`"Welcome back, <first name>"`, or plain `"Welcome back"` when there is no name.

| Prop       | Type        | Default | Notes                                              |
| ---------- | ----------- | ------- | -------------------------------------------------- |
| `eyebrow`  | `string`    | —       | The role name shown above the greeting.            |
| `title`    | `string`    | —       | Usually `welcomeTitle(displayName)`.               |
| `subtitle` | `string`    | —       | Optional; omitted when there is nothing to show.   |
| `actions`  | `ReactNode` | —       | Optional; rendered after the heading text.         |
| `card`     | `boolean`   | `false` | `true` on client routes for the white header card. |

Consumers: `workspace/home-page`, `overview` (the welcome dashboards).

### `StudioManagedNotice` — `studio-managed-notice.tsx`

The page a designer reaches by URL for an area only the studio and the client use: an `<h1>` of
`{area} are managed by the studio.` and a **Back to your work** link to `/home`, inside
`.empty-state`, so it keeps the workspace's card treatment instead of bare text under the floating
header.

| Prop   | Type     | Default |
| ------ | -------- | ------- |
| `area` | `string` | —       |

Consumers: `briefings/briefing-editor`, `credits/credits-page`.

### `SearchField` — `search-field.tsx`

The search input of the board, service chooser and list pages: a `label.search-field`
wrapping the magnifier icon and the input, so the whole control is clickable and
the input always carries its own accessible name.

| Prop          | Type                                  | Default | Notes                                                                                                   |
| ------------- | ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `label`       | `string`                              | —       | The input's `aria-label`.                                                                               |
| `value`       | `string`                              | —       |                                                                                                         |
| `onChange`    | `(value: string) => void`             | —       | Receives the new input value.                                                                           |
| `placeholder` | `string`                              | —       |                                                                                                         |
| `iconSize`    | `number`                              | —       | Required: the icon size differs per page (15–20) and is preserved per call site rather than normalised. |
| `inputRef`    | `RefObject<HTMLInputElement \| null>` | —       | For pages that focus the field on mount.                                                                |

Consumers: `assets/assets-page`, `board/board-toolbar`, `brand/brand-assets`,
`briefings/briefing-service-picker`, `credits/credits-page`.

The field's own border becomes the focus ring (`.search-field:focus-within` in
`globals.css`); the input inside it draws none, so a focused field reads as one box.

## Non-component modules

| Module                            | Purpose                                                                                                                                                                                                                                                                                                                             | Consumers                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas-fit.ts`                   | Viewport fit maths for the board and project canvases.                                                                                                                                                                                                                                                                              | `board/board-layout`, `projects/canvas-layout`                                                                                                                                                                                                                                                                                                        |
| `concurrency.ts`                  | `mapWithConcurrency(items, limit, run)`: runs `run` over `items`, never more than `limit` at once, resolving in the same order as `items` regardless of completion order. A rejection from `run` propagates through the returned promise immediately, exactly as a hand-rolled `Promise.all` worker loop of the same shape would.   | `projects/bulk-drop-model` (the bulk image drop's dimension-read and upload phases), `playground/use-playground-drop`, `playground/playground-albums`                                                                                                                                                                                                 |
| `forms.css`                       | The `stack-form`, `form-row`, `checkbox-label` and `form-actions` layout classes.                                                                                                                                                                                                                                                   | Loaded once globally by `app/layout.tsx`.                                                                                                                                                                                                                                                                                                             |
| `status-tone.ts`                  | The `StatusTone` vocabulary (`neutral`, `active`, `attention`, `complete`) and `statusToneClass()`, which turns a tone into the `.status-badge` class list.                                                                                                                                                                         | `board/board-nodes`, `board/board-page`, `briefings/briefing-detail`, `briefings/briefings-page`, `credits/credits-page`, `projects/project-page`, `workspace/home-page`                                                                                                                                                                              |
| `upload-rules.ts`                 | The shared MIME/extension vocabulary (`uploadExtensions`), the per-path byte ceilings (`BUCKET_MAX_BYTES`, `ARTWORK_MAX_BYTES`, `VIDEO_MAX_BYTES`) mirrored from the Storage bucket migrations, the allow-list/message/accept-attribute helpers built from them, and `fileTypeLabel`/`mimeForPath` for naming a stored file's type. | `assets/asset-data`, `assets/file-card`, `assets/upload-file-dialog`, `board/board-data`, `brand/brand-asset-upload`, `brand/brand-model`, `briefings/briefing-attachments`, `playground/playground-model`, `playground/playground-types`, `projects/artwork-files`, `projects/media-client`, `projects/project-action-dialog`, `projects/video-pins` |
| `use-dismiss-on-outside-click.ts` | `useDismissOnOutsideClick(ref, active, onDismiss)`: closes an open panel on a `pointerdown` outside `ref`'s subtree. No listener while `active` is false, and it is always removed on cleanup/unmount. Callers keep their own extras (focus-on-open, an Escape key handler) beside it, unchanged.                                   | `board/board-period-picker`, `board/board-toolbar`, `workspace/client-switcher`                                                                                                                                                                                                                                                                       |

`status-tone.ts` holds the vocabulary, not the mappings. Each domain maps its own
enum onto a tone beside its label map — `projectStatusTones` in
`workspace/workspace-data.ts`, `briefingStatusTones` in
`briefings/briefing-model.ts`, `creditRequestStatusTones` in
`credits/credit-model.ts` — so a database enum value never appears in a
stylesheet selector and a new domain needs no new CSS. `neutral` is the badge's
base appearance and adds no modifier class, which is why a badge with no status
at all (`team/team-page.tsx`) still writes `className="status-badge"`.

`upload-rules.ts` holds a vocabulary (`uploadExtensions`, keyed by MIME type), not one allow-list:
each uploader declares its own subset (`standardUploadMimes`, `brandUploadMimes`,
`videoUploadMimes`, `designUploadMimes`), so widening the vocabulary grants nothing on its own.
Playground is the one consumer whose allow-list — `PLAYGROUND_IMAGE_MIMES` /
`PLAYGROUND_FILE_MIMES` in `playground/playground-types.ts` — needs GIF, plain text/CSV, RTF and
the legacy and OOXML Office document types; those extensions live only in `uploadExtensions`, kept
apart from the buckets the other allow-lists mirror, and `playground/playground-model.ts` builds
its own `playgroundFormats` map from that shared source rather than a second copy.
`PLAYGROUND_MAX_FILE_BYTES` (25 MiB) stays declared in `playground-types.ts` rather than as a
fourth shared ceiling here, since Storage's `playground-assets` bucket is the only one it bounds.

## Repository-wide invariant tests

Three test files live here because the invariant they check spans every feature,
so there is no single feature that owns them.

| Test                            | Invariant                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stylesheet-boundary.test.ts`   | No two feature stylesheets declare the same selector, which is what makes their global load order irrelevant.                                                                                                        |
| `invalidation-boundary.test.ts` | Cache keys are declared once, in the owning feature's `<feature>-data.ts`, and composed at the call site — so an invalidation set cannot silently widen. See [rule 5](../../../../docs/architecture/data-access.md). |
| `status-tone.test.ts`           | Every status value in every domain maps to a tone the badge actually styles, checked against the generated database enums, and no enum value appears as a `.status-badge` selector.                                  |

`invalidation-boundary.test.ts` checks four things: that no file outside a
`*-data.ts` module invalidates a bare string-literal query key (with a small
allowlist that names both the call site and the key, and that fails once that
call site stops using it); that the one keyless whole-cache clear, in
`settings/invitation-acceptance.tsx`, stays the only one; that the five-key
realtime fan-out in `projects/project-events.ts` is pinned, since it matches no
exported key set and has no non-widening constant to route through; and that
`brandQueryKeys`, `briefingQueryKeys` and `assetQueryKeys` still hold the exact
strings their call sites were measured against.

## Candidates that were evaluated and rejected

Recorded so they are not re-proposed:

- **`empty-state`** (14 call sites) — only the wrapper `<div>` is common. The
  call sites differ in whether they have an icon, which icon and size, whether
  the heading is `h2` or `h3` or absent, whether there is a paragraph, and
  whether there is an action button. Reproducing them needs five
  content-injection props, at which point the component contributes one class
  name.
- **`centered-state`** (7 call sites) — a `<main>` wrapper around arbitrary
  children, three of which also carry `role="status"`. It answers only for the
  surfaces that render outside the workspace shell (`app/login`,
  `app/auth/invite`, `app/auth/recovery`, `app/error`, `app/not-found`,
  `auth/auth-provider`) and for the shell's own failure state; the shell's
  loading state uses `PageStatus`, so "this route is loading" has one
  appearance rather than two.
- **`form-actions`** (6 call sites) — a `<div>` wrapper; the button rows differ
  in count, in `type="submit"` versus `onClick`, and in every label and disabled
  expression.
- **Plain `<p role="status">` loading text** (15 call sites) — a bare HTML
  element with one ARIA attribute and no class contract. There is no shared
  decision for the component to encapsulate.
- **`settings-success`** (8 call sites) — identical markup, but every consumer
  is inside `features/settings`. It belongs to that feature, not here.
- **`button`** — `className="button"` is a style, not a component; the children,
  handlers and types differ at every call site.
- **`field`** — no consumers. The class is not applied anywhere and is not
  defined in `forms.css`.
