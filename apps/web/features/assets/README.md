# Assets (Brand Hub → Deliverables)

The Brand Hub's **Deliverables** section (route id `files`, so every existing
`/brand/files?project=` link and notification keeps working) shares the Brand Hub title card: the
agency's **Delivery file** action sits top right of that card (`shared/header-actions.tsx`), and
search plus, in a campaign, a project `<select>` form one `.hub-toolbar` row below it. Results —
campaign folders, or a campaign's deliverables in one card per project — follow.

Work in progress lives in Miro, so this section lists final delivery files (`delivery_files`) only:
no working files, no All files/Approved toggle (every deliverable is approved) and no design copies.
Deliverables at `/clients/:clientId/brand/files` (the old `/clients/:clientId/assets` redirects there, keeping its query)
are grouped into campaign folders rather than one flat grid (a client
the size of SABRE's demo overlay runs to 167 files across 50 projects in 11 campaigns). The default
view (no `campaign` param) shows one folder card per campaign with at least one matching file,
newest file first; projects with no readable campaign share a "No campaign" folder that always
sorts last, at `?campaign=none`. Opening a folder (`?campaign=<id>`), or a project's own Files link
(`?project=<id>`, which opens that project's campaign with the project filter preset), shows that
campaign's files grouped by project, newest file first within each group; an unknown `campaign`
falls back to the folder view. The agency adds a delivery file to an approved, Active project and
marks it delivered from either view.

`delivery-file-dialog.tsx` is the one upload dialog. Beside the file it holds the project's
**Google Drive backup**: the project's `client`-channel Drive folder (`project_drive_links`), shown
prefilled and saved through `setProjectDriveLink` before the file is sent, since saving the link
again is harmless while the file is sent once. `parseDriveUrl` refuses anything but
`https://drive.google.com/…` before any request. Each project group then shows a labelled **Google
Drive backup** link.

`asset-data.ts` owns every Supabase read and write for the feature, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useProjectAssets`
is the page's single read hook; its `projects` read also carries each project's `campaign_id` and
campaign title via a `campaigns(id,title)` embed — the FK from `projects` to `campaigns` is
unambiguous, and every role may read campaigns (`campaigns_read` on `private.can_access_client`), so
this needs no second query or role branch. `markProjectDelivered` is the feature's one write.
The hook pages projects and each file/link table in 500-row requests, then reads related rows in
100-project ID groups. Project IDs and file creation time have stable ordering across pages, and
only client-channel Drive links are requested.

Each file is a `FileCard` (`file-card.tsx`). A raster image (PNG, JPEG, WebP, GIF) shows its own
preview: `useAssetPreviews` signs every image in the list, in at most 100 paths per `createSignedUrls` request,
for ten minutes, the board thumbnails' revocation window, and the page signs the whole list rather
than the filtered one so filtering never re-signs. Every file in the list already came through the
viewer's role-scoped read, so a client is only ever signed deliveries. Any other file shows an
icon and its real type from `fileTypeLabel` ("PDF", "MP4", "Word", or "File"). Designs live in
Miro, so the list has no design copies: the former shared-designs source (`published_designs`) is
no longer read. Cards in a row share a height and their footers line up.
`FileCard` does not render its own project link — the campaign view's project group heading, which
every `.file-grid` of cards sits under, carries that link instead, plus a **Google Drive backup**
link (`shared/drive-icon.tsx`'s `DriveIcon`, `target="_blank" rel="noopener noreferrer"`) once the
agency has set the project's `client`-channel Drive link, in the delivery dialog or its Details.
Deliverables is the client-facing delivery surface, so this is always the client link, never the internal
one: a designer's own read of `project_drive_links` only ever returns
their `internal` row, so this icon does not appear for them regardless.

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
  from the given project list resolves to an empty title rather than throwing. Each group also
  carries that project's `driveUrl` (null when it is unknown or has none), read from
  `asset-data.ts`'s `AssetProject.driveUrl` — the project's `client`-channel row from
  `project_drive_links`, read separately from the explicit `projects` column list, never the
  `internal` row.
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
[rule 5 of the contract](../../../../docs/architecture/data-access.md) sets for one:
`assets-page.tsx`'s deliver mutation already invalidated the whole set, because the whole set is a
single key. The delivery dialog writes a project's Drive link too, so it refreshes through
`projects/project-data.ts`'s `useInvalidateProject()`, whose set includes `assets` and
`project-drive-links`, like every other project write.

`assets-page.tsx` also invalidates `projects`, which `workspace/workspace-data.ts` owns; it reaches
that key through that feature's `useInvalidateWorkspace()`, whose set (`["projects"]`) is likewise
exactly what the call site invalidated inline. Neither key is duplicated here.

## Test files

`asset-data.test.tsx` holds the regression tests for `initialUploadProject`, the delivery read
(`useProjectAssets`) and the preview signing; `file-card.test.tsx` covers the card and
`asset-data-writes.test.ts` covers `markProjectDelivered`. `file-groups.test.ts` covers campaign
grouping and ordering, "No campaign" always sorting last, counts and cover choice under a filter,
project grouping, and resolving the view from `campaign`/`project` params, including unknown ids. In
the browser, `tests/e2e/files-campaigns.spec.ts` checks both views for the studio and a client
against counts read through each role's own session, the Back button and back arrow, `?project=`
links, unknown campaigns, axe, and that a campaign opened from far down the phone folder list starts
at its title. `tests/e2e/deliverables.spec.ts` adds a deliverable with a Drive backup on a
disposable approved project, rejects a non-Drive link, downloads the file, reads the saved
`client` Drive row and checks a designer gets no upload action.

Delivery preparation and Complete delivery are unavailable for Backlog projects. The database
rechecks Active activity, the latest approved client version and real final files under the project
lock. Prepare delivery in the project action bar navigates to the filtered Deliverables page, and a
delivered project's Miro bar links there with **Deliverable**.
