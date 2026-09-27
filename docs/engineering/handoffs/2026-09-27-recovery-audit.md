# Recovery safety and fixture FK audit

- Updated: 2026-09-27 EDT · Agent: Codex delegated reviewer · Model: GPT-6
- State: fixture fix and backend regression verified; orchestrator owns final integration.
- Objective: keep recovery integrity checks and prevent acceptance cleanup from orphaning board data.
- Owned paths: new `apps/web/tests/e2e/fixture-cleanup.spec.ts` and this report in this turn.

## Changes
- `supabase/scripts/test_recovery.py` — 8 initial local safety regressions (root later extended the suite to 11) for corrupt backups, unsafe archives, target ownership, backup binding and delivery-byte mismatch.
- `apps/web/tests/e2e/project-fixture.ts` — for a guarded acceptance project, remove Playground Storage objects by its board IDs, then `playground_items` and `playground_boards` before the parent project.
- `apps/web/tests/e2e/intake-fixture.ts` — remove `board_preferences` for the guarded acceptance client before deleting that client.
- `apps/web/tests/e2e/fixture-cleanup.spec.ts` — backend-only regressions for project Playground rows/bytes and an agency-owned intake preference, with count restoration.

## Decisions and interface changes
- `project-fixture.ts:125,151` disabled FK triggers via `session_replication_role=replica` and deleted projects without Playground children; `playground_boards.project_id` references projects (`202609230003_playground.sql:6`), and `playground_items.board_id` references boards (`:15`).
- `intake-fixture.ts:89,114` likewise deleted clients without preferences; `board_preferences.client_id` has `ON DELETE CASCADE` (`202609230004_board_widgets.sql:4`), bypassed in replica mode.
- Root's live audit found 7 orphan Playground boards (0 items) and 4 orphan preferences among 118 FKs, then archived and removed those 11 rows; root reported live 10/68/50 and 118 valid FKs afterward. This agent did not perform that orphan-row audit.
- SABRE rollback (`supabase/scripts/sabre_demo_state.py:55-56,171-176`) snapshots both Playground tables and deletes child before parent; no static evidence implicates it in these rows.
- No production schema or application interface changed. New cleanup targets only guarded fixture IDs; Storage listing refuses a full 1,000-entry page rather than silently truncating deletion.

## Checks actually run
- `python3 -m unittest discover -s supabase/scripts -p test_recovery.py -v` — 8/8 pass with temporary files and mocks; no Docker or DB.
- `eslint` on both fixture files, `prettier --check` on both, `tsc --noEmit -p tsconfig.json`, and `git diff --check` — all pass.
- New Chromium `fixture-cleanup.spec.ts` — 2/2 pass; its finally blocks confirmed identical before/after client, project and SABRE project counts. New-file ESLint, Prettier and TypeScript checks pass.
- Initial FK audit was read-only; this turn ran only the guarded new backend spec on the local stack, with no page or screenshots.

## Risks and next action
- Root reported the disposable restore completed with four Auth logins, 118 valid FKs and 237 file hashes; this agent did not run it. Root adds the new spec to CI and owns remaining docs/final audit.
- Ownership released: listed files; no active process.
