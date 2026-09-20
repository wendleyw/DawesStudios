# Refactor the projects feature onto the data-access contract (Task 8)

- Updated at: 2026-09-20T18:58:00-03:00
- Reporting agent and tool: Task 8 delegated worker / Claude Code
- State: implemented and tested; verified by type check, lint, format and unit tests only — not verified in a browser
- Objective: relocate the 19 inline Supabase call sites in `apps/web/features/projects/` onto the data-access contract, add unit tests for the extracted functions, adopt the shared primitives, report (not edit) the `globals.css` boundary, split oversized files, and remove dead code, all without changing behavior
- Owned paths: `apps/web/features/projects/`, `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-8-report.md`, and this report
- Dependencies: `docs/architecture/data-access.md`; the `features/credits` and `features/board` exemplars; `features/shared/README.md`
- Acceptance criteria: `npm run check` passes with no test modified; `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/projects/*.tsx` returns 0 for every file; each relocated query keeps its table, columns, filters, ordering and error handling; each extracted write has a unit test naming its table or procedure and its exact argument object
- Commit: `f358e2e` on `refactor/repository-structure`

## Completed work and changed files

All 19 measured call sites are relocated. `grep -c '\.from(\|\.rpc(\|\.storage\.'` now returns `0`
for every `.tsx` file in the feature, including the two new ones.

| File | Change | Lines before → after |
| --- | --- | --- |
| `apps/web/features/projects/project-data.ts` | Two read hooks, `projectQueryKeys`, eleven write/read functions added | 164 → 475 |
| `apps/web/features/projects/project-data.test.ts` | New — unit tests for every extracted function | — → 477 |
| `apps/web/features/projects/artwork-files.ts` | `discardUnreferencedArtwork` added; `sanitizeArtwork` de-exported; `SupabaseDatabase` alias adopted | 45 → 60 |
| `apps/web/features/projects/artwork-files.test.ts` | New — unit tests for `discardUnreferencedArtwork` | — → 55 |
| `apps/web/features/projects/project-action-dialog.tsx` | 11 call sites removed | 361 → 333 |
| `apps/web/features/projects/project-details.tsx` | 5 call sites removed | 309 → 284 |
| `apps/web/features/projects/comment-panel.tsx` | 2 call sites removed | 207 → 204 |
| `apps/web/features/projects/artwork.tsx` | 1 call site removed | 99 → 84 |
| `apps/web/features/projects/project-page.tsx` | Canvas node components and opening view extracted | 500 → 301 |
| `apps/web/features/projects/project-nodes.tsx` | New — `VersionCard`, `DeliverableHeader`, `nodeTypes`, node types | — → 158 |
| `apps/web/features/projects/project-canvas-view.tsx` | New — `CanvasOpeningView` | — → 34 |

Untouched, as instructed: `canvas-layout.ts`, `media-client.ts`, `project-events.ts`,
`comment-draft.ts`, `projects.css`, `app/globals.css`, every test file that already existed, and the
two `docs/superpowers/` files belonging to the concurrent session.

## The 19 relocated call sites

Every row was moved verbatim. "Unchanged" means the table or procedure name, the selected columns,
every filter and its argument, the filter order, any `.order()`/`.single()`/`.range()` and the error
handling are character-for-character what the component issued before, apart from parameter names
being read from an `input` object instead of a closure.

| # | Source (before) | Destination function | Table / procedure, columns, filters, ordering |
| --- | --- | --- | --- |
| 1 | `project-action-dialog.tsx` `close()` | `artwork-files.ts` → `discardUnreferencedArtwork` | `designs`; `select("id")`; `.eq("internal_asset_path", path)`; no ordering — unchanged |
| 2 | `project-action-dialog.tsx` `close()` | `artwork-files.ts` → `discardUnreferencedArtwork` | `storage.from("internal-assets").remove([path])`; still guarded by the empty-rows check — unchanged |
| 3 | `project-action-dialog.tsx` `kind === "version"` | `project-data.ts` → `createDesignVersion` | rpc `create_design_version`; `p_deliverable_id`, `p_notes`, conditional `p_copy_version_id` — unchanged |
| 4 | `project-action-dialog.tsx` `edit-design` (`same`) | `project-data.ts` → `findUnchangedDesign` | `designs`; `select("id")`; `.eq("id")`, `.eq("title")`, `.eq("content", JSON.stringify(...))`, then `.eq("internal_asset_path", …)` or `.is("internal_asset_path", null)`; same order — unchanged |
| 5 | `project-action-dialog.tsx` `edit-design` (`update`) | `project-data.ts` → `updateWorkingDesign` | `designs`; `update({title, content, internal_asset_path})`; `.eq("id")`, `.eq("title", previous)`, `.eq("content", JSON.stringify(previous))`, then `.eq`/`.is` on `internal_asset_path`; `.select("id").single()`; `PGRST116` → "This design changed while you were editing…" — unchanged |
| 6 | `project-action-dialog.tsx` `design` (`existing`) | `project-data.ts` → `findDesignByAsset` | `designs`; `select("id")`; `.eq("version_id")`, `.eq("internal_asset_path")`; same order — unchanged |
| 7 | `project-action-dialog.tsx` `design` (`existing[0]`) | `project-data.ts` → `updateDesignContent` | `designs`; `update({title, content})`; `.eq("id")`; `.select("id").single()` — unchanged |
| 8 | `project-action-dialog.tsx` `design` (else) | `project-data.ts` → `addDesign` | rpc `add_design`; `p_version_id`, `p_title`, `p_content`, conditional `p_internal_asset_path` — unchanged |
| 9 | `project-action-dialog.tsx` `kind === "publish"` | `project-data.ts` → `publishVersion` | rpc `publish_version`; `p_version_id`, `p_release_note`, `p_assets`; still no submission key, and the comment explaining why moved with the call — unchanged |
| 10 | `project-action-dialog.tsx` `kind === "submit"` | `project-data.ts` → `submitDesignVersion` | rpc `submit_design_version`; `p_version_id` — unchanged |
| 11 | `project-action-dialog.tsx` `kind === "review"` | `project-data.ts` → `reviewPublication` | rpc `review_publication`; `p_publication_id`, `p_decision`, `p_feedback` — unchanged |
| 12 | `project-details.tsx` `assignments` (members) | `project-data.ts` → `useProjectAssignments` | `profiles`; `select("id,display_name")`; `.eq("role", "designer")` — unchanged |
| 13 | `project-details.tsx` `assignments` (assigned) | `project-data.ts` → `useProjectAssignments` | `project_assignments`; `select("designer_id")`; `.eq("project_id", …)`; both still issued inside one `Promise.all`, query key `["assignments", userId, projectId]` and `enabled: profile?.role === "agency"` — unchanged |
| 14 | `project-details.tsx` `save` | `project-data.ts` → `updateProjectDetails` | `projects`; `update({title, description, start_date, due_date})`; `.eq("id")`, `.eq("updated_at", revision)`; `.select("id").single()`; `PGRST116` → "This project changed while you were editing…" — unchanged |
| 15 | `project-details.tsx` `assign` | `project-data.ts` → `assignDesigner` | rpc `assign_designer`; `p_project_id`, `p_designer_id` — unchanged |
| 16 | `project-details.tsx` `revoke` | `project-data.ts` → `revokeDesignAssignment` | rpc `revoke_design_assignment`; `p_project_id`, `p_designer_id` — unchanged |
| 17 | `comment-panel.tsx` `post` | `project-data.ts` → `postComment` | rpc `post_comment`; `p_project_id`, `p_channel`, `p_body`, conditional `p_version_id`, `p_design_id`, `p_pin_x`/`p_pin_y`; the `body.trim()` stayed in the component — unchanged |
| 18 | `comment-panel.tsx` `resolve` | `project-data.ts` → `resolveComment` | rpc `resolve_comment`; `p_comment_id`, `p_channel`, `p_resolved` — unchanged |
| 19 | `artwork.tsx` `asset` | `project-data.ts` → `useDesignAssetUrl` | `storage.from(channel === "internal" ? "internal-assets" : "published-assets").createSignedUrl(path, 300)`; query key `["asset-url", userId, channel, assetPath]`, `enabled: !!assetPath`, `staleTime: 120_000`, `refetchInterval: 240_000` — unchanged |

Nothing in the feature calls `useProjectDetail`'s or `useProjectComments`' queries differently; those
two hooks already satisfied the contract and were not edited.

## Decisions and interface changes

1. **Destination choice.** `artwork-files.ts` received call sites 1 and 2 because together they are
   the inverse of `uploadArtwork`: one module now owns an artwork file's whole lifecycle (prepare,
   store, discard-if-unreferenced). Everything else went to `project-data.ts`, including the signed
   URL read (19). That read stayed out of `artwork-files.ts` because the module is deliberately free
   of React, `useAuth` and TanStack Query, and because `board-data.ts` already keeps its
   `createSignedUrls` beside the rows it signs. The reason is recorded in the header comment of both
   modules, not only here.
2. **Three reads are plain functions, not hooks** — `findUnchangedDesign`, `findDesignByAsset` and
   the assignment read's non-hook siblings. `findUnchangedDesign` and `findDesignByAsset` run inside
   a mutation to decide whether the write that follows repeats one already stored; a hook would read
   on render and answer from a cache populated before the upload it is meant to judge. This is the
   feature's one deviation from the contract's "reads are `use<Thing>()` hooks" rule and is recorded
   in a block comment above the two functions in `project-data.ts`.
3. **Both `PGRST116` conflict messages moved with their query.** The zero-row result only exists
   because of the `.eq("updated_at", …)` / `.eq("title", previous)` guards in the query itself;
   leaving the interpretation at the call site would have left a component reasoning about a filter
   it can no longer see. The thrown strings are byte-identical, and `project-details.tsx` still
   renders its own "0 rows" fallback text unchanged.
4. **`projectQueryKeys` added.** `useInvalidateProject` now maps over an exported key set, matching
   `creditQueryKeys`. The four keys are the same four it invalidated before. `assignments` and
   `asset-url` are deliberately **not** in the set — assignments are refetched by the panel that owns
   them right after the assign/revoke, and a signed URL expires on its own. A comment above the set
   records that, so the omission is not read as an oversight.
5. **`sanitizeArtwork` de-exported**, not deleted: it is live (called by `uploadArtwork`) but had no
   consumer outside its module.
6. **`artwork-files.ts` now spells its client type `SupabaseDatabase`** instead of
   `SupabaseClient<Database>`. These are the same type (`lib/supabase.ts:4`); the change makes the
   file's new and existing functions agree and matches contract rule 3. `media-client.ts` keeps its
   spelling because it was out of scope.

## Step 4 — CSS boundary: none remaining

**Verdict: the boundary is clean. No `project-*` namespace in `globals.css` belongs to `projects`
alone, and nothing should be moved.** `globals.css` was not edited.

Every class `features/projects/*.tsx` uses that is defined in `globals.css` rather than
`projects.css` was enumerated mechanically (all `className` tokens ∩ all `globals.css` selectors,
minus everything `projects.css` defines). The complete result is eight generic utilities shared
across the application — `eyebrow`, `form-actions`, `page-content`, `panel`, `primary`, `quiet`,
`status-badge`, `visually-hidden` — none of which is a feature namespace.

In the other direction, the `project-*` selectors that live in `globals.css` have no consumer in
this feature at all:

```
$ grep -rn "project-origin\|project-title\|project-symbol" apps/web/features apps/web/app --include="*.tsx"
apps/web/features/workspace/home-page.tsx:131:  <span className="project-origin">
apps/web/features/workspace/home-page.tsx:125:  <span className="project-title">
apps/web/features/workspace/home-page.tsx:126:  <span className="project-symbol">

$ grep -rn "project-row\|project-table" apps/web/features apps/web/app --include="*.tsx"
apps/web/features/board/board-page.tsx:408:  className="project-row"
apps/web/features/board/board-page.tsx:387:  className="board-list project-table"
apps/web/features/workspace/home-page.tsx:124:  className="project-row"
apps/web/features/workspace/home-page.tsx:115:  className="project-table"
```

`.project-origin`, `.project-title` and `.project-symbol` are **workspace-only** (`home-page.tsx`),
and `.project-title strong` shares a grouped selector with `.project-row > strong` at
`globals.css:606-607` and `:1003-1004`. `.project-row`/`.project-table` are shared by `board` and
`workspace`, as you said. `.project-canvas` and `.design-viewport` are the feature's only selectors
in the file and both sit inside the grouped `.react-flow__attribution` rule at `globals.css:769-771`
with `.board-canvas` — the case you asked me not to flag.

## Step 3 — shared primitives: already adopted, nothing left to convert

`FormError` is already imported and used in `comment-panel.tsx`, `project-action-dialog.tsx` and
`project-details.tsx`; `PageStatus` in `project-page.tsx`. No `search-field` markup exists in the
feature. Four remaining status/alert elements were examined and left alone because adopting a
primitive would change their rendered output:

- `artwork.tsx:55` — `<div className="artwork-loading" role="status">`; a feature-styled box, not
  `page-content`.
- `comment-panel.tsx:100` — bare `<p role="status">`; the shared README already records plain
  `<p role="status">` loading text as a rejected primitive candidate.
- `comment-panel.tsx:102` — `<div role="alert">` wrapping a paragraph and a retry button; `FormError`
  renders a `<p className="form-error">`.
- `project-details.tsx:141` — `<p role="alert">` with **no** `form-error` class; converting it would
  add a class the element does not have today.

`features/shared/README.md` needs no edit: this feature's consumer list is unchanged.

## Step 5 — splits

- **`project-page.tsx` (500 → 301).** Split by responsibility, mirroring the shape `board` already
  uses (`board-nodes.tsx`, `board-canvas-controls.tsx`): `project-nodes.tsx` holds what the canvas
  *draws* (`VersionCard`, `DeliverableHeader`, `nodeTypes`, `VersionNode`/`DeliverableNode`), and
  `project-canvas-view.tsx` holds `CanvasOpeningView`, the one piece that decides where the canvas
  *opens*. What remains in `project-page.tsx` is the page's state, its node assembly from the layout
  frames, and its layout. The extraction was verified line-by-line against `git show HEAD` — the only
  differences are the added `export` keywords.
- **`project-action-dialog.tsx` (361 → 333).** Not split. It shrank as expected once its 11 queries
  left, and what remains is one dialog: its mutation and the per-kind fields of a single form. Two
  files here would separate a form from the submit handler that reads it.
- **`project-data.ts` (475).** Not split, despite passing the threshold. `docs/architecture/data-access.md`
  rule 1 names exactly one file per feature as the home for its Supabase access; splitting it would
  break the rule the task exists to apply, and the module has a single responsibility.
- **`project-data.test.ts` (477)** mirrors the module under test.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` (baseline, before any edit) | local, 2026-09-20 18:53 | pass — 17 files / 281 tests; 2 pre-existing `board` lint warnings | terminal |
| `npm run check` (after relocation, before tests added) | local, 18:55 | pass — 17 files / 281 tests, unchanged | terminal |
| `npm run check` (final, post-commit, exit code 0) | local, 18:58 | **pass — 19 files / 320 tests**; typecheck, eslint, prettier all clean; the same 2 pre-existing `board` warnings | scratchpad `check2.log` |
| `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/projects/*.tsx` | local, 18:57 | **0 for all 8 `.tsx` files** (including the two new ones) | terminal |
| Extraction fidelity of `project-nodes.tsx` + `project-canvas-view.tsx` vs `git show HEAD:project-page.tsx` | local, 18:57 | every non-comment line of the removed block is present in the new files; the only 4 differences are added `export` keywords | terminal |
| `globals.css` class cross-reference (projects `className` tokens ∩ `globals.css` selectors − `projects.css`) | local, 18:54 | 8 generic utilities, no feature namespace | terminal |
| Unused-export sweep across `apps/web` for every `features/projects` export | local, 18:56 | only `sanitizeArtwork` (fixed) and two `canvas-layout.ts` exports (out of scope, see risks) | terminal |
| `git commit` with `commitlint`, `gitleaks`, `lint-staged` | local, 18:57 | committed `f358e2e`; gitleaks "no leaks found"; commitlint reported 1 style warning, 0 problems | terminal |

Test counts: **281 → 320** (+39), **17 → 19 files**. No existing test was modified; `canvas-layout.test.ts`
and `media-client.test.ts` pass untouched.

## Remaining risks and next action

1. **Not verified in a browser.** Nothing here was exercised against the running dev server on port
   3003 (which was left running, as instructed) or against Playwright. The relocation is proved by
   type checking and by argument-level unit tests, not by a live request. The publish path in
   particular still depends on the media service, which no unit test touches.
2. **One documentation edit is outside my write scope, so I did not make it.**
   `docs/architecture/data-access.md` ends with an "Exception — None identified yet for this feature"
   section. This feature introduces a documented deviation (three reads that run inside a mutation
   stay plain functions rather than `use<Thing>()` hooks). The reason is recorded in the code above
   those functions, which is the standard you set; if you want it in the contract document too, that
   edit is yours. The same applies to adding `projects` to that document's worked-example list.
   `apps/web/features/projects/` has no `README.md`; `brand/` and `briefings/` do. Creating one is in
   my write scope but felt like scope creep for this task — say the word and I will.
3. **Two pre-existing lint warnings in `features/board/`** (`board-canvas-controls.tsx:30`
   exhaustive-deps, `board-nodes.tsx:4` unused `ArrowLeft`) were present at baseline and are outside
   my write scope. They are unrelated to this task but will show in any `npm run check` output.
4. **Two unused exports remain in `canvas-layout.ts`** (`CanvasLayoutDeliverable`,
   `DEFAULT_ARTWORK_RATIO`). That file was on the explicit leave-alone list, so I did not touch them.
5. **Next required action:** orchestrator review of `f358e2e`, then decide items 2 and 4 above.

## Ownership at handoff

All paths under `apps/web/features/projects/` are released; nothing is left uncommitted. The dev
server on port 3003 was not stopped, restarted or otherwise touched, and Docker was not touched. The
working tree contains only the two untracked `docs/superpowers/` files belonging to the concurrent
session, which were left exactly as found.
