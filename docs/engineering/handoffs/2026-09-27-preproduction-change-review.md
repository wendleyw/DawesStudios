# Preproduction change review

- Updated: 2026-09-27T16:07:00-04:00 · Agent: Codex reviewer · Model: GPT-6
- State: verified (static review and focused unit checks; runtime database behavior unverified)
- Objective: independently review pagination and working-file limit changes for regressions, role leaks, truncation, cancellation, and unbounded loops.
- Owned path: `docs/engineering/handoffs/2026-09-27-preproduction-change-review.md` only.

## Findings
- [Low, code-verified] `apps/web/features/shared/pagination.ts:15-17` — `fetchAllPages` checks abort only before `fetchPage`. If the last, short page resolves after the signal aborts, it returns rows successfully; check the signal again after `await` and test abort on a short page. The Supabase transport's behavior in this race is unverified.
- [Low, code-verified] `apps/web/features/board/board-data.ts:161-164` and `apps/web/features/assets/asset-data.ts:300-310` — signing now runs in sequential 100-path batches without abort checks; navigating away during the first signature still issues every later batch. Pass/consume the query signal and stop between batches. Request counts under real Storage are unverified.

## Changes
- Report only; implementation and migration were not edited.

## Decisions and interface changes
- No new interface decision. Project, file, cover, and designer-board reads have unique ordering keys; client-channel filters and existing RLS gates remain in place. The migration matches the current working-file UI's 50 MiB and four MIME types.

## Checks actually run
- `npx vitest run features/shared/pagination.test.ts features/workspace/workspace-data.test.ts features/assets/asset-data.test.tsx features/board/board-data.test.ts` — pass, 4 files / 30 tests.
- `git diff --check -- apps/web/features/shared apps/web/features/workspace apps/web/features/assets apps/web/features/board supabase/migrations/202609270017_working_file_limits.sql` — pass.
- Read current diff, schema/RLS definitions, related tests, and consuming components — no confirmed role leak, deterministic truncation, or infinite loop under the configured 1,000-row PostgREST cap.

## Risks and next action
- Offset pages can duplicate or miss records when the underlying ordered set changes between requests; this is an unverified runtime risk, already disclosed by the implementer. Tests mock ordering/RLS and do not prove database authorization or concurrent-write behavior.
- Root should decide whether to fix both cancellation paths, then run real database/role checks and migration verification; this reviewer did not run DB, browser, or Docker.
- Ownership: report path released; no active writer, commit, or push.
