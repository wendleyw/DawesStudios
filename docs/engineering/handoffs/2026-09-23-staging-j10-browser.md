# J10 browser suite rehearsal against local staging

- Updated: 2026-09-23T19:25:00Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: blocked · Owned paths: deploy/staging/** (provision_fixtures.py new, stage.sh +subcommand, README), this report
- Objective: load the canonical dataset into staging and run apps/web's Playwright suite against it (J10)

## Changes
- deploy/staging/scripts/provision_fixtures.py (new) — imports `ensure_fixture_object`/`fixture_media` from supabase/scripts read-only; never calls provision_local_auth.py (it hard-targets the CLI-tracked local stack)
- deploy/staging/scripts/stage.sh — new `provision-fixtures` subcommand; deploy/staging/README.md — documents it and the blocker below

## Decisions
- Password written to `.work/fixtures.env` (0600) before the PUT loop that sets it, so an interrupted run is resumable without a leaked/lost secret — none printed at any point

## Checks actually run
- `stage.sh up && stage.sh app-up && stage.sh verify` — 12/12 + 2/2 containers healthy, 6/6 verify PASS
- `docker exec -i dawes-staging-db psql ... -1 -f /dev/stdin < supabase/seed.sql` — 0 errors; log: deploy/staging/.work/artifacts/seed-apply.log
- `stage.sh provision-fixtures` — 13 passwords, 70 brand assets, 27 working assets (18 published), counts clients=10 projects=25 — PASS
- Counts: 10 clients / 25 projects / not run: 24 specs (25 minus excluded sabre-demo.spec.ts) / 0 passed / 0 failed / 0 skipped
- `ACCEPTANCE_SUPABASE_URL=http://127.0.0.1:56010 PLAYWRIGHT_BASE_URL=http://localhost:3103 npx playwright test --list` (apps/web) — every spec import throws before collection; log: deploy/staging/.work/artifacts/j10-browser-suite-blocked.log
- `stage.sh down` — staging stopped, volumes retained; local dev stack (55421-55430/3003, dawes-studios* containers) confirmed untouched

## Failure classification
- **Test harness limitation, not staging or app defect.** `apps/web/tests/e2e/test-support.ts` reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`/`DEMO_PASSWORD` only via `parseEnv(readFileSync(supabase/.env.local))`; only `ACCEPTANCE_SUPABASE_URL` is a real `process.env` read, and it's merely compared against the file's `SUPABASE_URL`, never substitutes for it. Staging's URL/keys/password cannot be declared without editing `supabase/.env.local`, which is off-limits here (local dev stack's own credential file). Error: `Acceptance tests mutate data and must run against the declared backend (http://127.0.0.1:56010)` at test-support.ts:19, for all 25 spec files.

## Risks and next action
- J10 has never been proven against a non-local backend. Next: give test-support.ts a real override path (env vars for the four credentials, same pattern as `ACCEPTANCE_SUPABASE_URL`) — apps/web/** is outside this task's owned paths — then re-run this same staging dataset (still loaded; not torn down) against it with one worker, excluding sabre-demo.spec.ts
- Also correct `apps/web/README.md`'s e2e section and `docs/operations/production.md` step 4, which both currently imply `ACCEPTANCE_SUPABASE_URL` alone suffices
- Ownership: deploy/staging/** released; staging containers stopped (not removed); staging Postgres/MinIO volumes and the canonical dataset + fixtures.env retained for the next attempt
