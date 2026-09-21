# Audit fixes — J05 duplication (Medium + Low batch)

- Updated at: 2026-09-21T08:30:00Z
- Reporting agent and tool: Claude Sonnet 5 / Claude Code
- State: **implemented mostly by a previous agent, which stalled for ten minutes with no failure in
  its own work (last message: "M8 confirmed dead on two counts. Deleting it, and doing M9.").
  Verified and landed by this agent.** M1–M8 below are the previous agent's work, verified correct
  and unmodified except the four files it had left unformatted. M9 was found already fixed on `main`
  in a prior commit. L2, L3, L5, L6, L7, L8, L9 were implemented by this agent. L1 and L4 are
  deferred per the orchestrator's own instruction and are not touched.
- Objective: land `docs/verification/audit-j05-duplication.md`'s Medium and Low findings without
  changing behaviour, preserving the five-ceiling correction to M1 (`BUCKET_MAX_BYTES` 50 MB /
  `ARTWORK_MAX_BYTES` 25 MB, kept separate).
- Owned paths: all files listed in "Changed files" below, this report.
- Dependencies: `docs/verification/audit-j05-duplication.md`; `supabase/migrations/202609200003_storage.sql`,
  `202609200004_requests_and_attachments.sql`, `202609200008_trusted_media.sql` (read-only, not
  touched); local Docker Supabase (read-only REST queries only, not restarted).
- Acceptance criteria: `npm run check` passes; no behaviour change except L6's deliberate viewport-gap
  fix; no existing test file modified; 10 clients / 25 projects intact.

## Findings — one row each

| Finding | What was duplicated | What was done | Evidence consumers wanted the same behaviour |
| --- | --- | --- | --- |
| M1 | Upload MIME map + size ceiling, declared 4× in TS + once in Postgres | `features/shared/upload-rules.ts` (new): `uploadExtensions` vocabulary, `standardUploadMimes`/`brandUploadMimes`, `BUCKET_MAX_BYTES` (50 MB), message builders. All 4 consumers (`upload-file-dialog.tsx`, `briefing-attachments.tsx`, `brand-model.ts`, `media-client.ts`) now import it | Three sites emitted the byte-identical MIME map in the same order; two shared the identical rejection string |
| — five-ceiling correction | The audit found 4 declarations; there is a genuine 5th | `ARTWORK_MAX_BYTES` (25 MB) kept as a **separate** constant, not folded into `BUCKET_MAX_BYTES`. `artwork-files.ts`'s comment explains why: `sanitizeArtwork`'s 40-megapixel guard runs only after `createImageBitmap` has already allocated the bitmap, so the byte ceiling is the only guard in front of the decode | N/A — deliberate variety, preserved |
| M2 | Version-row normalisation (note/date/status) written twice | `features/shared/version-row.ts` (new): `VersionRow` union + `versionNote`/`versionDate`/`versionStatus`. Consumed by `project-data.ts` and `review-data.ts` | Both modules used term-for-term identical `"x" in version ? … : …` expressions, including the same `?? "pending"` fallback |
| M3 | "Save blob to disk" written 4×, 3 filename-sanitisation rules (one missing it entirely) | `features/shared/save-blob.ts` (new): `saveBlob(blob, filename, { revokeAfterMs })` + `safeFilename`. All 4 consumers (`file-download.ts`, `brand-assets.tsx`, `briefing-attachments.tsx`, `credits-page.tsx`) converged; briefing attachments now get sanitisation they previously lacked | Identical 5-step `createObjectURL → anchor → click → revoke` sequence at all 4 sites |
| M4 | `decodeBriefing`/`decodeAssignedBriefing`, byte-identical bodies | One `decodeBriefing(row: BriefingRow)` over a union type; `decodeAssignedBriefing` deleted, its one call site in `briefing-data.ts` updated | Bodies were character-for-character identical |
| M5 | `review-data.ts` mapped `design_versions` → `ReviewRow` twice in one function | Local `toReviewRow(version, overrides)` closure | 5 of 8 fields identical incl. the non-obvious `title`/`deliverable` lookups with the same fallback strings |
| M6 | Two comment tables mapped to `CanvasComment`, 7 of 8 fields identical | Local `toCanvasComment(comment, label)`; the two label rules (client vs. internal, the channel-leak boundary) stay separate at their call sites | 7 fields identical in order and expression |
| M7 | `delivery_files`/`project_assets` mapped to `ProjectAsset` by identical expressions | `fromStoredFile(file, bucket, category, approved)`; the genuinely different `published_designs` block left alone | Same 7 column names, identical map bodies differing only in 3 literals |
| M8 | `project-details.tsx` re-threw a conflict message `project-data.ts` already produces, in a dead branch | Conditional deleted; renders `save.error.message` directly. Confirmed dead: `updateProjectDetails` already converts PGRST116 before returning, so `.message` never contains `"0 rows"` | Byte-identical string at both sites; comment in `project-data.ts` states the message travels with the query |
| M9 | Briefing status via `replaceAll("_", " ")` in search vs. `briefingStatusLabels` | **Already fixed on `main`** (commit `ec422c7`), which also introduced `versionStatusLabels` for the version-status enum. `workspace-data.ts:269` reads `briefingStatusLabels[item.status]`; no `replaceAll` remains on the briefing path | (pre-existing fix, re-verified here) |
| L2 | `[25, 50, 100]` written twice in `credit-actions.tsx` | Module-level `CREDIT_PACKAGES` const, used by both the button row and the validation check | Same literal, 39 lines apart, one rendering and one validating |
| L3 | `projectHref` claims to be the only place that builds `/projects/${id}`; `board-page.tsx` inlined it in the same file that imports it | Fixed the one inline use to call `projectHref`; softened the docstring to state honestly that other features build the path literally rather than cross the feature boundary for one template literal | `board-page.tsx` imported and used `projectHref` elsewhere yet inlined the same literal once |
| L5 | Briefings tabs restated 2 of 4 `briefingStatusLabels` entries as literal strings | `["draft", briefingStatusLabels.draft]`, `["accepted", briefingStatusLabels.accepted]`; the grouped third tab (`awaiting_review` + `budget_confirmed`) keeps its own label, as the audit specified | Tab labels were exact string matches of the record's values |
| L6 | Two notification bells both visible in the 900–901px gap (fractional widths) | Split `.page-bell`'s `display: none` into its own `@media (max-width: 900.98px)` block in `globals.css`, leaving the rest of the `max-width: 900px` block untouched; the shell's topbar bell still hides at `min-width: 901px` | Complementary integer-only breakpoints left a real fractional-width gap |
| L7 | "Needs attention" status set (`client_review`/`internal_review`/`changes_requested`) expressed twice on `home-page.tsx` | Single `needsAttentionStatuses` const (kept in display order) drives both the `reviewProjects` filter and the three tile entries via `.map` | Comment at the site already states the invariant ("its parts sum to the badge") that only holds if both lists agree |
| L8 | `canvas-layout.ts`'s `canvasFit` docstring described a duplicate that the shared `canvas-fit.ts` extraction had already resolved | Rewrote the paragraph to describe the real difference (`MIN_FIT_ZOOM`, `constrainHeight: false`) instead of claiming an outstanding duplicate | Documentation only; `fitToContent` was already shared by both `canvasFit` and `boardFit` |
| L9 | `["approved", "reviewed"]` written 3× in `reviews-page.tsx` | Local `isFinished(status)` helper, used at the filter, its negation, and the icon choice | All 3 uses must agree or a row shows "Approved" beside the wrong icon |

## Deferred, per the orchestrator's own instruction — not touched

- **L1** (credits page's two tabs render the same records with one cell differing) — consolidating
  would drop the campaign-attribution column the report tab and the CSV export both depend on.
  Needs its own design (a `Campaign` column on one table), not a mechanical extraction.
- **L4** (`client.initials || client.name.slice(0, 2)` in 3 places, one of which is `ClientMark`) —
  `ClientMark` also resolves a signed logo URL per client via `useClientLogo`; folding the other two
  sites into it would fire one query+signed-URL pair per client in a list (10 on the seeded
  baseline). Left as a separate design question with a real cost attached.

## Checks actually executed

| Command / scenario | Result |
| --- | --- |
| `npx prettier --write` on the 4 flagged files, then re-checked | Clean; `format:check` now passes |
| `npm run check` (typecheck + lint + format:check + test) | **All green.** 430 tests / 30 files (420/29 baseline + `upload-rules.test.ts`'s 10 new tests across its describe blocks). Lint: 0 errors, the same 2 pre-existing warnings in `features/board/` (`board-canvas-controls.tsx` exhaustive-deps, `board-nodes.tsx` unused `ArrowLeft`) |
| `upload-rules.test.ts` genuinely pins the constants | **Yes.** It `readFileSync`s the actual migration SQL and regex-parses `file_size_limit` / `file_size … check(… between 1 and N)` / `allowed_mime_types` out of it, then asserts those parsed values equal `BUCKET_MAX_BYTES` and the two MIME arrays — it does not hold a copied literal. It does **not** read `ARTWORK_MAX_BYTES` from anywhere; that constant is only asserted `< BUCKET_MAX_BYTES`, which is correct since no migration constrains it (it's a client-only guard) |
| Read-only REST count query against the running local Supabase (`http://127.0.0.1:55421/rest/v1/clients` / `.../projects`, service-role key from `supabase/.env.local`) | **10 clients, 25 projects.** Docker was not restarted, stopped, or rebuilt; the container at `localhost:3003` was not touched |

## Ownership at handoff

All files below are ready to commit; `docs/superpowers/plans/2026-09-20-studio-team.md` and
`docs/superpowers/specs/2026-09-20-studio-team-design.md` (untracked, owned by a concurrent session)
were left alone and not staged.

### Changed files

`apps/web/app/globals.css`, `apps/web/features/assets/asset-data.ts`,
`apps/web/features/assets/file-download.ts`, `apps/web/features/assets/upload-file-dialog.tsx`,
`apps/web/features/board/board-page.tsx`, `apps/web/features/board/project-open.ts`,
`apps/web/features/brand/brand-asset-upload.tsx`, `apps/web/features/brand/brand-assets.tsx`,
`apps/web/features/brand/brand-model.ts`, `apps/web/features/briefings/briefing-attachments.tsx`,
`apps/web/features/briefings/briefing-data.ts`, `apps/web/features/briefings/briefing-model.ts`,
`apps/web/features/briefings/briefings-page.tsx`, `apps/web/features/credits/credit-actions.tsx`,
`apps/web/features/credits/credits-page.tsx`, `apps/web/features/projects/artwork-files.ts`,
`apps/web/features/projects/canvas-layout.ts`, `apps/web/features/projects/media-client.ts`,
`apps/web/features/projects/project-action-dialog.tsx`, `apps/web/features/projects/project-data.ts`,
`apps/web/features/projects/project-details.tsx`, `apps/web/features/reviews/review-data.ts`,
`apps/web/features/reviews/reviews-page.tsx`, `apps/web/features/workspace/home-page.tsx`.

### New files

`apps/web/features/shared/save-blob.ts`, `apps/web/features/shared/upload-rules.ts`,
`apps/web/features/shared/upload-rules.test.ts`, `apps/web/features/shared/version-row.ts`.

## Remaining risks and next action

- L1 and L4 remain open, deliberately, per the orchestrator's decision recorded above.
- `versionStatusLabels`/M9's fix landed in a prior commit outside this batch's diff; nothing further
  needed, but it means this batch's diff does not itself touch `workspace-data.ts`.
- No process was left running; the read-only REST count query used the already-running container
  and made no writes.
