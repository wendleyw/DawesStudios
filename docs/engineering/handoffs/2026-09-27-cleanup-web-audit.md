# Web cleanup audit

- Updated: 2026-09-27 EDT · Agent: Codex reviewer · State: verified read-only audit
- Objective: inspect every first-level `apps/web` feature, plus `app`, `lib`, `tests`, `public`, and configuration for dead files, dependencies, stale references, and structure defects.
- Owned path: this report only; application and configuration files were not edited.

## Findings, ranked
- [MEDIUM] `apps/web/package.json:29` — `tus-js-client` remains a production dependency after its uploader was removed; a repo-wide source/config search finds no import or runtime use, so installs and the production dependency tree retain unused code — remove it and regenerate the lockfile.
- [MEDIUM] `apps/web/features/brand/brand-assets.tsx:24` and `brand-products.tsx:6` — each imports the other at runtime (`BrandProducts` / `AssetPreview`), creating a module cycle that makes initialization and future extraction fragile — move `AssetPreview` and its local helpers into a colocated brand preview module used by both.
- [LOW] `apps/web/features/shared/canvas-fit.ts:20` — only `board/board-layout.ts:1` consumes `fitToContent` in production; the comment's second canvas consumer no longer exists — colocate this utility and its test with board.
- [LOW] `apps/web/features/shared/concurrency.ts:15` — both production consumers are in Playground (`playground-albums.ts:12`, `use-playground-drop.ts:5`), so the generic shared layer has one domain consumer — colocate it and its test with Playground.
- [LOW] `apps/web/features/shared/version-row.ts:27` — `projects/project-data.ts:7` is its sole production consumer; `canonical-workspaces.spec.ts:5` is a test import, so shared placement is unwarranted — colocate with Projects and update the E2E import and unit test.
- [LOW] `apps/web/next.config.ts:44`, `features/shared/canvas-fit.ts:4`, and `features/shared/concurrency.ts:4` — comments name deleted `artwork-files.ts` / `bulk-drop-model.ts` and a former project canvas — correct these claims alongside the respective cleanup.

## Coverage and decisions
- Reviewed feature folders: assets, auth, board, brand, briefings, campaigns, competitors, credits, overview, playground, projects, reviews, settings, shared, team, workspace; also App Router entries, `lib`, E2E/unit test placement, five public brand assets, and web tooling/configuration.
- A read-only import graph started at 37 App Router TS/TSX entries: all 248 app-reachable production TS/TSX/CSS modules were reached; the other four non-test files are the expected `next-env.d.ts` and three CLI configs. No whole production module is proven safe to delete.
- All five public brand assets have source references; all five E2E support modules are reached from specs. Other production dependencies have source/config references; root commit hooks use the Husky, lint-staged, and commitlint dev dependencies.
- Preserved intentional code: the old `save_board_widgets` backend compatibility RPC has no current UI consumer (`board/README.md:47`); Next App Router routes and the `@modal` interception are framework entry points, not dead imports.
- Concurrent changes in `features/projects/project-details*`, `features/projects/README.md`, CI, and production files belong to another session and were not re-reviewed.

## Checks actually run; risks and next action
- `rg --files`, bounded `rg -n` references, `git status --short`, and read-only Node import/dependency graph scripts — counts and findings above; no test suite, build, server, install, git mutation, or database action was run.
- Import reachability is static; it does not prove behavior or runtime bundling. The recommended moves need import updates, documentation updates, and the normal web gate when the orchestrator integrates them.
- Next: remove the unused dependency, break the Brand cycle, rehome the three single-domain utilities, and correct stale comments in a disjoint implementation task; ownership of this report is released.
