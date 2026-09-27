# Local staging rehearsals

Two isolated rehearsals use the pinned official self-hosted Supabase Docker distribution plus
this repo's `web` and `media` images. The default `minio` mode retains the historical S3
rehearsal and its data. `STAGING_STORAGE=file` selects the production-shaped filesystem Storage
mode. Each mode has its own compose projects, containers, ports, generated secrets and storage,
so the local development stack and the other staging mode are left intact.

This directory is **not** part of the application. Nothing here is imported by `apps/web` or
`apps/media`, and nothing under it is ever a deploy target — it only rehearses the topology
recorded here.

**Production decision, 2026-09-27:** creative work lives in Miro and R2 is no longer required.
The [current production target](../../docs/operations/production.md) uses persistent filesystem
Storage for remaining application uploads. The new `file` configuration has passed local upload, canonical role and browser checks; see the
[current verification record](../../docs/verification/preproduction-hardening-2026-09-27.md).
Production TLS, SMTP and off-host recovery still need execution before release. The retained MinIO results remain historical compatibility evidence.

## Layout

| Path | Tracked? | What |
| --- | --- | --- |
| `README.md` | yes | this file |
| `compose.supabase.override.yml` | yes | historical MinIO ports, container names and S3 Storage settings — layered on upstream's base and S3 compose files |
| `compose.filesystem.override.yml` | yes | isolated filesystem mode ports and container names, plus the Storage size limit — layered on upstream's base compose file only |
| `compose.app.yml` | yes | standalone `web`/`media` staging services, with optional `WEB_IMAGE`/`MEDIA_IMAGE` release references |
| `scripts/stage.sh` | yes | the setup/run/verify script — see `./scripts/stage.sh` with no arguments for the command list |
| `scripts/provision_fixtures.py` | yes | fixture Auth passwords + Storage objects for the canonical dataset, run after `supabase/seed.sql` is applied with `psql`; see "Canonical dataset" below |
| `.upstream/` | **no** (gitignored) | pristine sparse checkout of `supabase/supabase`'s `docker/` directory at the pinned commit — reference only, never run in place |
| `.work/` | **no** (gitignored) | generated working copy: `.work/docker/` (a disposable copy of `.upstream/docker/`, including the Postgres/MinIO bind-mount data), `.work/.env` (mode 0600, every generated secret), `.work/artifacts/` (test outputs, response headers, downloaded objects) |
| `.work-file/` | **no** (gitignored) | independent filesystem mode working copy: generated secrets, Postgres data and test artifacts; Storage bytes live in the project-scoped Docker volume `dawes-staging-file_staging-storage` |

`.upstream/` is the shared vendor reference, checked out once and left alone. `prepare` copies it
into the selected mode's work directory. MinIO mode can overwrite it with `--force`, which
deletes its local data. Filesystem mode refuses `--force`: its separately stored Storage volume
and Postgres data must be retained or explicitly removed together. Neither mode's work directory is a deploy target.

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

## Ports (127.0.0.1 only)

| Service | MinIO default | Filesystem `STAGING_STORAGE=file` |
| --- | --- | --- |
| web | 3103 | 3113 |
| Supabase gateway (Envoy, aliased `kong`) | 56010 | 56110 |
| Postgres (`db`, direct) | 56011 | 56111 |
| MinIO API / console | 56012 / 56013 | absent |
| media | 56014 | 56114 |

Both modes keep Studio and Supavisor unpublished. The Realtime container has the upstream
`realtime-dev.supabase-realtime` network alias, which Envoy needs for WebSocket routing.

Supavisor (the pooler) publishes no host port at all in this rehearsal (`ports: !override []`) —
see "What proved wrong or missing" for why. Verified free with `lsof -iTCP:<port> -sTCP:LISTEN`
before use. No container, volume or network here is named `dawes-studios*`,
`supabase_*_dawes-studios*`, `dawes-web-acceptance`, `creative-canvas-*` or `*Meraki*`, and none of
the blocked ports (55421-55430, 3003, 3004, 3000, 5432, 9000/9001) are touched.

## Commands

```bash
cd deploy/staging

./scripts/stage.sh fetch                 # once: sparse-clone the pinned upstream commit
./scripts/stage.sh prepare                # generate secrets + .work/ (refuses to clobber; --force deletes data)
./scripts/stage.sh up                     # pull images, start the Supabase stack, wait for health
./scripts/stage.sh migrate                # supabase db push against the staging Postgres; lists recorded versions
./scripts/stage.sh app-build               # build web/media with mode-specific local tags
./scripts/stage.sh app-up                  # start web/media from selected images; does not build
./scripts/stage.sh verify                  # header/health checks (release checklist step 4)
./scripts/stage.sh bootstrap               # first agency account, the way production creates one
./scripts/stage.sh storage-test            # TUS + standard upload, SHA-256, anon-denied
./scripts/stage.sh provision-fixtures      # fixture Auth passwords + Storage objects (run supabase/seed.sql with psql first)

./scripts/stage.sh status                  # docker compose ps for both projects
./scripts/stage.sh down                    # stop (not remove) both projects; prints teardown commands

STAGING_STORAGE=file ./scripts/stage.sh prepare   # independent .work-file/ and ports
STAGING_STORAGE=file ./scripts/stage.sh up
STAGING_STORAGE=file ./scripts/stage.sh app-build
STAGING_STORAGE=file ./scripts/stage.sh app-up
STAGING_STORAGE=file ./scripts/stage.sh status
STAGING_STORAGE=file ./scripts/stage.sh down      # stop only; retain Postgres and Storage data
```

Apply `STAGING_STORAGE=file` to every command for that mode. `file` layers only
`docker-compose.yml` and `compose.filesystem.override.yml`; it keeps upstream's
`STORAGE_BACKEND=file` and `FILE_STORAGE_BACKEND_PATH=/var/lib/storage`. Both `storage` and
`imgproxy` mount the project-scoped named volume `dawes-staging-file_staging-storage` at that
path. This replaces upstream's host bind mount because macOS Docker shared directories lack the
extended attributes that Storage writes on upload (`ENOTSUP`). The volume remains in Docker's
Linux filesystem and persists across container replacement. It does not include
`docker-compose.s3.yml`, MinIO or external S3 credentials. The new mode sets
`FILE_SIZE_LIMIT=52428800` (50 MiB); the retained
MinIO mode keeps its historical 1 GiB limit. The upstream `S3_PROTOCOL_ACCESS_KEY_*` values
are generated in both modes for Supabase's own protocol endpoint, not an external S3 provider.

For release rehearsals, export `WEB_IMAGE` and `MEDIA_IMAGE` as immutable image digest references
before `app-up`, such as `registry.example.com/web@sha256:<digest>`. The MinIO mode uses
`:staging` local image tags, while the filesystem mode generates separate `:staging-file` tags.
The root `compose.yaml` uses the same two
selectors with `:local` defaults. Build-time `NEXT_PUBLIC_*` values must match the image being
selected; a different gateway or media URL requires a separately built image.

`python3 -m unittest discover -s deploy/staging/tests -v` checks both resolved Compose modes
with inert dummy values, image selection and isolated prepare/stop behavior without starting
containers. The file mode's executed runtime checks are recorded in the verification record linked above.

`stage.sh` never runs `supabase/seed.sql`, anything under `supabase/scripts/` or `supabase/demo/`,
`supabase start/stop/db reset`, or `supabase/scripts/local_stack.py`. `migrate` applies
`supabase/migrations/` only, exactly as `docs/operations/production.md` prescribes.

### Stop, resume, full teardown

`down` calls `stop` on the selected mode's two compose projects; containers, images and volumes
remain. Resume with `up` then `app-up` using the same `STAGING_STORAGE` value. `prepare` is not
needed again while that mode's `.env` exists. `down` prints mode-specific `down -v` teardown
commands; do not run them as part of a restart or release rehearsal.

## Secrets

`scripts/stage.sh prepare` generates every secret listed in `docs/operations/production.md`
("Generate a fresh value for every secret the guide lists") the same way
`.upstream/docker/utils/generate-keys.sh` does — `openssl rand`, and HS256 JWTs for `ANON_KEY`/
`SERVICE_ROLE_KEY` signed with a freshly generated `JWT_SECRET`. Everything lands only in
the selected mode's `.env`, created with `chmod 600`. No command in `stage.sh` prints a secret
value; `verify` and the test commands write response headers/bodies to that mode's ignored
`artifacts/` directory and print pass/fail lines, not credentials. The `file` mode's working
directory has mode 0700. These are rehearsal-only secrets with no production
validity; nothing here is reused for the real deployment.

## What `docs/operations/production.md` got wrong or missing

Found while wiring this rehearsal against the actual fetched `docker/` tree (grepped the full
directory for each variable before relying on it — see `compose.supabase.override.yml`'s
comments for the exact evidence):

- **`FILE_SIZE_LIMIT` is not an environment variable in upstream's `docker-compose.yml`.** It's
  hardcoded to `52428800` on the `storage` service (line 372 at the pinned commit). Setting it in
  `.env` does nothing; it needs a compose-level override, which both staging overrides provide.
- **`TUS_ALLOW_S3_TAGS` is not wired into any upstream compose file at all** (`docker-compose.yml`,
  `docker-compose.s3.yml`, or any override under `docker/`) despite being a real, documented
  `storage-api` setting (`docker/CONFIG.md`). It also needs a compose-level addition, not just an
  `.env` value. This setting belongs to the retained S3 rehearsal only.
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

The commands and outcomes in this section describe the historical MinIO mode. For filesystem
mode, use `dawes-staging-file-db`, prefix `stage.sh` commands with `STAGING_STORAGE=file`, and
point browser tests at port 3113 with the filesystem mode's generated credentials.
Run `python3 supabase/scripts/verify_seed.py --staging-file` for that mode.

`supabase/seed.sql` applies cleanly to this rehearsal's self-hosted `auth` schema with plain
`psql` — its `insert into auth.users`/`auth.identities` column lists are a subset of what
`supabase/gotrue:v2.196.0` (the pinned staging Auth image) actually has, so nothing was rejected:

```bash
docker exec -i dawes-staging-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /dev/stdin < supabase/seed.sql
./scripts/stage.sh app-up                  # the media worker must be running for the covers
./scripts/stage.sh provision-fixtures
python3 supabase/scripts/verify_seed.py --staging
```

The seed writes its design boards, rounds, client versions and comments through the real RPCs
under each fixture user's identity, so it needs the current migrations (`migrate`) first and an
empty dataset: it is not re-applied over itself. Re-seeding this rehearsal means clearing its
application tables and fixture Auth users first, which is acceptable only because the rehearsal is
disposable.

`provision_fixtures.py` is a thin wrapper, not a copy: it imports `ensure_fixture_object`
(`supabase/scripts/fixture_provisioning.py`) and the content generators
(`supabase/scripts/fixture_media.py`) read-only. It does not call
`supabase/scripts/provision_local_auth.py` itself — that script calls `supabase status` (the
CLI-tracked local project only) and hard-refuses any URL other than the local stack or its
restore-drill copy, neither of which is this staging rehearsal. The one secret it mints (the
fixture password) is written to the selected mode's `fixtures.env` (mode 0600, gitignored)
*before* it is PUT to
any user, so an interrupted run is always safely resumable, and every run re-applies it to every
fixture user. Besides the passwords and the 70 brand files it posts one cover per project to the
staging media worker (`MEDIA_PORT`, 56014 or 56114) under the agency session, so each cover is sanitized and
attested, and it attaches the delivery PDF (`fixture_media.delivery_pdf`) and marks that project
delivered, as the local provisioning does. It exits non-zero unless the counts are 10 / 25.
Verified 2026-09-27 on the Miro-model seed: `verify_seed.py --staging` PASS with 29 boards, 30
rounds, 22 client versions, 4 Drive links, 25 covers (14 client-visible) and 110 file downloads;
the four canonical Playwright specs (`canonical-workspaces`, `workspace`, `design-audit`,
`workspace-actions`) passed 7/7 against this staging seed the same day.

**Pointing the browser suite at staging.** `apps/web/tests/e2e/test-support.ts` uses
`supabase/.env.local` only for the local stack. When `ACCEPTANCE_SUPABASE_URL` declares another
backend, every credential must come from the environment: `ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY`,
`ACCEPTANCE_SUPABASE_ANON_KEY` and `ACCEPTANCE_DEMO_PASSWORD`. Local credentials are never mixed
with another backend's URL. Set `PLAYWRIGHT_BASE_URL=http://localhost:3103` for the staging web
container, and exclude `sabre-demo.spec.ts`, which needs the local demo overlay.

## Historical MinIO results

See `docs/engineering/handoffs/2026-09-23-staging-rehearsal.md` for the pass/fail results of
`verify`, `bootstrap` and `storage-test`, the exact commands run, and what remains unproven, and
`docs/engineering/handoffs/2026-09-23-staging-j10-browser.md` for the canonical dataset and J10
browser-suite rehearsal in this section.
