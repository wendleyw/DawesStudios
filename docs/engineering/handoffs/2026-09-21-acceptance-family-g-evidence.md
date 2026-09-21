# Acceptance family G — measurement pass (G01–G14)

- Updated at: 2026-09-21T18:05:00Z
- Reporting agent and tool: Claude Opus 5 (1M context) / Claude Code
- State: **verified** — measurement complete, evidence written, matrix rows updated, one defect and
  one dataset finding recorded and left unrepaired by instruction
- Objective: produce the evidence each of the twelve open rows of family G
  ([the acceptance matrix](../../architecture/acceptance-matrix.md), section G) requires, against
  the running container, changing no application code
- Owned paths: `docs/verification/acceptance-family-g.md`,
  `docs/verification/screenshots/family-g-*.png`, the G rows of
  `docs/architecture/acceptance-matrix.md`, this report
- Dependencies: the container on `http://localhost:3003` (not rebuilt, restarted or stopped); the
  local Docker Supabase stack (read and fixture writes only, never reset);
  `apps/web/tests/e2e/test-support.ts`, `intake-fixture.ts` and `project-fixture.ts` (read-only);
  `apps/web/features/projects/**` (read-only — a concurrent session owns writes there)
- Acceptance criteria: each row either Verified with the evidence it names, or left open with a
  stated reason; the dataset returns to 10 clients / 25 projects; the throwaway probe is deleted so
  `npm run check` is not broken for anyone

## Completed work and changed files

| File | Change |
| --- | --- |
| `docs/verification/acceptance-family-g.md` | New. One section per row with the scenario, the measured result and a verdict; a "what the existing specs already proved" table; one defect and three finding/observation sections; dataset-integrity and image-provenance tables |
| `docs/architecture/acceptance-matrix.md` | The twelve open G rows' evidence and status cells only — G01, G02, G04, G05, G06, G07, G09, G10, G11, G12, G13, G14, all now `Verified — 2026-09-21`. G03 and G08 were already Verified and were not touched, and no other line changed (diff: 12 insertions, 12 deletions) |
| `docs/verification/screenshots/family-g-photography-reference-dead-end.png` | New artefact for Defect G-1 |

Created and **deleted** before returning: `apps/web/tests/e2e/evidence-probe-family-g.spec.ts`
(seven tests). No existing spec, application file, CSS, data module or migration was modified.
`brand-accessibility.spec.ts` rewrites three committed screenshots on every run
(`brand-asset-dialog-mobile.png`, `brand-draft-desktop.png`, `brand-draft-mobile.png`); all three
were restored to their committed bytes.

## Decisions and interface changes

No interface changes. Four decisions worth recording:

1. **Every canonical write was checked by re-reading the stored value, not by its status code.**
   `brand_sections`, `template_drafts` and `project_assets` carry column-level `UPDATE` grants, so a
   forbidden update is filtered by RLS row matching and PostgREST answers success with zero rows.
   `INSERT` does return `42501`, because `WITH CHECK` runs on the new row. Recorded as
   Observation G-3, the same trap family F recorded as F-4.
2. **Draft privacy was tested in both directions, at the API and not at the page.**
   `brand-accessibility.spec.ts` checks the draft *page*, which filters by `owner_id` in its own
   query and therefore cannot distinguish a policy refusal from a client-side filter. This pass
   queried `template_drafts` directly as four other accounts against the agency's draft **and** as
   the agency against a client's seeded draft. `drafts_owner` is `owner_id = auth.uid()` with no
   `is_agency()` escape, and every one of those fifteen attempts returned zero rows with the stored
   row unchanged.
3. **The client's exclusion from working files was proven in the payload.** `useProjectAssets`
   simply does not query `project_assets` for a client, so the rendered page proves nothing. The
   evidence is a direct query as the client (`project_assets` unfiltered: 0 rows), the storage
   download and signed URL both refused, and the entitled `published_designs` present in the same
   session.
4. **Defect G-1 was recorded without softening G06.** G06 asserts reference detail, Use/Avoid
   direction and persisted edits — all three hold and were measured on the rendered page after a
   reload. The broken *destination* of the `Explore reference files` link is a separate defect in
   the canonical dataset, filed on its own with reproduction steps rather than folded into the row.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `git diff 6bc6228 HEAD -- apps/web` (image provenance) | 2026-09-21T16:50Z | Ten files, all under `features/board`, `features/projects`, `features/reviews`; nothing under `features/brand`, `features/assets`, `features/briefings`, `app/` or `supabase/` | Record header |
| `npx playwright test brand-guidance.spec.ts brand-accessibility.spec.ts brand-canvas-final.spec.ts evidence-probe-family-g.spec.ts` | container `2026-09-21T12:30:41Z`, 2026-09-21T17:35Z | **16 passed (45.8 s)** | "What the existing specs already proved" plus every row section |
| Probe test 1 — G01, G11 (three roles × ten sections, six write refusals, storage isolation) | same | pass | G01, G11 |
| Probe test 2 — G02 (save → reload → briefing reuse → client isolation) | same | pass | G02 |
| Probe test 3 — G04, G05, G06, G07 | same | pass | G04–G07 |
| Probe test 4 — G09, G10 (seven definitions, resume, 15 cross-account refusals, recovery) | same | pass | G09, G10 |
| Probe test 5 — G12 (26 fragment comparisons, clipboard failure, network hosts) | same | pass | G12 |
| Probe test 6 — G13 (two-role upload, client and unassigned-designer payloads) | same | pass | G13 |
| Probe test 7 — G14 (SVG, two rejected types, interrupted upload) | same | pass | G14 |
| Probe test 8 — addenda (Defect G-1 across ten clients, client payload sweep, brand storage isolation) | same | pass | Defect G-1, G13 |
| Twenty-one-table, `auth.users` and two-bucket count, immediately before and after the full run | `supabase_db_dawes-studios` | identical on both sides: clients 10, projects 25, campaigns 12, briefings 30, design_versions 44, designs 47, notifications 15, brand_sections 80, brand_assets 70, brand_templates 70, template_drafts 10, project_assets 0, published_designs 22, published_versions 18, delivery_files 1, publication_reviews 18, credit_ledger 36, internal_comments 22, client_comments 57, project_assignments 25, deliverables 30, auth.users 13, storage `internal-assets` 27, `brand-assets` 70 | "Dataset integrity" |
| Seed uniformity query (`count(distinct content)` per section over ten clients) | `supabase_db_dawes-studios` | `colors`, `logos`, `messaging`, `products`, `typography`, `visual-style` = **1** distinct payload each; `overview`, `ai` = 10; `brand_assets` holds 7 distinct names across 70 rows | Finding G-2 |
| `npm run format:check` (apps/web) after deleting the probe | 2026-09-21T18:00Z | `All matched files use Prettier code style!` | — |

Not run: `npm run check` in full, `npm run test`, and any browser check outside the eight probe
tests and the three existing brand specs. Docker was not touched; the container was not rebuilt or
restarted, and no dev server was started — every measurement is against `http://localhost:3003`.

## Remaining risks and next action

- **Defect G-1 (Medium) is unrepaired**, by instruction. Visual style's `Explore reference files`
  links to `/brand/assets?category=Photography`, and the canonical dataset contains **zero**
  `Photography` assets for any of the ten clients (only `Document` 10, `Logo` 30, `Product` 30), so
  the link renders `No matching assets.` for every client. It is a dataset defect rather than a
  component defect and therefore also bears on **B07**, which this pass does not own. The fix is
  either a seeded photography reference per client or dropping the pre-filter — a data and product
  decision for the orchestrator.
- **Finding G-2 (Low for G01, material for the dataset):** six of the eight editable brand sections
  are byte-identical across all ten clients, and the 70 brand assets carry only seven distinct
  names. G01's "client-correct content" is verified, but its discriminating power rests on
  `overview.name` and `overview.description` alone. This sits against the root requirement for
  realistic related data and against B07.
- **Observation G-3:** a refused `UPDATE` answers with success and zero rows, so any future pass
  reading only the status code will record a false "ALLOWED".
- **Observation G-4:** every `CopyButton` keeps a closed `<dialog>` in the DOM, so an unscoped
  `getByLabel("Text to copy")` resolves to all of them at once. Not a defect (native `<dialog>` is
  `display: none` and axe reports no violations); recorded so the next author scopes to
  `dialog[open]`.
- **Image provenance:** the container was built from `6bc6228`, three web commits behind head, but
  none of the later source changes touch this family's surface. A future pass measuring families
  D or F should rebuild first.
- Next concrete action for the orchestrator: decide whether Defect G-1 and Finding G-2 are fixed in
  the seed now or logged against B07, and assign an owner; family G itself needs no further
  measurement.

## Ownership at handoff

All paths above are released. No process, worker or browser context from this task is still running;
the probe spec is deleted and `apps/web/tests/e2e/` holds only its thirteen committed files. The two
untracked files under `docs/superpowers/` belong to another session and were neither staged nor
touched. Intended recipient: the orchestrator.
