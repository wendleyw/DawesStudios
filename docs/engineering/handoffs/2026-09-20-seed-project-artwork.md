# Seed project artwork for every started project

- Updated at: 2026-09-20T19:05:00Z
- Reporting agent and tool: Delegated seed-data agent / Claude Code
- State: verified (backend dataset and scripts); browser evidence not run and remains with the orchestrator
- Objective: give every seeded project real board artwork without changing any table's row count, keeping the agency/designer and client channels strictly separate
- Owned paths: `supabase/scripts/build_seed.py`, `supabase/scripts/provision_local_auth.py`, `supabase/scripts/verify_seed.py`, `supabase/seed.sql`, `supabase/fixtures.json`, this report
- Dependencies: local Docker Supabase on `127.0.0.1:55421`, `supabase/scripts/fixture_media.py` (read only), `docs/ref/00-guia/CATALOGO-DE-SERVICOS.json`
- Acceptance criteria: unchanged baseline of 10 clients / 20 projects / 12 notifications / 33 design versions / 38 designs / 10 campaigns / 23 briefings / 13 Auth users; every started project carries internal artwork; no design is published that the fixture did not already publish; `verify_seed.py` and `supabase test db` pass

## Completed work and changed files

`supabase/scripts/build_seed.py`

- Added `working_asset_path(project, design)` and `published_asset_path(project, design)`. Both derive the
  file name from the design id instead of the project index, so a project can hold several distinct
  images and both paths still start with the project id, which is what the
  `internal_design_asset_scope_valid` check constraint requires.
- Every design of version 1 of the leading deliverable now receives `internal_asset_path`. The previous
  `pi in (4,12,16,20) and di==0` special case is gone; nothing in the generator selects projects by
  index for artwork any more.
- `published_designs.asset_path` is now mapped per design id (`case id when <design> then <path> … end`)
  rather than one literal per project, because a published version can contain two designs and each one
  needs its own client-readable file. The insert still selects from `public.designs` so it keeps reusing
  `private.public_design_content` for sanitisation.
- `manifest['working_assets']` now carries one entry per design that has artwork, with `published_path`
  set to `null` for production work the fixture has not published. The `index` is a running card number,
  which `png_card` turns into a distinct accent colour, so the board reads as twenty different pieces of
  work rather than one image repeated. All 22 cards are byte-distinct and colour-distinct.

`supabase/scripts/provision_local_auth.py`

- Uploads the private working PNG for every manifest entry, and uploads plus registers the sanitized
  published copy only for entries that carry a `published_path`.
- Separate `working_count` and `publication_count` are reported, because they are no longer the same
  number and calling them "pairs" would now be false.

`supabase/scripts/verify_seed.py`

- New role-split coverage assertions: `internal_artwork == {projects past planning}` and
  `published_artwork == {projects with a publication}`.
- The download loop now checks the private bytes for every production file, refuses the client on every
  one of them (previously only on the four published ones), and checks the client copy only where the
  fixture actually published.
- `assert downloaded == 79` is replaced by named terms — `brand_files = 70`, `working_files = 22`,
  `publication_files = 15`, `delivery_files = 1` — each one asserted against the manifest before the
  total is asserted, so a drifting term fails where it is defined instead of as an unexplained total.
- Evidence gains `projects_with_internal_artwork` and `projects_with_published_artwork`.

`supabase/seed.sql` and `supabase/fixtures.json` were regenerated with
`python3 supabase/scripts/build_seed.py`; both are byte-identical on a second run.

Documentation corrected outside the owned set (both numbers were already stale at 59 while the real
figure was 79): `docs/operations/README.md` and `docs/architecture/backend.md` now state 108 fixture
files with the breakdown. `docs/architecture/acceptance-matrix.md` was not touched.

## Decisions and interface changes

**Three projects deliberately have no artwork.** Projects 1, 10 and 19 are `planned`. A planned project
has no `design_versions` and no `designs` rows at all, so giving it artwork would mean inserting rows and
breaking the fixed baseline. Their cards stay empty, which is the correct product statement: no work has
started. Every other project — 17 of 20 — now carries artwork. Acme, the client the product owner opened,
has project 1 (planned) and project 2 (in progress); project 2 now has a thumbnail, so the Acme board is
no longer empty for the agency and the assigned designer.

**The client sees fewer thumbnails than the agency, by design.** Nothing new was published. Publication
already existed for the 11 projects in `client_review`, `changes_requested` or `approved`, and only those
projects' designs received a `published_designs.asset_path`. The six started-but-unpublished projects
(2, 3, 8, 11, 15, 17) hold their artwork in `internal-assets` only. One consequence to state plainly:
**Acme still has zero client-visible artwork**, because Acme's studio has never published anything to
Acme. Nine of ten client boards now show at least one thumbnail; all ten agency/designer boards do.

**Later internal versions stay bare on purpose.** Version 2 and adaptation designs keep
`internal_asset_path = null`. That is both product-correct (an unpublished refinement is not what the card
should advertise) and load-bearing for the existing database suite: `production_integrity.test.sql` and
`access_and_workflows.test.sql` call `publish_version(version-16-2, …)` with an empty asset map, and
`publish_version` raises *"Prepare a sanitized publication asset for each uploaded design"* if any design
in the version has an internal path but no prepared object. Giving version 2 artwork would fail those
tests. The board picks the newest version that carries artwork, so every card resolves to V1.

**Consumers checked, none changed.** `apps/media/src/integration-test.js` takes the first design of the
first version of `fixtures.projects[1]` (project 2), patches its internal path and asserts one prepared
asset; project 2's version 1 still holds exactly one design, and the test's `finally` restores whatever
value it read. `supabase/tests/*` read the manifest only for ids. No end-to-end spec asserts on
thumbnails. Nothing under `apps/` or `supabase/migrations/` was modified.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `python3 supabase/scripts/build_seed.py` (before any edit) | local, 2026-09-20 | Output byte-identical to the on-disk `seed.sql` and `fixtures.json`, so the diff below is only this task's | terminal |
| Baseline table counts via `psql` in `supabase_db_dawes-studios` | local, before reset | clients 10, projects 20, notifications 12, design_versions 33, designs 38, campaigns 10, briefings 23, Auth users 13, storage objects 79 | terminal |
| `python3 supabase/scripts/build_seed.py` (after edit) | local | `Generated 10 clients and 20 projects` | terminal |
| Per-table `insert into` statement counts, old vs new `seed.sql` | local | All 26 tables identical; 662 statements before and after. No table moved | terminal |
| `python3 supabase/scripts/build_seed.py` run twice | local | Second run byte-identical — generator is deterministic | terminal |
| `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss` | local | `Provisioned 13 Auth accounts, 70 brand files, 22 internal working files, 15 published copies and the delivery fixture` | terminal |
| Table counts after reset, diffed against the baseline | local | Only `storage_objects` moved, 79 → 108. All 24 other tables identical | terminal |
| `python3 supabase/scripts/verify_seed.py` | local, after reset | PASS — 108 verified downloads, `projects_with_internal_artwork` 17, `projects_with_published_artwork` 11 | terminal |
| `npm run db:test` | local | `All tests successful. Files=5, Tests=133 … Result: PASS` | terminal |
| `python3 supabase/scripts/verify_seed.py` (re-run after `db:test`) | local | PASS, identical evidence — the suite left no residue | terminal |
| Eight-table baseline re-queried after `db:test` | local | clients 10, projects 20, notifications 12, design_versions 33, designs 38, campaigns 10, briefings 23, Auth users 13 | terminal |
| Artwork coverage query | local | 17/20 projects internal, 11/20 published, 3 planned projects with no designs, 22 designs internal, 15 published designs, 0 artwork on any non-V1 version | terminal |
| Storage objects per bucket | local | brand-assets 70, internal-assets 22, published-assets 15, delivery-files 1 | terminal |
| Leading-deliverable resolution query mirroring `selectProjectArtwork` | local | 17 internal cards and 11 client cards resolve to artwork — no project hides its artwork behind a non-leading deliverable | terminal |
| `png_card` distinctness for indices 1–22 | local | 22 distinct accent colours, 22 distinct byte strings; no published card contains `Author`, every internal card does | terminal |

Not run, deliberately: the Playwright browser suite (owned by the orchestrator),
`supabase/scripts/verify_local.py`, `supabase/tests/concurrent_workflows_test.py` and the media
integration suite.

## Remaining risks and next action

- Acme has no client-visible thumbnail and cannot get one without publishing work the fixture does not
  publish. If the product owner's complaint was about the *client* view of Acme rather than the agency
  view, the fix is a seed decision about which projects are published, not an artwork decision, and it
  belongs to the orchestrator.
- Three planned projects will always show an empty card under the fixed baseline. The web card's empty
  state is what a viewer sees there; whether that state reads well is a visual question for the UI owner.
- `docs/operations/backend-evidence.json` and `docs/operations/seed-evidence.json` still contain the
  earlier run's numbers. They are generated by `verify_local.py`, which was not run here, so they were
  left alone rather than hand-edited.
- Next concrete action for the orchestrator: re-run the browser board evidence against the reset stack
  and confirm the cards render the new artwork.

## Ownership at handoff

All five owned paths are released. No background process was left running by this task. The local stack
is up (API 55421, media 55430) with the regenerated fixture applied, and
`docs/operations/README.md` plus `docs/architecture/backend.md` carry one corrected sentence each;
the orchestrator should fold those two lines into its own documentation pass if it is editing them.
