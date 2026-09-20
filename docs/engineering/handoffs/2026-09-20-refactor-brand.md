# Refactor the brand feature onto the data-access contract (Task 9)

- Updated at: 2026-09-20T19:15:00-03:00
- Reporting agent and tool: Task 9 delegated worker / Claude Code
- State: implemented and tested; verified by type check, lint, format, unit tests, and the three required Playwright specs against the live dev server
- Objective: relocate the 11 measured inline Supabase call sites in `apps/web/features/brand/` onto the data-access contract, add unit tests for the extracted functions, adopt the shared primitives, report (not edit) the `globals.css` boundary, split oversized files, and remove dead code, all without changing behavior
- Owned paths: `apps/web/features/brand/`, `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-9-report.md`, and this report
- Dependencies: `docs/architecture/data-access.md`; the `features/credits` and `features/projects` exemplars; `features/shared/README.md`
- Acceptance criteria: `npm run check` passes with no test file modified; `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/brand --include='*.tsx' | grep -v 'Array\.from('` returns no output; each relocated query/storage call keeps its table/bucket, columns, filters and error handling; each extracted write has a unit test naming its exact table/bucket and argument object; `brand-guidance`, `brand-accessibility` and `brand-canvas-final` pass unmodified
- Commit: `02bb16a` on `refactor/repository-structure`

## Completed work and changed files

All 11 measured call sites are relocated (7 in `brand-assets.tsx`, 2 in `draft-editor.tsx`, 1 in
`brand-templates.tsx`, 1 in `section-editor.tsx`) into `brand-data.ts`. `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/brand --include='*.tsx' | grep -v 'Array\.from('`
now returns no output.

| File | Change |
| --- | --- |
| `apps/web/features/brand/brand-data.ts` (88 → 269 lines) | Added `useTemplateDraft`, `useBrandAssetPreviewUrl` (read hooks) and `findBrandAssetById`, `downloadBrandAssetFile`, `uploadBrandAssetFile`, `insertBrandAsset`, `removeBrandAssetFile`, `createTemplateDraft`, `updateTemplateDraft`, `saveBrandSection` (writes plus the two reads that cannot be hooks) |
| `apps/web/features/brand/brand-data.test.ts` (new, 308 lines) | 17 unit tests: exact table/bucket, exact argument object, database-error-message surfacing, and the stale-revision conflict path |
| `apps/web/features/brand/brand-assets.tsx` (381 → 207 lines) | 7 call sites removed; the upload dialog extracted to its own file |
| `apps/web/features/brand/brand-asset-upload.tsx` (new, 164 lines) | The upload dialog, split out once the relocated queries shrank `brand-assets.tsx` below the point where two components belonged in one file |
| `apps/web/features/brand/draft-editor.tsx` (263 → 248 lines) | 2 call sites removed |
| `apps/web/features/brand/brand-templates.tsx` (197 → 195 lines) | 1 call site removed |
| `apps/web/features/brand/section-editor.tsx` (240 → 226 lines) | 1 call site removed |
| `apps/web/features/brand/README.md` | Documents the read-that-cannot-be-hook deviation, the CSS-boundary finding, and the executed verification |

Untouched, as instructed: `brand-model.ts` and `brand-model.test.ts` (the safety net), `brand-page.tsx`,
`brand-sections.tsx`, `template-preview.tsx`, `brand.css`, `app/globals.css`, and the two
`docs/superpowers/` files that belong to the concurrent session.

## Decisions and interface changes

- **Two reads that cannot be hooks** (contract rule 2): `findBrandAssetById` — called from the
  upload dialog's `mutationFn` and its own `close()` handler, to decide whether a retried upload has
  already committed its row — and `downloadBrandAssetFile` — called from the download mutation,
  which exists only to trigger a browser save. Both stayed plain `async (database, input)`
  functions; the reasoning is recorded above them in `brand-data.ts` and in the feature `README.md`,
  mirroring the `findUnchangedDesign`/`findDesignByAsset` precedent from `projects`.
- **Storage calls got the same fidelity as table queries**: same bucket (`brand-assets`), same path
  construction (still built in the component — path/UUID generation is component-side idempotency
  state under rule 4), same options object, same error surfacing.
- **Split `brand-assets.tsx`** into the listing/preview/detail view (207 lines) and
  `brand-asset-upload.tsx` (the dialog, 164 lines) once relocation brought the original 381-line file
  down to 363 — still over the ~350-line prompt, and the upload dialog was already a fully
  self-contained unit.
- **Shared primitives (step 3): already adopted, no change needed.** `Modal`, `CopyButton`,
  `FormError`, `PageStatus`, `SearchField` were in use at every eligible call site before this task
  started. The remaining bare `<p role="status">` lines and `empty-state` divs match candidates
  `features/shared/README.md` already evaluated and rejected.
- **CSS boundary (step 4): none remaining.** The only `brand-`-prefixed class left in
  `app/globals.css` is `.brand-logo`, consumed only by `features/auth/login-page.tsx:44` and
  `features/workspace/app-shell.tsx:216` — not by `features/brand`. `brand-link`/`brand-monogram`
  are already in `features/workspace/workspace.css`. Nothing to move.
- **Dead code (step 6): none found** — zero unused exports in `brand-data.ts`, zero eslint
  errors/unused-var warnings in the feature.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npx vitest run features/brand` | Local, this session | 2 files / 35 tests passed | Session terminal output |
| `npx tsc --noEmit -p .` | Local, this session | Clean | Session terminal output |
| `npx eslint features/brand` | Local, this session | Clean | Session terminal output |
| `npx prettier --check features/brand` | Local, this session | Passed after one `--write` normalization pass | Session terminal output |
| `npm run check` | Local, this session, run twice (pre- and post-commit-hooks) | **20 files / 337 tests pass** (baseline 19/320). 2 pre-existing `features/board` lint warnings, unrelated | Session terminal output |
| `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/brand --include='*.tsx' \| grep -v 'Array\.from('` | Local, this session | No output | Session terminal output |
| `npx playwright test tests/e2e/brand-guidance.spec.ts tests/e2e/brand-accessibility.spec.ts tests/e2e/brand-canvas-final.spec.ts` against the live dev server on port 3003 | Local, this session, 2026-09-20 19:12 | **9 passed (27.4s)** | Session terminal output; full text in `task-9-report.md` |
| Commit hooks: commitlint, gitleaks, lint-staged (eslint --fix, prettier --write) | Local, this session, at commit time | All passed; no leaks found | Session terminal output |

## Remaining risks and next action

- The Playwright run wrote non-deterministic byte-level diffs into 8 `docs/verification/screenshots/*.png`
  files (visible content unchanged). These were outside this task's write scope, so they were
  reverted with `git checkout -- docs/verification/screenshots` rather than committed. If the
  orchestrator wants a fresh, deliberate screenshot baseline capture across all migrated features,
  that is a separate action.
- Unit tests prove argument shape, not live authorization; role isolation and real transport are
  proved by the Playwright run above and by the orchestrator's acceptance-matrix suites.
- `brand-model.ts` (380 lines, left alone by explicit instruction) and `brand-sections.tsx`
  (327 lines, unchanged — reads as one cohesive per-section switch) remain at or above the
  "~350 line" prompt; neither was split, per the task's own "a cohesive 400-line module beats two
  incoherent 200-line ones" guidance.
- Next required action: none to close this task. This was the last of the three heavy features
  (`board`, `projects`, `brand`) in the structural refactor; the orchestrator's next step is the
  final cross-feature audit.

## Ownership at handoff

`apps/web/features/brand/` is fully released, with no open edits and no background processes
started by this task. The dev server on port 3003 was left running exactly as found, untouched.
