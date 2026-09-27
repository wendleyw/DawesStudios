# Drive links by channel — web handoff

- Updated: 2026-09-27T14:07:32-04:00 · Agent: Codex bounded implementer · Model: GPT-6
- State: tested (browser verification remains with the orchestrator).
- Objective: finish the interrupted Drive-channel frontend without changing the backend or local data.
- Owned paths: projects, assets, and workspace feature files; shared README; two browser specs; this report.

## Changes
- `features/projects/project-data.ts`, `project-workspace.tsx`, `miro-workspace-bar.tsx`: read per-channel Drive rows under RLS, show only the active channel, and invalidate the new query key after writes.
- `features/projects/project-details.tsx`: separate agency-only Internal/Client editors, client-only Files cache refresh, and loading/error retry instead of a false empty state.
- `features/assets/asset-data.ts`, `assets-page.tsx`, `file-groups.ts`: Files reads and labels only the client-channel row; no `projects.drive_url` selection remains.
- Colocated Vitest files: cover editor isolation, cache invalidation, failed reads, menu labels, and Files filtering of an internal row.
- `tests/e2e/project-drive-link.spec.ts`: button-based channel switching, assigned designer account, persisted reload, role isolation, and both-channel removal checks; `canonical-workspaces.spec.ts` reads the new table.
- Projects/assets/shared READMEs and `projects/drive-link.ts` comment: aligned channel behavior and terminology.

## Decisions and interface changes
- UI trusts database RLS for readable rows; client Files explicitly filters `channel = client`.
- No cross-domain interface change was needed; no backend, fixture, server, or local database write was made.

## Checks actually run
- `npx vitest run features/projects/project-details.test.tsx features/projects/miro-workspace-bar.test.tsx features/projects/drive-link.test.ts features/assets/asset-data.test.tsx features/assets/file-groups.test.ts` — pass, 5 files / 84 tests.
- `npm run typecheck` — pass.
- `npx eslint` on owned TS/TSX files — pass.
- `npx prettier --check` on owned TS/TSX and feature READMEs — pass.
- `git diff --check` on owned feature/spec paths — pass.
- Browser E2E was not run, per delegated scope.

## Risks and next action
- Orchestrator: run the Drive browser spec and integrated gate, inspect the role/channel behavior in the browser, then commit the integrated task.
- Ownership: all paths released; no worker process remains.
