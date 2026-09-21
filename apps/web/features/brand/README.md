# Brand workspace

The Brand Hub lives at `/clients/:clientId/brand/:section`. Its single section selector groups identity, resources, and guidance without adding a second persistent sidebar. Sections are overview, logos, colors, typography, visual-style, products, assets, templates, messaging, and ai (presented as Brand context).

`brand-model.ts` validates field-based editing and safely reads the existing seeded content shapes. Forms expose named fields, palette rows, product fields, and line-separated guidance rather than raw JSON. `brand-data.ts` owns every Supabase read and write for the feature, as [the data-access contract](../../../../docs/architecture/data-access.md) requires: `use<Thing>()` hooks for reads a component renders, and plain `async (database, input)` functions for writes and for the two reads described below. Agency members may edit shared content; client and assigned designer sessions read it through Supabase policies. Successful section edits also invalidate briefing brand defaults.

Colors copy as HEX, RGB, a named CSS custom property, or Tailwind arbitrary-value utilities. Typography has custom sample text and optional HTTPS heading/body font-source links; previews use locally available fonts. Visual style stores Use/Avoid guidance; messaging stores reusable blocks, preferred terminology, and rules; Brand context combines explicit Use/Never direction with an allowlist of the current client's identity. Missing optional fields in older section records default safely to empty values.

Brand assets use the private `brand-assets` bucket and opaque `<client UUID>/<random UUID>.<extension>` paths. Allowed file types match the bucket: PNG, JPEG, WebP, SVG, and PDF up to 50 MiB. Raster previews use short-lived signed URLs (`useBrandAssetPreviewUrl`); SVG/PDF files are downloaded, not embedded as active document content. Upload failure retains an already uploaded file and stable metadata ID for retry. A retry checks whether that ID already committed (`findBrandAssetById`). Cancellation cleans only unregistered files through the agency-only policy (`removeBrandAssetFile`); a cleanup error keeps the dialog open with a retry message. Downloading retrieves the real authenticated blob (`downloadBrandAssetFile`). Search covers asset names, descriptions, and tags; `category`, `search`, and `asset` query parameters open a useful filtered or selected state. Product asset links search by the product name, which seeded asset tags can reference. The upload dialog itself lives in `brand-asset-upload.tsx`, split out of `brand-assets.tsx` so the listing/preview/detail view and the upload flow are each a single cohesive file.

Templates use `brand_templates` as read-only shared starting points. Creating a personal exploration writes a separate `template_drafts` row for the authenticated owner and navigates to `/clients/:clientId/brand/drafts/:draftId`. Draft queries filter owner and client in addition to server RLS. Editing never invokes project, briefing, or credit writes. Save validates content and matches the prior `updated_at` value to avoid silently overwriting another tab's changes. Existing partial drafts read missing presentation fields from their template. New drafts copy the complete supported presentation content. Browser unload and the editor's Back action warn about unsaved edits; navigation elsewhere in the application is not globally intercepted.

The seven seeded starting points are Instagram Post, Website Hero, Amazon Gallery, Presentation, Email Header, Print Flyer, and Product Card. They share one editor for name, headline, body, CTA, colors, layout, and preview zoom. CTA text is artwork content, not an unconfigured navigation action.

The reusable [CopyButton](../shared/copy-button.tsx) handles clipboard permission failure with an accessible manual-copy dialog. Brand context includes an explicit allowlist of client brand fields; it is reusable guidance, not an AI service.

Feature styles are in `brand.css`; shared controls, shell, and modal styling remain in `app/globals.css`. Brand color values are content and may be chromatic while application chrome stays restrained. The only `brand-`-prefixed selector left in `globals.css` is `.brand-logo`, and it is not this feature's: its consumers are `features/auth/login-page.tsx` and `features/workspace/app-shell.tsx`, neither of which is `features/brand`. This feature's own classes (`brand-link`, `brand-monogram`) already moved to `features/workspace/workspace.css` in an earlier pass.

## Cache invalidation: `brandQueryKeys` and no aggregate helper

`brand-data.ts` exports `brandQueryKeys`, a named-key record covering the four keys this feature's
writes dirty: `sections` (`brand-sections`), `assets` (`brand-assets`), `templateDrafts`
(`template-drafts`) and `templateDraft` (`template-draft`). Every `invalidateQueries` call in this
feature composes its own subset from that record instead of repeating the key string, per
[rule 5 of the contract](../../../../docs/architecture/data-access.md).

There is no `useInvalidateBrand()`, and adding one would be a behavior change rather than a tidy-up:
no write here dirties all four keys. Saving a section touches `sections`; adding an asset touches
`assets`; creating a draft touches `templateDrafts`; saving a draft touches `templateDrafts` and
`templateDraft`. An aggregate helper would make each of those refetch caches it does not refetch
today. The feature's other read keys — `brand-templates`, `brand-asset-preview` and `client-logo` —
are deliberately absent from the record, because no write invalidates them and naming them would
invite a call site to.

`section-editor.tsx` also invalidates `briefing-brand`, which is **not** a brand key:
`briefings/briefing-data.ts`'s `useBriefingBrand` is the only hook that reads it, so `briefings` owns
the cache entry even though this feature owns the `brand_sections` rows behind it. That call site
imports `briefingQueryKeys` and composes `briefingQueryKeys.brand` rather than declaring a
brand-side copy — the same read-side ownership test `board-data.ts` applies above
`moveProjectPosition`. The reasoning is recorded in a comment at the call site.

## Deviation from the data-access contract: two reads that are not hooks

`findBrandAssetById` and `downloadBrandAssetFile` in `brand-data.ts` are exported as plain
`async (database, input)` functions instead of `use<Thing>()` hooks.

Both are called from inside a `useMutation` `mutationFn` or a dialog's own close handler in
`brand-asset-upload.tsx`, where React does not permit a hook to be called at all. This is
[rule 2 of the contract](../../../../docs/architecture/data-access.md), not a licence this feature
claimed for itself; the reason is also recorded above the two functions in `brand-data.ts`.

`findBrandAssetById` asks whether the asset row a retry would write has already committed, on
submit and again on close, so a retried upload never inserts a second row or deletes a file the
stored row now references. `downloadBrandAssetFile` runs inside the download mutation, which exists
only to trigger a browser save; no component ever puts the blob on screen. Both still live in
`brand-data.ts`, still return through `assertResult(...)`, and are unit-tested like the writes:
exact bucket or table, exact filters, and the surfacing of the database error message.

## Verification

- `npm test -- features/brand`: 35 tests across two files — `brand-model.test.ts` (18 domain tests:
  palette parsing and four copy formats, malformed style rejection, typography bounds and safe
  source links, guidance lists, CTA/template isolation/defaults, draft naming, asset search, file
  limits, and context allowlisting) and `brand-data.test.ts` (17 tests covering every extracted
  write — exact table/bucket, exact argument object, and the database error message — plus the two
  reads-that-cannot-be-hooks and the compare-and-set conflict on a stale draft revision).
- `npm run check` from the repository root: typecheck, eslint, prettier and the whole unit suite —
  20 files / 337 tests pass. The two lint warnings it reports are pre-existing and belong to
  `features/board`.
- `grep -rn '\.from(\|\.rpc(\|\.storage\.' features/brand --include='*.tsx' | grep -v 'Array\.from('`
  returns no output, which is the contract's own check that no component issues a query.
- `npm run typecheck`: whole-application generated database contract verification.

The repeatable browser suites are `npx playwright test tests/e2e/brand-accessibility.spec.ts tests/e2e/brand-guidance.spec.ts tests/e2e/brand-canvas-final.spec.ts`. They cover section layouts at six viewport sizes, keyboard navigation/dialogs, canonical guidance persistence and role denial, four copy formats and manual fallback, all seven template definitions, private draft save/reload and owner isolation, and real asset upload/search/download/retry/cancellation with isolated cleanup. The baseline suite expects the final seven-template seed. Run concurrent specialist invocations with separate output directories; the orchestrator runs the final suite once with one worker. [The design audit](../../../../docs/verification/design-audit.md) records executed results separately from planned coverage. Unit tests alone do not prove live authorization or complete production acceptance.
