# Local staging rehearsal — self-hosted Supabase + MinIO(R2) + web/media

- Updated: 2026-09-23T23:10:00Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: verified · Owned paths: deploy/staging/**, .gitignore (one block), this report
- Objective: LOCAL rehearsal of docs/operations/production.md's topology with real evidence
## Changes
- deploy/staging/{README.md,compose.supabase.override.yml,compose.app.yml,scripts/stage.sh} (new); .gitignore +2 lines ignoring deploy/staging/{.upstream,.work}/
## Decisions
- Supavisor unused for migrations (undocumented tenant-user format) — `db` published directly on 127.0.0.1 instead; pooler's own ports dropped (`!override []`), not left on 5432/6543
- compose.app.yml is standalone, mirrors compose.yaml's web/media (staging tags/ports) — never reads or edits compose.yaml
## Checks run (upstream pinned d51ed9f451b0bf870c86a3427cc321511dbe73ab; ports 127.0.0.1: gateway 56010, db 56011, minio 56012/56013, web 3103, media 56014 — pre-verified free with lsof, no protected name/port touched)
- `stage.sh fetch` — sparse clone at pinned SHA — PASS
- `stage.sh up` — 12/12 Supabase containers healthy — PASS
- `stage.sh migrate` (needs PGSSLMODE=disable, see gaps) — 50/50 local migration versions recorded in supabase_migrations.schema_migrations — PASS
- `stage.sh app-build && stage.sh app-up` — dawes-studios-{web,media}:staging built; both containers healthy on 3103/56014 — PASS
- `stage.sh verify` — GET /login 200; CSP has staging http+ws origins; HSTS present; no X-Powered-By; media GET /health 200 — 6/6 PASS
- `stage.sh bootstrap` — admin-created 2 users; SQL `update profiles set role='agency'`; password grant; agency GET /rest/v1/profiles returns both profiles (200); POST /auth/v1/signup refused (422) — 6/6 PASS
- `stage.sh storage-test` — TUS PATCH 55 MiB (>50MB) to internal-assets -> 204; standard upload -> 200; both SHA-256 match on download; both found via `mc ls` in MinIO; anonymous read -> 400 (denied) — 8/8 PASS
- `stage.sh down` — all staging containers Exited (not removed); volumes + Postgres bind-mount retained — PASS
## production.md gaps found
- `FILE_SIZE_LIMIT`/`TUS_ALLOW_S3_TAGS` aren't `.env`-driven upstream (hardcoded 52428800 / absent entirely) — needed a compose-level override, added in compose.supabase.override.yml
- `supabase db push --db-url` needs env `PGSSLMODE=disable`; `?sslmode=disable` on the URL alone reproducibly did not work (upstream db has no TLS)
- Pooler needs an undocumented tenant-qualified username; used the guide's own named alternative (direct db port) instead
- Envoy, not Kong, is the default gateway at this commit; undocumented but routed every exercised path correctly
- CONFIRMED (not just inspected): apps/web's CSP/HSTS need no runtime `NEXT_PUBLIC_*` — compose.yaml's build-arg-only shape is already correct
## Risks and next action
- Unproven: Studio reachability (never exposed, by design), Envoy/Kong parity beyond exercised paths, backup/restore drill, rate limiting, real SMTP send (no mail catcher in this distribution), pooler's runtime connection path
- Next: orchestrator decides whether to also rehearse the pooler connection string and a Caddy/nginx TLS proxy in front of this stack
- Ownership: deploy/staging/** released; staging containers stopped (not removed) — resume with `stage.sh up && stage.sh app-up`
