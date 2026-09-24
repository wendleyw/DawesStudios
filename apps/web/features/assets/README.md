# Assets

The Files page uses the shared floating client navigation/profile and white title/action card
on the plain page background. Search and the All files/Approved control always sit inside that
card; the campaign view adds a project `<select>` scoped to that campaign's own projects, which the
folder view omits since a folder spans every project in its campaign. Actual file results — campaign
folders, or a campaign's files grouped by project — remain below. The content uses the full
available width with the same desktop/mobile gutters as other client sections.

The files page at `/clients/:clientId/assets` lists working files, shared designs and delivery
files across a client's projects, grouped into campaign folders rather than one flat grid (a client
the size of SABRE's demo overlay runs to 167 files across 50 projects in 11 campaigns). The default
view (no `campaign` param) shows one folder card per campaign with at least one matching file,
newest file first; projects with no readable campaign share a "No campaign" folder that always
sorts last, at `?campaign=none`. Opening a folder (`?campaign=<id>`), or a project's own Files link
(`?project=<id>`, which opens that project's campaign with the project filter preset), shows that
campaign's files grouped by project, newest file first within each group; an unknown `campaign`
falls back to the folder view. The agency can upload a working file or a delivery file and mark an
approved project as delivered from either view, exactly as before this split.

`asset-data.ts` owns every Supabase read and write for the feature, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useProjectAssets`
is the page's single read hook; its `projects` read also carries each project's `campaign_id` and
campaign title via a `campaigns(id,title)` embed — the FK from `projects` to `campaigns` is
unambiguous, and every role may read campaigns (`campaigns_read` on `private.can_access_client`), so
this needs no second query or role branch. `findAssetByStoragePath`, `removeUnusedUpload`,
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
`FileCard` does not render its own project link — the campaign view's project group heading, which
every `.file-grid` of cards sits under, carries that link instead.

`file-download.ts` moved here from `features/shared/` in the small-features migration: it had
exactly one consumer, `assets-page.tsx`, and the shared layer's own rule is that a primitive belongs
in `shared/` only with two or more real consumers.

## Campaign folders and grouping: `file-groups.ts`

`file-groups.ts` holds every pure grouping, ordering and view-resolution rule the page needs — no
React, no Supabase, so `file-groups.test.ts` covers it without rendering anything. `asset-data.ts` is
the only module that reads Supabase and maps its snake_case rows onto the plain camelCase shapes
these functions take (`GroupableFile`, `GroupableProject`); nothing here imports from `asset-data.ts`.

- `buildCampaignFolders` — one folder per campaign holding at least one matching file, newest file
  first, "No campaign" (`NO_CAMPAIGN_ID`/`NO_CAMPAIGN_TITLE`) always last, each folder's file/project
  counts and its cover (the newest file that has a signed preview, or `null`).
- `groupFilesByProject` — a campaign's matching files grouped by project, newest file first within a
  group and across groups; a project with no matching file simply has no group; a `projectId` absent
  from the given project list resolves to an empty title rather than throwing.
- `campaignIdForProject` / `fileCounts` — the small pieces the two functions above share: which
  folder a project's files fall into (its own campaign, or "No campaign" when `campaign_id` is null
  _or_ the campaign did not come back readable), and a file list's counts.
- `resolveAssetsView` — what `?campaign=`/`?project=` resolve to: `?project=<id>` alone opens that
  project's own campaign with the project preset; an unknown `campaign` (not "none" and not held by
  any project) falls back to the folder view; a `project` unknown to the client, or one that does not
  belong to a `campaign` given alongside it, is dropped rather than trusted.
- `effectiveProjectFilter` — the project `<select>`'s actual value: an explicit choice the viewer
  made while looking at the current campaign, else that campaign's own URL-resolved default. A
  choice made under a campaign the viewer has since left is discarded, which is how the toolbar
  resets to "All projects" on a folder change without a `useEffect` — the stored `{ campaign,
project }` pair simply stops matching the newly resolved campaign on the next render.

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
`file-groups.test.ts` covers campaign grouping and ordering, "No campaign" always sorting last,
counts and cover choice under a filter, project grouping, and resolving the view from `campaign`/
`project` params, including unknown ids. In the browser, `tests/e2e/files-campaigns.spec.ts` checks
both views for the studio and a client against counts read through each role's own session, the
Back button and back arrow, `?project=` links, unknown campaigns, axe, and that a campaign opened
from far down the phone folder list starts at its title.
