# Brand workspace

The Brand Hub lives at `/clients/:clientId/brand/:section`. Its nine sections are Overview, Logos,
Colors, Typography, Visual style, Assets, Files, Messaging and Brand context. Files renders the
client's project files (`features/assets/assets-page.tsx`) under its own heading and actions. Products has no tab of its
own: it is an entry in the Assets folder list (`brand-products.tsx`, shown only when that entry is
chosen, so it no longer sits above every folder), and old `/brand/products` links redirect to
Assets. They share the
floating client navigation/account card, a white title card and the plain page background. The title
card is one row: **Brand Hub** with the section links beside it, which scroll sideways when they do
not fit and move under the title below 640 px; client navigation wraps above.
The active section link is the only visible name of the section: each section's `h2` (and the
Files heading) is visually hidden for assistive technology, and the agency's **Edit** action sits
alone at the right above the content.
Notifications open beside the signed-in profile, using the shared account popover.

The Logos section shows the client's Logo-category files under **Logo files**, each with the
Assets page's own preview (a raster image is previewed through a short-lived signed URL; SVG and
PDF show a labelled icon, since they are downloaded rather than embedded), beside **Find logo
files**, which opens Assets filtered to logos. With no logo files, the section keeps to its
guidance.

Templates has been removed from navigation and the gallery/creation UI. Old `/brand/templates`
links redirect to Assets. Existing `brand_templates` and owner-private `template_drafts` records are
preserved. Direct saved-draft URLs still support editing, optimistic revision checks and return to
Assets, without project or billing writes. Draft reads filter owner and client in addition to RLS.

## Guidance and editing

`brand-model.ts` validates field-based editing and safely reads existing seeded content. Forms
expose named fields, palette rows, product fields and line-separated guidance rather than raw JSON.
Agency members edit canonical content; clients and assigned designers read it through Supabase
policies. Successful edits also invalidate the briefing feature's brand-default query.

Colors show as one row of swatches (a long palette scrolls sideways) and copy as HEX, RGB, CSS
variables or Tailwind values. Typography supports sample text and HTTPS
font-source links. Visual style records Use/Avoid rules; messaging records reusable copy and approved
terminology. Brand context combines explicit direction with an allowlist of the client's identity;
it is reusable guidance, not an AI service. The shared CopyButton provides a manual fallback.

## Products

Each product has a name, description, specifications, usage guidance, an optional image and an
optional link. The image is one of the client's previewable brand assets (PNG, JPEG or WebP),
stored by its id (`imageAssetId`) and chosen in the editor, so it is uploaded once in Assets and
previewed through the same signed URL as any asset. The link must be a complete HTTPS address
(`safeHttpsUrl`) and opens in a new tab. Products saved before images and links read with both
empty. Readers see the Products entry only when products exist; the agency always sees it to add
one. Specifications and usage guidance sit behind **Details** on each card.

## Assets and folders

`brand-assets.tsx` is a directory. Folders nest up to six levels and belong to one client; the top
level lists the **Products** tile and the top-level folders as shared `FolderTile`s
(`features/shared/folder-tile.tsx`), then the files and links filed at the top level. Opening a
folder shows its subfolders, then its own files and links, under a path (Assets › Campaigns ›
Summer) whose earlier steps lead back up; the path is hidden at the top level, where the section
title already says Assets. A folder tile counts everything inside it, subfolders included. A search
or category filter looks through every folder at once and lists the matches as search results.
The tree helpers (`folderPath`, `childFolders`, `folderOptions`, `folderAssetCount`) are pure
functions in `brand-model.ts`.

A link is an asset with an HTTPS address instead of a file (`brand-link-dialog.tsx`, category
Link): its card shows the address's host and its detail dialog offers **Open link** in place of
**Download file**. Addresses must be complete HTTPS URLs (`safeHttpsUrl` and a database check).

The agency can create or rename folders, choose a destination when uploading, and move an asset
from its detail dialog. Deleting a folder requires confirmation and moves its subfolders and assets
up to its parent; no asset record or Storage object is deleted. `brand-folder-dialog.tsx` owns form
validation and a stable creation ID, including recovery after a committed response is lost. A
renamed folder retains its ID; folders cannot be moved. `brand-asset-folder-picker.tsx` handles
per-asset moves with the indented folder tree. A client may also create folders (at any level) and
add images (PNG, JPEG or WebP; **Add image**) and links, but cannot rename or delete folders or
move, edit or delete assets. Assigned designers browse folders and download files only.

Migration `202609230009_brand_asset_folders.sql` adds `brand_asset_folders` and nullable
`brand_assets.folder_id`. RLS enforces client-scoped reads and agency writes;
`202609260004_client_brand_uploads.sql` adds client-member folder inserts, raster-only asset inserts
and Storage uploads, and a client delete limited to its own unreferenced upload (the cleanup after a
failed save). `202609260005_brand_asset_directories.sql` adds `parent_id` (set on creation only, so
no cycle can form; a composite foreign key keeps it inside the client; a trigger caps the depth at
six), moves a deleted folder's contents to its parent, and adds `brand_assets.link_url`. Names are
trimmed, 1–80 characters and unique case-insensitively among siblings. A composite foreign key
prevents assigning an asset to another client's folder. Folder client/ID/parent columns cannot be
updated by authenticated users.

The private `brand-assets` bucket keeps opaque `<client UUID>/<random UUID>.<extension>` paths.
PNG, JPEG, WebP, SVG and PDF are accepted up to 50 MiB. Raster previews use short-lived caller-scoped
signed URLs; SVG/PDF are downloaded instead of embedded as active content. `brand-asset-upload.tsx`
retains an uploaded file and stable metadata ID across failed saves. Cancellation removes only an
unregistered upload, with a retryable cleanup error. Downloads retrieve the authenticated blob.
Search covers names, descriptions and tags; `category`, `search` and `asset` URL parameters retain
filtered links and direct asset references. Folder organization does not change these references.

## Data and styling boundaries

All queries live in `brand-data.ts`: rendered reads are hooks; writes are plain async functions.
The submit/close recovery reads `findBrandAssetById` and `findBrandAssetFolder`, plus on-demand
`downloadBrandAssetFile`, are plain functions because mutation handlers cannot call hooks.
Validation, trimming and retry IDs remain in components.

`brandQueryKeys` owns sections, assets, folders and the legacy open draft. Asset writes invalidate
assets; folder edits invalidate folders and assets; section and draft writes invalidate their own
keys. There is no whole-feature invalidation helper. `briefingQueryKeys.brand` remains owned by
Briefings. Signed preview URLs and client logos expire independently.

Feature styling stays in `brand.css`; shared controls and layout tokens stay in `app/globals.css`.
Legacy draft preview primitives remain available to the direct editor. Template gallery selectors
and creation code have been retired; persisted template data has not been removed.

## Verification

Run `npm run check` from the repository root for type, lint, formatting and unit checks.
Run `supabase test db supabase/tests/database/brand_asset_folders.test.sql` for folder constraints,
role isolation, revoked access and file-preserving deletion in a rolled-back transaction.

From `apps/web`, run:

```bash
npx playwright test tests/e2e/brand-folders.spec.ts tests/e2e/brand-accessibility.spec.ts tests/e2e/brand-guidance.spec.ts tests/e2e/brand-canvas-final.spec.ts
```

These cover real folder
creation/retry/move/delete, upload/download, legacy private draft editing, guidance persistence,
keyboard behavior and responsive accessibility with isolated cleanup. See the
[current verification](../../../../docs/verification/client-polish-and-brand-folders-2026-09-23.md)
for executed evidence; broader release acceptance is separate.
