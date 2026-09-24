# Assets

The Files page uses the shared floating client navigation/profile and white title/action card
on the workspace grid. Search, project scope and file-type controls sit inside that card, while
actual file results and their authorized actions remain below. The content uses the full available
width with the same desktop/mobile gutters as other client sections.

The files page at `/clients/:clientId/assets` lists working files, shared designs and delivery
files across a client's projects, and lets the agency upload a working file or a delivery file and
mark an approved project as delivered.

`asset-data.ts` owns every Supabase read and write for the feature, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useProjectAssets`
is the page's single read hook. `findAssetByStoragePath`, `removeUnusedUpload`,
`uploadInternalAsset`, `recordProjectAsset` and `markProjectDelivered` were relocated from
`upload-file-dialog.tsx` and `assets-page.tsx` during the small-features migration (task 15).

Each file is a `FileCard` (`file-card.tsx`). A raster image (PNG, JPEG, WebP, GIF) shows its own
preview: `useAssetPreviews` signs every image in the list, one `createSignedUrls` request per bucket,
for ten minutes, the board thumbnails' revocation window, and the page signs the whole list rather
than the filtered one so filtering never re-signs. Every file in the list already came through the
viewer's role-scoped read, so a client is only ever signed shared designs and deliveries. Any other
file shows an icon and its real type from `fileTypeLabel` ("PDF", "MP4", "Word", or "File"); a
shared design takes its type from its stored file (`publishedDesignAsset` with `mimeForPath`), so a
shared video is never called an image. Cards in a row share a height and their footers line up.

`file-download.ts` moved here from `features/shared/` in the same migration: it had exactly one
consumer, `assets-page.tsx`, and the shared layer's own rule is that a primitive belongs in
`shared/` only with two or more real consumers.

## Cache invalidation: `assetQueryKeys` and `useInvalidateAssets()`

`asset-data.ts` exports `assetQueryKeys` (`["assets"]`) and `useInvalidateAssets()`. Unlike `brand`
and `briefings`, this feature does get an aggregate helper, and the reason is the condition
[rule 5 of the contract](../../../../docs/architecture/data-access.md) sets for one: both of the
feature's write call sites — `assets-page.tsx`'s deliver mutation and `upload-file-dialog.tsx`'s
upload mutation — already invalidated the whole set, because the whole set is a single key. Routing
them through the helper is therefore exactly non-widening.

`assets-page.tsx` also invalidates `projects`, which `workspace/workspace-data.ts` owns; it reaches
that key through that feature's `useInvalidateWorkspace()`, whose set (`["projects"]`) is likewise
exactly what the call site invalidated inline. Neither key is duplicated here.

## Deviation from the data-access contract: a read that is not a hook

`findAssetByStoragePath` is exported as a plain `async (database, input)` function instead of a
`use<Thing>()` hook.

It is called from two places in `upload-file-dialog.tsx`: from the dialog's `close()` (deciding
whether an unfinished upload's file can be safely removed from storage before the dialog closes)
and from the upload mutation's `mutationFn` (deciding whether a retried submit already recorded this
upload's row). Both call sites branch on the result before performing a write; neither renders it.
This is exactly the shape [rule 2 of the contract](../../../../docs/architecture/data-access.md)
names — the same `select` a hook would use on render is a plain function when a mutation (or a
handler that guards a close) branches on it instead — so no restructuring turns it into a hook. The
reason is also recorded above the function in `asset-data.ts`.

## Test files

`asset-data.test.tsx` holds the regression tests for `initialUploadProject`, the shared-design type
and the preview signing; `file-card.test.tsx` covers the card. The five functions relocated in this migration are tested in
`asset-data-writes.test.ts` instead, kept separate so the existing file's diff stays empty.
