# Projects

The project workspace lives at `/projects/:projectId`. It shows one project as a canvas of
deliverables and their versions, opens a single design in a viewer, and carries the two comment
channels that keep the studio conversation separate from the client one. The channel is not a
browser filter: an agency session chooses between working files and the shared client view, a
designer session is always internal, and a client session is always the client channel, with
Supabase policies rather than the interface deciding what each one may read.

`project-data.ts` owns every Supabase read and write for the feature, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useProjectDetail`
reads the internal `design_versions`/`designs` tables or the published `published_versions`/
`published_designs` snapshot according to that channel, so a client channel never names an internal
table. `useProjectComments` reads `internal_comments` or `client_comments` for the same reason, and
labels internal authors as the signed-in person or "Studio team" rather than exposing designer
identity. `projectQueryKeys` lists the four keys every project write invalidates; `assignments` and
`asset-url` are deliberately outside that set, because the assignment panel refetches its own read
and a signed URL expires on its own schedule.

`canvas-layout.ts` computes the canvas geometry from the deliverables and their version counts, so
the canvas lands in its final shape on first paint instead of being measured after render.
`project-nodes.tsx` holds what the canvas draws and `project-canvas-view.tsx` places the opening
view once the pane knows its width. `project-events.ts` subscribes to the Postgres changes each role
is allowed to see and polls while the socket is down, so a dropped connection degrades instead of
silently freezing the canvas.

`artwork-files.ts` owns an uploaded design artwork's whole lifecycle: `sanitizeArtwork` re-encodes
the image and enforces the type, size and megapixel limits, `uploadArtwork` stores it under an
opaque `<project UUID>/<random UUID>.png` path in the private `internal-assets` bucket, and
`discardUnreferencedArtwork` removes an upload the dialog never attached to a design — but only
after checking that no `designs` row points at it, so a retried submit does not delete the file the
stored design now uses. The signed URL that displays a stored artwork is a read and lives with the
other read hooks in `project-data.ts`. `media-client.ts` talks to the media service for publication
snapshots and delivery files; `comment-draft.ts` keeps an unsent comment and its pending pin.

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

## Deviation from the data-access contract: two reads that are not hooks

`findUnchangedDesign` and `findDesignByAsset` in `project-data.ts` are exported as plain
`async (database, input)` functions instead of `use<Thing>()` hooks.

Both are called from inside `mutation.mutationFn` in `project-action-dialog.tsx`
(`findUnchangedDesign` at `:99`, `findDesignByAsset` at `:113`), where React does not permit a hook
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

## Verification

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
