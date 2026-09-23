# Local staging rehearsal

A reproducible, disposable rehearsal of the [production topology](../../docs/operations/production.md):
the official self-hosted Supabase Docker distribution, with MinIO standing in for Cloudflare R2 as
the S3 Storage backend, plus this repo's `web` and `media` images. It runs under its own compose
project names, its own image tags, and a reserved host port range, alongside the existing local
dev stack (`dawes-studios*`, `supabase_*_dawes-studios*`) without touching it. Authorized
2026-09-23; see the root `CLAUDE.md` "Product and Delivery Requirements".

This directory is **not** part of the application. Nothing here is imported by `apps/web` or
`apps/media`, and nothing under it is ever a deploy target — it only rehearses the topology
described in `docs/operations/production.md` before that guide is followed for real.

## Layout

| Path | Tracked? | What |
| --- | --- | --- |
| `README.md` | yes | this file |
| `compose.supabase.override.yml` | yes | ports (127.0.0.1, reserved range), container names, the two storage settings upstream hardcodes/omits — layered on the upstream compose files |
| `compose.app.yml` | yes | standalone `web`/`media` staging services (does not read or depend on the repo-root `compose.yaml`) |
| `scripts/stage.sh` | yes | the setup/run/verify script — see `./scripts/stage.sh` with no arguments for the command list |
| `scripts/provision_fixtures.py` | yes | fixture Auth passwords + Storage objects for the canonical dataset, run after `supabase/seed.sql` is applied with `psql`; see "Canonical dataset" below |
| `.upstream/` | **no** (gitignored) | pristine sparse checkout of `supabase/supabase`'s `docker/` directory at the pinned commit — reference only, never run in place |
| `.work/` | **no** (gitignored) | generated working copy: `.work/docker/` (a disposable copy of `.upstream/docker/`, including the Postgres/MinIO bind-mount data), `.work/.env` (mode 0600, every generated secret), `.work/artifacts/` (test outputs, response headers, downloaded objects) |

`.upstream/` is the vendor reference, checked out once and left alone. `.work/` is what actually
runs and is freely regenerated; `scripts/stage.sh prepare` builds it from `.upstream/` and refuses
to overwrite an existing one unless you pass `--force`.

## Pinned upstream

- Repository: `github.com/supabase/supabase`, directory `docker/`
- Commit: `d51ed9f451b0bf870c86a3427cc321511dbe73ab` (`PINNED_SHA` in `scripts/stage.sh`)
- Fetched with a shallow (`--depth 1`), sparse (`docker/` only), cone-mode checkout — see
  `scripts/stage.sh fetch`.
- Image versions at this commit (`.upstream/docker/versions.md`, 2026-09-09 entry): `supabase/postgres:17.6.1.136`,
  `supabase/gotrue:v2.196.0`, `postgrest/postgrest:v14.17`, `supabase/realtime:v2.134.10`,
  `supabase/storage-api:v1.74.0`, `darthsim/imgproxy:v3.31.4`, `supabase/postgres-meta:v0.99.0`,
  `supabase/edge-runtime:v1.76.2`, `supabase/supavisor:2.9.12`, `supabase/studio:2026.09.07-sha-7996410`,
  `envoyproxy/envoy:v1.39.1` (the default gateway at this commit; Kong is now an opt-in override,
  `docker-compose.kong.yml`, not used here). Postgres major version (17) matches this repo's
  `supabase/config.toml`.

## Ports (127.0.0.1 only, reserved 56000-56999 range + explicit web port)

| Port | Service | Notes |
| --- | --- | --- |
| 3103 | web | explicit requirement; matches `SITE_URL`/`APP_ORIGIN`/CSP |
| 56010 | Supabase gateway (Envoy, aliased `kong`) | `/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1`; Studio stays unpublished, same as production |
| 56011 | Postgres (`db`, direct) | added because this rehearsal bypasses the pooler for migrations — see "What proved wrong or missing" |
| 56012 / 56013 | MinIO S3 API / console | for `mc`/inspection only; the app and Storage reach MinIO over the compose network, never through these |
| 56014 | media | |

Supavisor (the pooler) publishes no host port at all in this rehearsal (`ports: !override []`) —
see "What proved wrong or missing" for why. Verified free with `lsof -iTCP:<port> -sTCP:LISTEN`
before use. No container, volume or network here is named `dawes-studios*`,
`supabase_*_dawes-studios*`, `dawes-web-acceptance`, `creative-canvas-*` or `*Meraki*`, and none of
the blocked ports (55421-55430, 3003, 3004, 3000, 5432, 9000/9001) are touched.

## Commands

```bash
cd deploy/staging

./scripts/stage.sh fetch                 # once: sparse-clone the pinned upstream commit
./scripts/stage.sh prepare                # generate secrets + .work/ (refuses to clobber; --force to rotate)
./scripts/stage.sh up                     # pull images, start the Supabase stack, wait for health
./scripts/stage.sh migrate                # supabase db push against the staging Postgres; lists recorded versions
./scripts/stage.sh app-build               # build dawes-studios-web:staging / dawes-studios-media:staging
./scripts/stage.sh app-up                  # start the staging web/media containers
./scripts/stage.sh verify                  # header/health checks (release checklist step 4)
./scripts/stage.sh bootstrap               # first agency account, the way production creates one
./scripts/stage.sh storage-test            # TUS + standard upload through MinIO, SHA-256, anon-denied
./scripts/stage.sh provision-fixtures      # fixture Auth passwords + Storage objects (run supabase/seed.sql with psql first)

./scripts/stage.sh status                  # docker compose ps for both projects
./scripts/stage.sh down                    # stop (not remove) both projects; prints teardown commands
```

`stage.sh` never runs `supabase/seed.sql`, anything under `supabase/scripts/` or `supabase/demo/`,
`supabase start/stop/db reset`, or `supabase/scripts/local_stack.py`. `migrate` applies
`supabase/migrations/` only, exactly as `docs/operations/production.md` prescribes.

### Stop, resume, full teardown

`down` stops both compose projects; containers, images and volumes (Postgres data dir, MinIO data)
are retained. Resume with `up` then `app-up` — `prepare` is not needed again as long as
`.work/.env` still exists. `down`'s own output prints the exact `docker compose ... down -v`
commands for a full, irreversible teardown (destroys the Postgres bind-mount and the MinIO
volume), followed by `rm -rf .work` to discard the generated secrets.

## Secrets

`scripts/stage.sh prepare` generates every secret listed in `docs/operations/production.md`
("Generate a fresh value for every secret the guide lists") the same way
`.upstream/docker/utils/generate-keys.sh` does — `openssl rand`, and HS256 JWTs for `ANON_KEY`/
`SERVICE_ROLE_KEY` signed with a freshly generated `JWT_SECRET`. Everything lands only in
`.work/.env`, created with `chmod 600`. No command in `stage.sh` prints a secret value; `verify`
and the test commands write response headers/bodies to `.work/artifacts/` (also gitignored) and
print pass/fail lines, not credentials. These are rehearsal-only secrets with no production
validity; nothing here is reused for the real deployment.

## What `docs/operations/production.md` got wrong or missing

Found while wiring this rehearsal against the actual fetched `docker/` tree (grepped the full
directory for each variable before relying on it — see `compose.supabase.override.yml`'s
comments for the exact evidence):

- **`FILE_SIZE_LIMIT` is not an environment variable in upstream's `docker-compose.yml`.** It's
  hardcoded to `52428800` on the `storage` service (line 372 at the pinned commit). Setting it in
  `.env` does nothing; it needs a compose-level override, which `compose.supabase.override.yml`
  provides. The production guide's table lists it alongside real `${VAR}`-driven settings as if
  it were one too — it isn't, at least not at this commit.
- **`TUS_ALLOW_S3_TAGS` is not wired into any upstream compose file at all** (`docker-compose.yml`,
  `docker-compose.s3.yml`, or any override under `docker/`) despite being a real, documented
  `storage-api` setting (`docker/CONFIG.md`). It also needs a compose-level addition, not just an
  `.env` value.
- **The pooler's connection format isn't in the production guide.** Reaching Postgres through
  Supavisor needs a tenant-qualified username (`postgres.<POOLER_TENANT_ID>`-shaped, session mode
  on `${POSTGRES_PORT}` or transaction mode on `${POOLER_PROXY_PORT_TRANSACTION}`); the guide's
  migration command (`supabase db push --db-url ...`) doesn't say which host/port/user to use. This
  rehearsal takes the task's named alternative instead: publish `db` directly on a 127.0.0.1 port
  and connect as `postgres` with `POSTGRES_PASSWORD`, bypassing the pooler for migrations entirely.
  Production still needs someone to resolve the actual pooler connection string if the pooler is
  meant to be used at runtime (the app itself connects to Postgres only through PostgREST/Storage/
  Auth, never directly, so this only matters for one-off admin/migration access).
- **Envoy, not Kong, is the default gateway** at this commit (`docker-compose.yml`'s `api-gw`
  service, `envoyproxy/envoy:v1.39.1`; `docker-compose.kong.yml` is an opt-in override the guide
  doesn't mention). Routing behavior (paths, headers) appears compatible with the guide's Kong-era
  assumptions, but this rehearsal did not diff the two gateways' configs line by line.
- **`apps/web`'s CSP/HSTS do not need `NEXT_PUBLIC_*` as runtime env vars — confirmed, not just
  inspected.** `apps/web/next.config.ts`'s `headers()` reads `process.env.NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_MEDIA_URL` at request time, and `next.config.ts` loads directly in the Next.js
  server process rather than through webpack's build-time substitution, so it was genuinely unclear
  whether the standalone server's runtime needs these as real environment variables (`compose.yaml`
  only ever sets them as build args, never at runtime). `compose.app.yml` deliberately mirrors
  `compose.yaml` exactly — build args only — rather than adding them defensively, so this could be
  observed rather than papered over: `verify`'s saved headers show the CSP correctly scoped to the
  staging origins (`http://localhost:56010`, `ws://localhost:56010`, `http://localhost:56014`)
  without any runtime `NEXT_PUBLIC_*`. Next.js's standalone output evidently restores them into
  the server process on its own. `compose.yaml`'s current shape is correct as written.
- **`supabase db push --db-url` needs `PGSSLMODE=disable` for this distribution, not just a
  `?sslmode=disable` query parameter.** Upstream's `db` service has no TLS configured out of the
  box; the CLI (v2.98.2) otherwise attempts TLS first and the server refuses it —
  `tls error (server refused TLS connection)`, reproduced twice against this exact stack.
  `?sslmode=disable` on the URL alone did **not** fix it (identical error); setting the
  libpq-standard `PGSSLMODE=disable` environment variable did. `scripts/stage.sh migrate` sets
  both. The production guide's migration command has neither, and production Postgres access must
  still require real TLS — this only applies to an unencrypted local rehearsal over 127.0.0.1.
- **The pooler's connection format isn't in the production guide.** Reaching Postgres through
  Supavisor needs a tenant-qualified username (`postgres.<POOLER_TENANT_ID>`-shaped, session mode
  on `${POSTGRES_PORT}` or transaction mode on `${POOLER_PROXY_PORT_TRANSACTION}`); the guide's
  migration command (`supabase db push --db-url ...`) doesn't say which host/port/user to use. This
  rehearsal takes the task's named alternative instead: publish `db` directly on a 127.0.0.1 port
  and connect as `postgres` with `POSTGRES_PASSWORD`, bypassing the pooler for migrations entirely.
  Production still needs someone to resolve the actual pooler connection string if the pooler is
  meant to be used at runtime (the app itself connects to Postgres only through PostgREST/Storage/
  Auth, never directly, so this only matters for one-off admin/migration access).
- **Envoy, not Kong, is the default gateway** at this commit (`docker-compose.yml`'s `api-gw`
  service, `envoyproxy/envoy:v1.39.1`; `docker-compose.kong.yml` is an opt-in override the guide
  doesn't mention). It routed every path this rehearsal exercised (`/auth/v1/admin/users`,
  `/auth/v1/token`, `/auth/v1/signup`, `/rest/v1/profiles`, `/storage/v1/upload/resumable`,
  `/storage/v1/object/...`) correctly; this rehearsal did not diff the two gateways' configs line
  by line beyond that.
- **`cgr.dev/chainguard/minio-client`'s entrypoint is already `mc`.** `docker run ... sh -c "..."`
  fails with `` `sh` is not a recognized command `` because `sh -c "..."` is parsed as arguments to
  the image's default `mc` entrypoint, not as a shell invocation. `docker run --entrypoint sh ...`
  fixes it. Not a production.md item (that guide never runs `mc` directly), but the same upstream
  image `docker-compose.s3.yml`'s own `minio-createbucket` service uses, so worth recording here.
- **No SMTP is configured.** The upstream `.env.example` placeholder (`SMTP_HOST=supabase-mail`)
  refers to a mail-catcher container that this compose file doesn't define — any code path that
  actually sends email (invite, password recovery) is unproven here and would fail on a real send
  attempt. `bootstrap` avoids this entirely (admin-created user, `email_confirm: true`, password
  grant), matching the task's instructions, but it means email delivery itself stays unrehearsed.

## Canonical dataset (release checklist step 4)

`supabase/seed.sql` applies cleanly to this rehearsal's self-hosted `auth` schema with plain
`psql` — its `insert into auth.users`/`auth.identities` column lists are a subset of what
`supabase/gotrue:v2.196.0` (the pinned staging Auth image) actually has, so nothing was rejected:

```bash
docker exec -i dawes-staging-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /dev/stdin < supabase/seed.sql
./scripts/stage.sh provision-fixtures
```

`provision_fixtures.py` is a thin wrapper, not a copy: it imports `ensure_fixture_object`
(`supabase/scripts/fixture_provisioning.py`) and the content generators
(`supabase/scripts/fixture_media.py`) read-only. It does not call
`supabase/scripts/provision_local_auth.py` itself — that script calls `supabase status` (the
CLI-tracked local project only) and hard-refuses any URL other than the local stack or its
restore-drill copy, neither of which is this staging rehearsal. The one secret it mints (the
fixture password) is written to `.work/fixtures.env` (mode 0600, gitignored) *before* it is PUT to
any user, so an interrupted run is always safely resumable. Verified: 10 clients / 25 projects,
13 fixture Auth passwords, 70 brand assets, 27 working assets (18 published).

**Pointing the browser suite at staging.** `apps/web/tests/e2e/test-support.ts` uses
`supabase/.env.local` only for the local stack. When `ACCEPTANCE_SUPABASE_URL` declares another
backend, every credential must come from the environment: `ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY`,
`ACCEPTANCE_SUPABASE_ANON_KEY` and `ACCEPTANCE_DEMO_PASSWORD`. Local credentials are never mixed
with another backend's URL. Set `PLAYWRIGHT_BASE_URL=http://localhost:3103` for the staging web
container, and exclude `sabre-demo.spec.ts`, which needs the local demo overlay.

## Results

See `docs/engineering/handoffs/2026-09-23-staging-rehearsal.md` for the pass/fail results of
`verify`, `bootstrap` and `storage-test`, the exact commands run, and what remains unproven, and
`docs/engineering/handoffs/2026-09-23-staging-j10-browser.md` for the canonical dataset and J10
browser-suite rehearsal in this section.
