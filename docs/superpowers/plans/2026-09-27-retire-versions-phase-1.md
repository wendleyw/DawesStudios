# Retire Versions — Phase 1 (UI, web and media code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every project renders only the Miro workspace. The legacy Versions UI, the upload,
publication and pin code paths, and the media routes that only Versions used are deleted. Every
screen that consumed Versions data reads the Miro model instead. The database is not touched in
this phase.

**Architecture:** Delete in dependency order. First adapt the consumers outside `features/projects`
so nothing else imports Versions code. Then delete the legacy project UI and its tests. Then
delete the media routes and their clients. Finally prune and rewrite the e2e suite. Every task
ends green.

**Tech Stack:** Next.js / React 19 / TanStack Query (Vitest, Playwright) and the Node media worker
(node:test).

**Spec:** `docs/superpowers/specs/2026-09-27-retire-versions-design.md` (Phase 1).

## Global Constraints

- **Language:** English only in code, copy and docs. Chat with the user is in pt-BR.
- **Database:** do not touch it; no migrations in this phase. Never run `supabase migration down`,
  `supabase db reset` or any reset.
- **Data access:** only in `features/<feature>/<feature>-data.ts`.
- **Deletions:** before deleting any file or export, confirm with `rg` across `apps/web` (tests
  included) that nothing outside the deletion set imports it. Anything the Miro workspace, covers,
  Files, Brand Hub, Playground, Reviews, Overview, credits or briefings still needs is adapted,
  not deleted.
- **Privacy:** a client never receives internal data, and a designer never sees another designer.
- **Commits:** other Claude sessions may work in this tree, so commit only with explicit
  pathspecs (`git commit -m "..." -- <paths>`, which includes deleted paths) and check
  `git show --stat HEAD`. Every commit ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Gates:** `cd apps/web && npm run check`. For media: `cd apps/media && npm test`. Playwright
  runs with a private `--output ../../outputs/pw-rv1-<task> --reporter=line`.
- **Docs:** update every README that describes code this task changes or deletes, in the same
  commit.

## Review Focus

1. A project that has legacy per-deliverable rows in the database must still open cleanly in the
   workspace. Those rows simply stay unused, with no crash and no stray "Deliverable" labels.
2. Reviews and Overview must not show a client internal rounds, and must not show a designer
   another designer's rounds. RLS already enforces this; the UI must not assume otherwise.
3. Comment panels must still post, resolve and keep channel drafts separate without the design
   and pin parameters.
4. Files must keep working files and final files for every role, and client visibility must be
   unchanged.
5. No dead imports or orphaned CSS left behind by the deletions.

---

### Task 1: Consumers read the Miro model

**Files:**
- `apps/web/features/board/board-data.ts` and `project-thumbnail.tsx`: the cover, otherwise the
  placeholder. Remove the legacy-art path and its tests; keep the cover signing fallback to the
  placeholder.
- `features/overview/*` (`overview-data.ts`, `overview-model.ts`): the designer's list of rounds
  labelled by board name and "Round N"; the client's and agency's lists of client versions
  labelled "V N". No deliverable labels. Read the board names through a projects-data or
  overview-data read of `design_boards`, never with a `select *` that includes author columns.
- `features/reviews/review-data.ts` and `reviews-page.tsx`: studio side = rounds `submitted`
  (Studio review) plus client versions awaiting or decided; client side = client versions.
  Labels as above.
- `features/assets/asset-data.ts` and `assets-page.tsx`: drop the "shared designs" source
  (`published_designs`) and its copy. Keep working files (`project_assets`) and delivery files.
- `features/playground/playground-albums.ts` (and its UI): drop the album built from project
  designs; keep the Brand Hub albums.
- `features/shared/version-row.ts`: keep only what the remaining code uses.

Filter out rows with a deliverable wherever a query still returns them, because the old data stays
in the database until Phase 2. Update the tests of each feature and the matching READMEs.

- [ ] Write or adjust the failing tests first, feature by feature. Implement. Run
  `npm run check`.
- [ ] Commit per feature, or once: `refactor: read Miro rounds and client versions in board,
  overview, reviews, files and playground`.

### Task 2: Delete the legacy project UI

**Files:** `apps/web/features/projects/*`, following the "What is removed → Web" list in the spec.
- `project-page.tsx` renders only `ProjectWorkspace`.
- Remove `legacyRequested`, `legacyChosen`, "Earlier versions" and `onBackToBoards`.
- `project-header.tsx` keeps only what the workspace uses. Move shared bits such as
  `ProjectBackLink` and `ProjectChannelControl` if needed, or delete the file if nothing is left.
- `comment-panel.tsx` / `comment-draft.ts` lose `designId`, pins and time codes. They keep
  channel, version scoping and drafts. Their callers are adapted.
- `project-data.ts` loses every read or write used only by the deleted files, for example
  `useProjectDetail`'s designs part, `createDesignVersion`, `addDesign`, `publishVersion` and
  `submitDesignVersion`. The Miro workspace reads it still needs stay. If `useProjectDetail`
  becomes workspace-only, keep its name and shape.
- `project-events.ts` stops listening to `designs`.
- Delete `projects.css` rules used only by the deleted markup.
- Delete the deleted files' tests, and update the tests that remain.
- Update `features/projects/README.md`: remove the Versions sections and describe the
  workspace-only page.

- [ ] Delete in small steps, running `npx tsc --noEmit -p .` after each group. Finish with
  `npm run check`.
- [ ] Commit `refactor(projects): remove the legacy Versions canvas and design uploads`.

### Task 3: Delete the media routes and clients only Versions used

**Files:**
- `apps/media/src/server.js`, `supabase.js`, `sanitize.js` and their tests: remove
  `/publications/prepare`, `/designs/sanitize-video` and `/designs/discard-raw`. Remove
  `/assets/discard` only if `rg` shows no remaining web caller. Keep `/deliveries/prepare`,
  `/covers/*` and the shared helpers they use.
- `apps/web/features/projects/media-client.ts` and its test: remove the functions for the deleted
  routes.
- Update `apps/media/README.md`.

- [ ] Run `cd apps/media && npm test` and `cd apps/web && npm run check`. If the media container
  runs locally, rebuild and restart it the way `apps/media/README.md` says. Verify `/health` and
  that a removed route returns 404.
- [ ] Commit `refactor(media): remove the publication and design sanitizing routes`.

### Task 4: E2E suite on the Miro model

- **Delete** the specs that only test Versions flows: `production-workflow`, `video-designs`,
  `video-loading`, `bulk-image-drop` and `project-recovery`. Also delete the Versions-only tests
  inside `project-feedback`, `project-creation-cards`, `playground`, `system-tour`, `design-audit`,
  `client-team`, `brand-canvas-final`, `workspace` and `sabre-demo`: any test that uploads,
  publishes or opens designs, uses pins, or asserts the Versions canvas. Keep or rewrite the parts
  that test other behavior on the Miro model: comments per channel, credits, navigation, Brand
  Hub, and the Playground with brand albums.
- Remove the fixture helpers that only the deleted tests used, in `project-fixture.ts`,
  `playground-fixture.ts` and `test-support.ts`.
- **Add** `apps/web/tests/e2e/project-cover.spec.ts`, as described in
  `docs/superpowers/plans/2026-09-27-project-cover.md` Task 6. Extend `cleanupTestProject` to
  delete `project_covers` rows and `project-covers/<projectId>/*` objects.
- The canonical-count assertions (SABRE overlay) keep failing exactly as before, and are
  addressed in Phase 3.

- [ ] Run the full suite: `cd apps/web && npx playwright test --output ../../outputs/pw-rv1-full
  --reporter=line`. The only accepted failures are the documented SABRE-overlay counts:
  `canonical-workspaces`:7, `design-audit`:18, `workspace-actions`:14 and `workspace.spec`:25/:48,
  or their rewritten equivalents. List every other failure and fix it.
- [ ] Commit `test(e2e): run the suite on the Miro model and cover project covers`.
