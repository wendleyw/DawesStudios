# Drive links split by channel — database side
- Updated: 2026-09-27T00:00:00Z · Agent: Claude Code · Model: Sonnet
- State: historical Claude implementation report; superseded by [Codex integration](../../verification/drive-links-recovery-2026-09-27.md).
- Objective: split `projects.drive_url` into channel-isolated `internal`/`client` links. Owned paths: `supabase/migrations/`, `supabase/tests/database/project_drive_link.test.sql`, `supabase/scripts/{build_seed,verify_seed,sabre_demo,sabre_demo_state}.py`, `supabase/database.types.ts`, `docs/architecture/backend.md`.

## Changes
- `supabase/migrations/202609270011_project_drive_links_by_channel.sql` — new `public.project_drive_links` table, RLS (`can_produce`/`can_client_channel` per channel), column grants hiding `updated_by`, data move (old non-null links → `client` rows), drops `projects.drive_url`/its constraint, replaces `set_project_drive_link(uuid,text)` with `(p_project_id,p_channel,p_url)`, adds table to `supabase_realtime`.
- `supabase/tests/database/project_drive_link.test.sql` — rewritten: channel isolation for designer/client/unassigned-designer, unknown channel, direct insert/update refused, `updated_by` unreadable, audits carry `channel`.
- `supabase/scripts/build_seed.py` — RPC call passes `p_channel`; new `INTERNAL_DRIVE_LINK_PROJECTS=(2,7)` with `internal_drive_url()`; manifest now stores `drive_links:{client,internal}`.
- `supabase/scripts/verify_seed.py` — reads `project_drive_links` instead of `projects.drive_url`; asserts per-channel manifest match, client sees client-only, added designer sees internal-only for assigned projects.
- `supabase/scripts/sabre_demo.py` — RPC call passes `p_channel:'client'`; report's `drive_links` count now reads `project_drive_links`. Left the already-committed `p_month` hunk untouched.
- `supabase/scripts/sabre_demo_state.py` — added `public.project_drive_links` to `SCOPES` (needed for the count above and future rollback fidelity).
- `docs/architecture/backend.md` — RPC table row + rewrote the Drive-link paragraph for the new table/RPC.

- apps/web still references `projects.drive_url` in `features/assets/asset-data.ts`, `tests/e2e/canonical-workspaces.spec.ts` — **interface change for the web agent**: read from `project_drive_links` (channel-scoped) and call `set_project_drive_link` with `p_channel`.
- `supabase/tests/test_sabre_demo.py`, `supabase/tests/sabre_demo_http_test.py`, `supabase/demo/sabre/test_sabre_rollback.py` still assert on `drive_url`/old RPC shape — not in this task's owned-path list; left unedited, flagged as a risk below.

## Checks actually run
- `supabase migration up --local` — applied; existing links preserved as 8 client rows (incl. SABRE overlay).
- `psql < project_drive_link.test.sql` directly — **38/38 pass**.
- `npm run db:test` (full suite) — **Files=25, Tests=1018, 5 failed**, all in `access_and_workflows.test.sql` (SABRE overlay count mismatches: 68 vs 25 projects etc.) — **not drive-related**.
- `npm run db:types` — regenerated, `project_drive_links` present.
- `python3 -m py_compile` on all 4 edited scripts — clean.
- `python3 supabase/scripts/build_seed.py` — regenerated `seed.sql`/`fixtures.json` (not loaded); 6 `set_project_drive_link` calls (4 client + 2 internal).
- `python3 supabase/scripts/verify_seed.py` — **fails at the first project-count assertion** (25 expected vs live 68, from the SABRE overlay) — not drive-related; drive assertions further down were not reached.
- `python3 supabase/scripts/sabre_demo.py status` — ran clean against live overlay, `"drive_links": 5`.

- The three unedited sabre test files above will likely fail against the new signature/shape until someone in scope updates them.
- `verify_seed.py` cannot be exercised end-to-end locally while the SABRE overlay is live (pre-existing condition, documented in CLAUDE.md).
- No commits made in that session. Ownership released; Codex resolved these integration risks in its recovery record.
