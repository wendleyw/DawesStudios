# Board card version-aware thumbnail and badge data

- Updated at: 2026-09-20T18:45:00Z
- Reporting agent and tool: Board thumbnail worker / Claude Code
- State: implemented and tested (unit + database evidence); not verified in a running browser
- Objective: make the board card thumbnail version-aware and expose, per project, the signed artwork URL, the version that artwork belongs to, and a human deliverable type label — from one query and one batched signing call
- Owned paths: `apps/web/features/board/project-thumbnail.tsx`, `apps/web/features/board/project-thumbnail.test.ts`, and this report
- Dependencies: `public.deliverables`, `public.design_versions`, `public.designs`, `public.published_versions`, `public.published_designs`, the bundled format catalog exported as `formats` from `apps/web/features/briefings/briefing-model.ts`, and the private `internal-assets` / `published-assets` buckets
- Acceptance criteria: the badge never names a version the card is not showing; the internal and client channels are never mixed; `npm run check --prefix apps/web` passes

## Completed work and changed files

`apps/web/features/board/project-thumbnail.tsx` was rewritten. The board read used to order `designs`
by `created_at desc` and take the first artwork-bearing row with no join to `design_versions`, so the
card could not name what it was showing. It now reads `deliverables` as the leading table and embeds
the version and design rows of the one channel the viewer's role may see, then resolves the artwork,
its version and the deliverable's type label in a single pure pass.

`apps/web/features/board/project-thumbnail.test.ts` is new and covers the pure selection: the version
follows the artwork rather than the newest version, the type label survives when no artwork exists,
the leading deliverable is stable under row reordering, ties break deterministically, and each
channel's rows map into the same shape without crossing over.

The `ProjectThumbnail` component is unchanged, including its `src` prop, its `aria-hidden` band and
the `eslint-disable` comment that keeps expiring, caller-scoped signed URLs out of Next.js image
optimization.

## Decisions and interface changes

**Leading-deliverable rule.** A project can hold several deliverables, and `version_number` is unique
per deliverable, not per project, so "the newest version" is only meaningful inside one deliverable.
The leading deliverable is the lowest `sort_order`, ties broken by ascending `id`. In the seeded data
`sort_order = 0` is always the `original` and `sort_order = 1` the `adaptation`, so this is the
deliverable the briefing asked for first. The type label always comes from that deliverable, whether
or not any artwork exists; the artwork and its version are taken from that same deliverable, so the
badge's two halves describe one thing.

**Artwork and version are inseparable.** Within the leading deliverable the newest version that
actually carries artwork wins, and the badge names that version. Inside it, the first design by
`sort_order` then `id` is shown. If the signed URL cannot be produced, the version is dropped with
it, so a card never claims a version over an empty tile.

**Type label source.** `deliverables.format` is a foreign key into `public.format_catalog`, and the
same catalog ships with the app for the briefing flow, so the label costs no extra round trip. An id
the bundled copy has not caught up with is rendered as the raw id rather than dropped.

**Exported interface** (all from `apps/web/features/board/project-thumbnail.tsx`):

- `useProjectArtwork(projectIds: string[])` — React Query result whose `data` is
  `ProjectArtworkMap = Record<string, { url: string | null; version: number | null; typeLabel: string | null }>`.
- `artworkFor(map, projectId)` and `NO_ARTWORK` — read one card without spelling out the missing case.
- `selectProjectArtwork`, `formatTypeLabel`, `fromInternalRows`, `fromPublishedRows` — the pure parts.
- `useProjectThumbnails(projectIds)` — unchanged `Record<string, string>` shape, kept as a temporary
  compatibility shim so `board-page.tsx` and `board-nodes.tsx` keep compiling. It shares the same
  React Query key and query function as `useProjectArtwork`, so the board still issues one query and
  one `createSignedUrls` call no matter which hook is used. **Delete it once the board is wired to
  `useProjectArtwork`.**

**Interface requests for files this worker does not own:**

1. `apps/web/features/board/board-page.tsx:286,383` — switch to `useProjectArtwork` and pass the
   whole entry, e.g. `artwork: artworkFor(artwork.data, project.id)`.
2. `apps/web/features/board/board-nodes.tsx:51,156` — replace `thumbnail?: string` with the entry
   type, render `<ProjectThumbnail src={data.artwork.url ?? undefined} />`, and draw the badge next
   to it as `V{version} · {typeLabel}` when `version` is present, or the type label alone when it is
   not.
3. `apps/web/features/board/board.css` — the badge needs a style. The artwork band is
   `aria-hidden="true"`, so the badge must be a sibling of it, not a child, or its text leaves the
   accessibility tree.
4. `apps/web/README.md` and `docs/engineering/handoff.md` — record the leading-deliverable rule and
   the two-channel split. Not edited here because they are shared integration files.

**Badge width.** The card is 280 px wide (`CARD_W`), with a 1 px border and 20 px body padding on
each side, leaving a 238 px content band. Measured with the real Geist webfont through
`canvas.measureText`: at the card's 10 px badge size `V1 · Portrait Feed` is 76.3 px and the widest
catalog label, `V12 · Production Template`, is 117.2 px; at 11 px they are 83.9 px and 128.9 px. Even
with the existing badge padding (7 px each side plus borders) the worst case is about 133 px in a
238 px band. **`Portrait Feed` is not too long and no short form is needed.**

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check --prefix apps/web` | macOS, 2026-09-20 ~14:36 local | pass — typecheck clean, ESLint 0 errors (3 pre-existing warnings in `board-nodes.tsx` / `board-page.tsx`), Prettier clean, Vitest 222 tests in 11 files | terminal output |
| `npx vitest run features/board/project-thumbnail.test.ts` | same | pass — 14 tests | terminal output |
| Deliberate column typo in the embedded select, then `tsc --noEmit` | same | fails with `SelectQueryError<"column 'internal_asset_pathX' does not exist on 'designs'.">`, confirming the embed shape is type-checked against the generated schema rather than silently `any`; file restored afterwards | terminal output |
| `pg_policies` on `designs`, `design_versions`, `deliverables`, `published_designs`, `published_versions`, `format_catalog`, and `storage.objects` | local Supabase | policies quoted below; all five buckets are private | psql output |
| RLS probe as agency, assigned designer and SABRE client | local Supabase | agency 24 deliverables / 33 internal versions / 4 internal artwork / 14 published versions / 4 published artwork; designer 14 / 25 / 4 / **0** / **0**; client **0** / **0** internal, 3 deliverables / 2 published versions / 1 published artwork | psql output |
| The rule computed in SQL under each role | local Supabase | agency 20 cards, 4 with artwork+version, 20 with type label; designer 10 / 4 / 10; SABRE client 2 / 1 / 2 | psql output |
| The real PostgREST embedded query, both channels, re-reduced by the same rule | local Supabase REST | 24 deliverable rows → 20 projects, 4 with artwork+version, 20 with type label, in both channels — identical to the SQL result | scratchpad JSON |

Not run: the Playwright e2e suite (the orchestrator coordinates it) and any browser rendering of the
card, so the badge has not been seen on screen.

## Row level security, quoted

```
public.designs             designs_read            SELECT  private.can_produce(project_id)
public.design_versions     versions_read           SELECT  private.can_produce(project_id)
public.deliverables        deliverables_read       SELECT  private.can_access_project(project_id)
public.published_designs   published_designs_read  SELECT  private.can_client_channel(project_id)
public.published_versions  publications_read       SELECT  private.can_client_channel(project_id)
public.format_catalog      format_catalog_read     SELECT  true
storage.objects internal_storage_read   SELECT  bucket_id='internal-assets'  AND private.can_produce(private.storage_scope(name))
storage.objects published_storage_read  SELECT  bucket_id='published-assets' AND (private.is_agency()
                                                OR (private.can_client_channel(private.storage_scope(name))
                                                    AND EXISTS (SELECT 1 FROM published_designs WHERE asset_path = objects.name)))
```

`private.can_produce` is agency or a designer assigned to that project; `private.can_client_channel`
is agency or a member of that project's client. The two predicates do not overlap for a designer or
for a client, which is what makes the split enforceable rather than conventional. The client branch
of the query names only `published_versions` and `published_designs` and signs only in
`published-assets`; the internal branch names only `design_versions` and `designs` and signs only in
`internal-assets`. If the role were ever wrong, the failure is closed in both directions: a client
asking the internal branch reads zero rows (measured: 0 of 33 versions, 0 of 4 artwork rows) and
would be refused the bucket, and a designer asking the client branch reads zero published rows
(measured: 0 of 14 versions). Neither can surface the other channel's data.

## Measured coverage of the seeded baseline

The local database was reset by another process during this task. It now holds the deterministic
baseline of 20 projects (24 deliverables, 4 internal artwork designs, 4 published artwork designs);
the 21-project / 5-artwork state quoted in the task brief included e2e debris that the reset removed.

| View | Cards | Artwork | Version number | Type label |
| --- | --- | --- | --- | --- |
| Agency (internal channel) | 20 | 4 | 4 | 20 |
| Assigned designer `designer@dawes.local` (internal channel) | 10 | 4 | 4 | 10 |
| Client channel across all 20 leading deliverables | 20 | 4 | 4 | 20 |
| Client `sabre@client.dawes.local`, their own board | 2 | 1 | 1 | 2 |

All four artwork-bearing cards badge **V1**, while the leading deliverable's newest internal version
is **V2**. That is the point of the change: the previous code showed exactly the same four V1 images
but let the card imply they were current.

**What a card shows with no artwork — the majority case, 16 of 20 agency cards.** The band renders
its quiet placeholder tile with the image glyph, exactly as before; `url` and `version` are both
null, and only `typeLabel` is present, so the badge should read the type alone with no version. A
project with no readable deliverable at all has no entry in the map; `artworkFor` answers with
`NO_ARTWORK`, all three fields null, and the badge should not be drawn.

## Remaining risks and next action

- The board is still wired to the compatibility shim, so nothing on screen shows a version yet. The
  badge itself is unverified visually. Next action: the orchestrator wires `useProjectArtwork` into
  `board-page.tsx` and `board-nodes.tsx`, adds the badge style, and deletes `useProjectThumbnails`.
- If the leading deliverable has no artwork but a later adaptation does, the card shows no artwork.
  No project in the baseline is affected (every artwork row sits on the `sort_order = 0` deliverable),
  and the alternative — showing an adaptation's image under the original's name — is the same class
  of mismatch this change removes. Flagged for the orchestrator rather than decided unilaterally.
- The type label is resolved from the bundled catalog copy, which currently matches all 25 rows of
  `public.format_catalog`. A future format added only in the database would render as its raw id.
- `apps/web/README.md` and `docs/engineering/handoff.md` still need the rule recorded; both are
  shared integration files owned by the orchestrator.

## Ownership at handoff

`apps/web/features/board/project-thumbnail.tsx`, `apps/web/features/board/project-thumbnail.test.ts`
and this report are released to the orchestrator. No background processes were left running. The
local database was reset by another process mid-task; this worker only read from it.
