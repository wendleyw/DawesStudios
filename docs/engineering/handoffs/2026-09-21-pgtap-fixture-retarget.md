# pgTAP fixture retarget to the 25-project seed

- Updated at: 2026-09-21T04:15:44Z
- Reporting agent and tool: Delegated database-test worker / Claude Code
- State: verified
- Objective: make `npm run db:test` pass again by retargeting the pgTAP suite at the fixtures the current seed actually emits, without weakening any assertion and without changing the seed.
- Owned paths: `supabase/tests/database/access_and_workflows.test.sql`, `supabase/tests/database/production_integrity.test.sql`, `supabase/tests/database/trusted_media_and_catalog.test.sql`, and this report.
- Dependencies: the local Supabase stack already running and already seeded from the current `supabase/seed.sql`; `supabase/scripts/build_seed.py` as the authority on what each fixture label contains. Both were read only.
- Acceptance criteria: `npm run db:test` passes; every retargeted assertion still exercises the property it was written for; `npm run check` unchanged at 405 tests in 27 files; `supabase/seed.sql`, `supabase/scripts/**`, `supabase/migrations/**` and `apps/**` untouched.

## Completed work and changed files

Three test files were edited. Nothing else on disk was changed.

The seed no longer emits `project-15` or `project-16`. SABRE (client index 8, `client-org-8`,
customer `client-8`) stopped following the uniform two-projects-per-client pattern and now carries
seven projects keyed `dawes:project-sabre-<slug>`, so the dataset is 18 + 7 = 25 projects. The suite
still named the retired `-16` family. Twenty-eight assertion sites were retargeted and four
dataset-shape counts were corrected.

`build_seed.py` is the authority for every precondition claimed below. `emit_project` is shared by
the uniform nine-client baseline and by SABRE, so a project key means the same set of records in
both; what differs per project is the tuple in `SABRE_PROJECTS` or, for the uniform clients, the
index-derived values. `campaign-landing-page` is
`('campaign-landing-page', 'Campaign Landing Page', 'summer-safety', 'web', [('Desktop Layout','desktop')], 'client_review', '2026-09-18', '2026-09-24', 1, True)`
— SABRE index 2, so its designer is `uid('designer-' || (1 + 2 % 2))` = `designer-1`, its status
`client_review` makes `emit_project` write a publication, its review and its client pin, and its
trailing `True` makes it write a second internal version with one design.

### Retargeted assertions

| File and line | What the assertion proves | Old fixture | New fixture | Precondition verified before the swap |
| --- | --- | --- | --- | --- |
| `access_and_workflows.test.sql:7` | The fixture is the agreed deterministic baseline | count 20 | count 25 | `grep -c "insert into public.projects"` on `supabase/seed.sql` is 25; `build_seed.py` emits 18 uniform projects (indices 1–14, 17–20) plus the 7 entries of `SABRE_PROJECTS` |
| `access_and_workflows.test.sql:9` | Every project was paid for by exactly one debit | count 20 | count 25 | `emit_project` writes exactly one `credit_ledger` row with `kind='project_debit'` per project, so the debit count tracks the project count by construction |
| `access_and_workflows.test.sql:19` | A client's project list is scoped to its own workspace | count 2 | count 7 | `client-8` is the SABRE customer (`CLIENTS[7]`, `ci=8`), and SABRE's workspace is `SABRE_PROJECTS`, which has 7 entries and takes the `break` out of the uniform two-project loop |
| `access_and_workflows.test.sql:26` | A client sees its own publication and no cross-tenant one | `publication-16` | `publication-sabre-campaign-landing-page` | status `client_review` puts the project inside `emit_project`'s `status in ('client_review','changes_requested','approved')` branch, which inserts `published_versions` under `uid('publication-'||key)`; the project's `client_id` is `client-org-8`, the workspace `client-8` reads |
| `access_and_workflows.test.sql:32` | A client cannot post into the internal channel of a project it owns | `project-16` | `project-sabre-campaign-landing-page` | the project belongs to `client-org-8`, so `client-8` is a legitimate member — the rejection must come from the channel, not from tenancy |
| `access_and_workflows.test.sql:34` | A client cannot publish an internal version | `version-16-2` | `version-sabre-campaign-landing-page-2` | `extra_version=True` for this project, so `design_versions` holds a version 2 that exists and is genuinely publishable by the agency; the 42501 is the role check, not a missing row |
| `access_and_workflows.test.sql:38` | A client can post in its own client channel | `project-16` | `project-sabre-campaign-landing-page` | same tenancy as line 32; `post_comment` requires membership of the project's client, which `client-8` has |
| `access_and_workflows.test.sql:39` | Pin coordinates outside 0..1 are rejected by a check constraint | `project-16`, `publication-16`, `design-16-1-0` | `…-sabre-campaign-landing-page` family | the 23514 can only be reached after the tenancy and FK checks pass, so all three rows must exist and belong together: the publication is the project's, and `md5('published:'||<design uuid>)` is the id the seed gives the published copy of `design-…-1-0` (`designs_in_v1=1`, so index 0 exists) |
| `access_and_workflows.test.sql:40` | A half-specified pin is rejected | same | same | same |
| `access_and_workflows.test.sql:41` | A publication from another project cannot be pinned | `project-16` (target) | `project-sabre-campaign-landing-page` | the 23503 proves an FK rejection, so the *target* project must be readable by `client-8` while `publication-4` must not belong to it; `project-4` is `client-org-2`'s, and its status `client_review` (`states[3]`) means `publication-4` exists |
| `access_and_workflows.test.sql:46` | A designer sees exactly the projects assigned to it | count 10 | count 12 | `designer-{1 + pi % 2}` gives `designer-1` every even index: 2, 4, 6, 8, 10, 12, 14, 18, 20 among the uniform projects (15 and 16 no longer exist) and SABRE indices 2, 4, 6 — nine plus three |
| `access_and_workflows.test.sql:51` | A designer cannot post in the client channel | `project-16` | `project-sabre-campaign-landing-page` | `designer-1` is the assigned designer of this project, so the rejection proves the channel boundary rather than a missing assignment |
| `access_and_workflows.test.sql:52` | A designer cannot publish | `version-16-2` | `version-sabre-campaign-landing-page-2` | version 2 exists (`extra_version=True`) and belongs to a project `designer-1` is assigned to |
| `access_and_workflows.test.sql:54` | The assigned designer *can* comment internally | `project-16` | `project-sabre-campaign-landing-page` | SABRE index 2 is even, so `emit_project` received `designer-1`; `project_assignments` carries that row |
| `access_and_workflows.test.sql:68` | The agency can still revise an internal design after publication | `design-16-1-0` | `design-sabre-campaign-landing-page-1-0` | `designs_in_v1=1` means index 0 is the only V1 design and it exists; it was published, which is what makes the revision interesting |
| `access_and_workflows.test.sql:69` | The client snapshot does not follow that revision | `design-16-1-0` | `design-sabre-campaign-landing-page-1-0` | the seed inserts the snapshot as `md5('published:'||id::text)::uuid` selected from the V1 designs, so the published row exists under the derived id and carries the pre-edit headline |
| `access_and_workflows.test.sql:71` | The agency can publish the next internal version | `version-16-2` | `version-sabre-campaign-landing-page-2` | `publish_version` needs a version with at least one design and a project that is not `delivered`; version 2 carries `design-…-2-0` and the project is `client_review` |
| `access_and_workflows.test.sql:72` | Publishing twice returns the same snapshot, numbered 2 | `version-16-2`, `deliverable-16` | `…-sabre-campaign-landing-page-2`, `deliverable-sabre-campaign-landing-page` | this project has a single deliverable (`SABRE_PROJECTS` lists one, and no adaptation is added), and its publication v1 already exists, so `max(version_number)+1` is exactly 2 on that deliverable |
| `production_integrity.test.sql:7` | An explicit submit-attempt key is accepted | `version-16-2` | `version-sabre-campaign-landing-page-2` | as line 71 above: a real, unpublished second internal version on a non-delivered project |
| `production_integrity.test.sql:8` | The same key returns the original snapshot | same | same | same |
| `production_integrity.test.sql:9` | The same key with a different release note conflicts | same | same | same |
| `production_integrity.test.sql:10` | A fresh key makes a new snapshot of the same version | same | same | same |
| `production_integrity.test.sql:11` | Separate attempts are separate immutable snapshots | same | same | same |
| `production_integrity.test.sql:12` | Captures the newest snapshot of the project | `project-16`, `deliverable-16` | `…-sabre-campaign-landing-page` pair | the filter is project **and** deliverable; this project has exactly one deliverable, so `order by version_number desc limit 1` is unambiguous and picks the snapshot lines 7–11 just created |
| `production_integrity.test.sql:16` | A stale publication cannot be reviewed | `publication-16` | `publication-sabre-campaign-landing-page` | the seed publication is version 1 of that deliverable and lines 7–11 added higher-numbered ones, so it is genuinely superseded; its reviewer `client-8` owns the workspace |
| `trusted_media_and_catalog.test.sql:12` | The agency cannot upload publication bytes past the sanitizing worker | `project-16` path | `project-sabre-campaign-landing-page` path | the path prefix must name a project the agency can actually reach, otherwise the 42501 could come from an unresolvable scope instead of from the bucket policy; this project exists and the agency sees every client |
| `trusted_media_and_catalog.test.sql:13` | The same for delivery bytes | same | same | same |
| `trusted_media_and_catalog.test.sql:15` | Stages the storage object the later registration attests to | `project-16` path | `project-sabre-campaign-landing-page` path | `register_sanitized_asset` requires `private.storage_scope(path) = p_project_id`, so the first segment must be this project's id |
| `trusted_media_and_catalog.test.sql:16` | Gives the design an internal source to sanitize | `design-16-2-0` | `design-sabre-campaign-landing-page-2-0` | `extra_version=True` emits exactly one design on version 2, with `internal_asset_path` left null — which is what lets this line set it and makes the "must be regenerated" path meaningful |
| `trusted_media_and_catalog.test.sql:18` | An unregistered file cannot enter a client publication | `version-16-2`, `design-16-2-0`, `project-16` path | `…-sabre-campaign-landing-page` family | `publish_version` reaches the sanitized-asset check only after the version, its designs and the project all resolve and the path's first segment equals the project id; all three now hold, so the P0001 is the trust check |
| `trusted_media_and_catalog.test.sql:22` | The trusted worker can register a scoped regenerated object | same family | same family | `register_sanitized_asset` demands a design with `project_id = p_project_id` **and** `internal_asset_path = p_source_path`; line 16 sets that path from the row's own `project_id`, and the argument is built from the same project id, so the two agree |
| `trusted_media_and_catalog.test.sql:26` | The agency can publish the registered object | same family | same family | the sanitized row now exists with `prepared_by = agency` and `source_design_id`/`source_path` matching the design, which is exactly what `publish_version` re-checks |

### One assertion where the proposed mapping was rejected

`production_integrity.test.sql:30-42` — the assign/revoke block, ending in
`'Safe briefing projection respects assignment revocation'`, which asserts that
`get_assigned_briefings(<client>)` returns **zero** rows after the designer's assignment is revoked.

That is only true when the revoked project is the designer's *only* assignment inside that client.
It held for the old pair (`client-org-8` had projects 15 and 16; odd 15 went to `designer-2`, even 16
to `designer-1`). It does not hold for any SABRE project today: `designer-1` holds SABRE indices 2, 4
and 6, so revoking one leaves two and the projection would still return rows. Retargeting this block
to `campaign-landing-page` and relaxing the expectation to 2 would have kept the file green while
quietly retiring the property the assertion exists to prove.

The block was moved to `project-4` / `client-org-2` instead, which restores the original shape
exactly. Every uniform client holds two projects, the odd index going to `designer-2` and the even to
`designer-1`, so `client-org-2` is a client where `designer-1` has exactly one assignment —
`project-4`. The block's other preconditions also hold there: `designer-1` is already assigned
(needed by "Repeating an assignment does not notify twice"), and `project-4`'s status
`client_review` (`states[3]`) means it carries designs, so "Revoking an assignment removes design
access" is not vacuously zero. `project-4` is otherwise only read by `access_and_workflows.test.sql`
as a cross-tenant target, and the revocation happens inside a rolled-back transaction, so no other
assertion is affected.

### The plan count

`select plan(55)` was **not** changed; 55 is the real number and always was. The
`Bad plan. You planned 55 tests but ran 53` line was a symptom, not a second defect: line 72 calls
`public.publish_version(...)` bare inside `is()` rather than inside `lives_ok()`, so when the missing
`version-16-2` raised, the exception was not trapped, the transaction aborted, and tests 54 and 55
plus `finish()` never ran. The same mechanism explains `production_integrity.test.sql`'s
`No plan found in TAP output`: it uses `no_plan()`, which emits the plan from `finish()`, and its
line 8 is the same untrapped bare call, so the abort at line 8 removed the plan and the remaining
32 assertions. Both recovered on their own once the fixture resolved; the two files now report 55 and
33 tests.

## Decisions and interface changes

- `campaign-landing-page` was accepted as the stand-in for the retired `project-16` everywhere except
  the assign/revoke block, on the preconditions tabulated above rather than on the analogy: same
  client, same `client_review` status, a second internal version, and a publication.
- The mapping does not preserve `service_type` (`social` → `web`), the campaign, the deliverable count
  (2 → 1) or the V1 design count (2 → 1). No retargeted assertion turns on any of those. Line 8's
  `count(distinct service_type) = 20` is a whole-dataset property and is unaffected; line 72 benefits
  from the single deliverable rather than being harmed by it.
- No production code, migration, seed or generator was touched, so there is no interface change for
  any other worker.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run db:test` (before) | running local stack, macOS host, 2026-09-21 | FAIL — `access_and_workflows` 11 of 53 failed with a bad plan, `production_integrity` 1 of 1 with no plan, `trusted_media_and_catalog` 3 of 14 | terminal |
| `npm run db:test` (after) | same stack, same session | PASS — `Files=5, Tests=133`, all five files `ok`: `access_and_workflows` 55, `authorization_matrix` 13, `production_integrity` 33, `requests_and_storage` 18, `trusted_media_and_catalog` 14 | terminal |
| `npm run check` | macOS host, 2026-09-21 | PASS — typecheck, lint, Prettier, 405 tests in 27 files, unchanged | terminal |
| `git status --porcelain` | same | only the three test files modified; the two untracked `docs/superpowers/` files belong to another session and were left alone | terminal |
| Seed inspection (`build_seed.py`, `seed.sql`) | read-only | 25 `public.projects` inserts; `SABRE_PROJECTS` has 7 entries; `campaign-landing-page` is SABRE index 2 with `client_review`, `designs_in_v1=1`, `extra_version=True`, one deliverable | terminal |

The local stack was neither restarted, reset nor re-seeded, and Docker was not touched.

## Remaining risks and next action

- The dataset baseline is stated as "10 clients and 20 projects" in two live documents the
  orchestrator owns — `docs/engineering/handoff.md:56` and `docs/verification/claude-handoff.md:41` —
  while the current requirement and the current seed are 25. Those were outside this task's write
  scope and were left unchanged; the orchestrator should correct them. Historical reports under
  `docs/engineering/handoffs/` that quote 20 are evidence of their own moment and should stay as they
  are.
- These tests remain coupled to fixture labels, so the next reshaping of the seed will break them the
  same way. A shared SQL helper resolving a project by slug, or a generated fixture-id header, would
  make the coupling explicit. Not attempted here.
- The two bare `publish_version` calls inside `is()` (`access_and_workflows.test.sql:72`,
  `production_integrity.test.sql:8`) will keep turning any future failure into a whole-file abort that
  hides every later assertion. Wrapping the value comparison so the call is trapped would make the
  next regression legible. Left as is, because changing it now would alter what those two assertions
  execute.

## Ownership at handoff

All three test files and this report are released. No background process was started and no worker is
still writing. Returning to the orchestrator.
