# Brand workspace

The Brand Hub lives at `/clients/:clientId/brand/:section`. Its nine sections are Overview, Logos,
Colors, Typography, Visual style, Products, Assets, Messaging and Brand context. They share the
floating client navigation/account card, a white title card and the workspace grid. The section
links retain their bounded horizontal scrolling on narrow screens; client navigation wraps above.
Notifications open beside the signed-in profile, using the shared account popover.

Templates has been removed from navigation and the gallery/creation UI. Old `/brand/templates`
links redirect to Assets. Existing `brand_templates` and owner-private `template_drafts` records are
preserved. Direct saved-draft URLs still support editing, optimistic revision checks and return to
Assets, without project or billing writes. Draft reads filter owner and client in addition to RLS.

## Guidance and editing

`brand-model.ts` validates field-based editing and safely reads existing seeded content. Forms
expose named fields, palette rows, product fields and line-separated guidance rather than raw JSON.
Agency members edit canonical content; clients and assigned designers read it through Supabase
policies. Successful edits also invalidate the briefing feature's brand-default query.

Colors copy as HEX, RGB, CSS variables or Tailwind values. Typography supports sample text and HTTPS
font-source links. Visual style records Use/Avoid rules; messaging records reusable copy and approved
terminology. Brand context combines explicit direction with an allowlist of the client's identity;
it is reusable guidance, not an AI service. The shared CopyButton provides a manual fallback.

## Assets and folders

`brand-assets.tsx` owns the asset collection, search/category filters, folder navigation and details.
Folders are one level deep and belong to one client. All assets and Unfiled remain available;
existing assets start in Unfiled. Folder buttons show counts for the complete collection, while the
active folder heading reports the search/category result count.

The agency can create or rename folders, choose a destination when uploading, and move an asset
from its detail dialog. Deleting a folder requires confirmation and moves its assets to Unfiled;
no asset record or Storage object is deleted. `brand-folder-dialog.tsx` owns form validation and a
stable creation ID, including recovery after a committed response is lost. A renamed folder retains
its ID. `brand-asset-folder-picker.tsx` handles per-asset moves. Clients and assigned designers can
browse folders and download approved files, but cannot organize them.

Migration `202609230009_brand_asset_folders.sql` adds `brand_asset_folders` and nullable
`brand_assets.folder_id`. RLS enforces client-scoped reads and agency writes. Names are trimmed,
1–80 characters and unique case-insensitively per client. A composite foreign key prevents assigning
an asset to another client's folder. Folder client/ID columns cannot be updated by authenticated
users. Folder deletion nulls only `folder_id`; file paths and asset ownership stay unchanged.

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
