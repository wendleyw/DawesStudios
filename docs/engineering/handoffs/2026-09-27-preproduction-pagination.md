# Preproduction pagination

- Updated: 2026-09-27T16:15:37-04:00 · Agent: Codex implementer · Model: GPT-6
- State: verified in isolated filesystem staging
- Objective: remove 1,000-row truncation from workspace projects, Files, and board artwork.
- Owned paths: workspace/asset/board data modules and colocated tests/READMEs, shared pagination helper/test/README.

## Changes
- `features/shared/pagination.ts` — ordered 500-row page collection and 100-item chunks with cancellation checks.
- `features/workspace/workspace-data.ts` — page projects and designer board dates; stable project ordering and abort propagation.
- `features/assets/asset-data.ts` — page client projects, files, and client Drive links; chunk project IDs and preview signatures.
- `features/board/board-data.ts` — page deliverables/covers, chunk project IDs and cover signatures.
- Colocated tests and four feature READMEs — cover large data, boundaries, errors, role scope, ordering, and current behavior.

## Decisions and interface changes
- Cache keys and existing role gates are unchanged; shared helper has no Supabase access.
- No cross-domain interface or path expansion; uploadInternalAsset was untouched.

## Checks actually run
- `npx vitest run features/shared/pagination.test.ts features/workspace/workspace-data.test.ts features/assets/asset-data.test.tsx features/board/board-data.test.ts` — pass, 30/30.
- `npm --prefix apps/web run typecheck` — pass.
- Focused `npx eslint` and `npx prettier --check` on eight touched TS/TSX files — pass.
- `git diff --check -- apps/web/features/workspace apps/web/features/assets apps/web/features/board apps/web/features/shared` — pass.
- `PAGINATION_STAGING_READY=1 node outputs/preproduction-large-dataset/run.mjs --run` — pass: web3113 agency/client/designer each showed 1,005 tagged projects via three HTTP pages (offsets 0/500/1000); other designer/client each saw 0; exact-ID cleanup restored 10 clients/25 projects. Evidence: `outputs/preproduction-large-dataset/result.json` and cleaned `manifest.json`.

## Risks and next action
- Offset paging can shift during concurrent row inserts/deletes; large Files/Board child rows and signed covers were not staged.
- Ownership: all listed paths released; no active process or commit.
