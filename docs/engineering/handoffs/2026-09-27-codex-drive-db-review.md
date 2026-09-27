# Drive-channel backend review

- Date: 2026-09-27 · Agent: Codex reviewer · State: reviewed, checks passed, two corrections required.
- Scope: Drive migration/RPC, pgTAP, generated types, seed and SABRE scripts/tests, backend docs. Read-only code review; this report is the only changed file.

## Ranked findings
- [HIGH] `supabase/scripts/sabre_demo_state.py:115,172` — the live `phase=complete` checkpoint has no `project_drive_links` in either snapshot and no backfill layer; `layer_tables` omits it, while `rollback_sql` disables FK triggers before deleting demo projects. Four demo-created Drive rows can remain orphaned after removal. Refuse removal unless the table is covered or safely accounted for, and explicitly remove expected added link rows in rollback.
- [LOW] `supabase/migrations/202609270011_project_drive_links_by_channel.sql:45` — `p_channel NOT IN (...)` evaluates to NULL when the argument is NULL. Confirmed `set_project_drive_link(existing_project,NULL,'')` succeeds and audits instead of rejecting an unknown channel. Use an explicit NULL check in a forward migration and cover it in pgTAP.

## Evidence and limits
- Targeted `project_drive_link.test.sql`: 38/38 passed in a transaction ending with ROLLBACK.
- `python3 -B -m unittest supabase.tests.test_sabre_demo supabase.demo.sabre.test_sabre_rollback -v`: 20/20 passed.
- `python3 -B supabase/tests/sabre_demo_http_test.py`: all 42 printed checks passed against the active 10-client/68-project/50-SABRE overlay, including client/designer Drive REST isolation.
- Generated fixture inspection: 10 clients, 25 projects, four client links, two internal links; generated `seed.sql` has six Drive RPC calls. Canonical `verify_seed.py` could not run against the overlay.
- Local publication has INSERT/UPDATE enabled and DELETE disabled. `authenticated` lacks SELECT on `updated_by`; installed `realtime.apply_rls` excludes nonselectable columns from change payloads. No live WebSocket assertion was run.
- Migration moves old non-null `projects.drive_url` rows to `client`; no current nonhistorical Supabase caller uses the old column/RPC shape. `git diff --check` passed.
- Next action: orchestrator adds the forward NULL fix and a migration-safe SABRE removal guard/cleanup, then reruns focused checks; frontend and full integration remain separately owned.
