# Handoff: designer board reassignment fix

Status: implemented, tested, gate green (commit 13fb4fc).

Changed files:
- apps/web/features/projects/project-data.ts — `useDesignBoards` now polls every 30_000ms (query key unchanged).
- apps/web/features/projects/project-action-round.tsx — catches "Board access required" from `sendBoardRound`, invalidates project queries via `useInvalidateProject`, shows "This board is no longer assigned to you." instead of the raw error. Other errors (e.g. idempotency-key retry) unchanged.
- apps/web/features/projects/project-workspace.test.tsx — new test: boards [board]→[] falls back to "The studio has not set up your board yet." with no Send to studio button.
- apps/web/features/projects/project-action-workspace.test.tsx — new test asserting the plain message and boards-cache invalidation; added `invalidateProject` spy.
- apps/web/features/projects/README.md — one paragraph documenting the 30s poll and the round-dialog fallback.

Checks executed: `npm run check` in apps/web (typecheck, lint, format, vitest) — all green, 1275 tests passed.

Unresolved risks: none identified; behavior only verified via unit tests (no e2e run, per task scope).

Next action: none required; task complete.
