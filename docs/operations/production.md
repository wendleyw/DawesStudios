# Production deployment

Status: **not deployed.** This guide defines the production target and the release procedure.
Rehearse every step on a staging installation with the same topology before serving clients.
The local CLI stack described in the [operations runbook](README.md) is a fixture environment
and is never promoted to production.

## Topology

```text
Browser ── HTTPS ──► reverse proxy (TLS)
                      ├─ app.example.com   → web container       127.0.0.1:3003
                      ├─ api.example.com   → Supabase gateway    127.0.0.1:8000
                      └─ media.example.com → media container     127.0.0.1:55430

Self-hosted Supabase (official Docker distribution)
  Postgres · Auth · PostgREST · Realtime · Storage API · gateway   (Studio stays private)
  Storage API ── S3 protocol ──► Cloudflare R2 bucket (private)
```

**Why R2 sits behind Supabase Storage.** All authorization for files lives in Supabase Storage:
RLS on `storage.objects`, the per-bucket limits in the migrations, and short-lived signed URLs.
That authorization keeps unpublished and internal artifacts away from clients. With R2 as the
Storage *backend*, the bytes live in a durable, off-host bucket with no egress fees, while the
application code, policies and signed-URL behaviour stay exactly as tested. The application
never talks to R2 directly and must not get an R2 SDK or public R2 URLs. Cloudflare R2 is a
documented backend in the [Supabase S3 storage guide](https://supabase.com/docs/guides/self-hosting/self-hosted-s3).

Managed Supabase Cloud is the alternative. It removes Postgres operations, and the application
runs against it unchanged, but its Storage cannot use R2. If you choose it, skip the R2 section
and apply everything else.

## 1. Supabase

Install the [official self-hosted distribution](https://supabase.com/docs/guides/self-hosting/docker)
on the server, pin its image versions, and keep its database volume. Generate a fresh value for
every secret the guide lists before the first start: `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`,
JWT/API keys, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `REALTIME_DB_ENC_KEY`, `PG_META_CRYPTO_KEY`,
the Logflare tokens and the S3 protocol keys.

The local `supabase/config.toml` values are the tested behaviour. Carry them over like this:

| Behaviour | Local `config.toml` | Production setting |
| --- | --- | --- |
| Site URL | `site_url` | `SITE_URL=https://app.example.com` |
| Auth redirects | `additional_redirect_urls` | `ADDITIONAL_REDIRECT_URLS=https://app.example.com/auth/recovery,https://app.example.com/auth/invite**` |
| Access-token lifetime | `jwt_expiry = 900` | `JWT_EXPIRY=900`, which bounds the [revocation window](../architecture/permissions.md#revocation-cannot-reach-a-credential-that-was-already-issued) |
| Public sign-up | `enable_signup = true` (local tests only) | `DISABLE_SIGNUP=true`. The app has no sign-up screen; accounts come from agency invitations. |
| Email | Inbucket capture | Real `SMTP_*` provider, `ENABLE_EMAIL_AUTOCONFIRM=false` |
| Anonymous users | disabled | `ENABLE_ANONYMOUS_USERS=false` |
| Password policy | 12 characters; lower, upper, digit, symbol | Auth service `GOTRUE_PASSWORD_MIN_LENGTH=12`, plus the matching required-character setting (verify on staging) |
| Max rows per request | `max_rows = 1000` | `PGRST_DB_MAX_ROWS=1000` on the REST service |
| Upload ceiling | `file_size_limit = "1GiB"` | Storage `FILE_SIZE_LIMIT=1073741824`. The official default of 50 MB rejects video. |

Buckets, per-bucket size and MIME limits, RLS policies and the Realtime publication are all
created by the migrations. Do not create them by hand.

### R2 as the Storage backend

Create a **private** R2 bucket. Do not enable `r2.dev` or public custom-domain access. Create an R2
API token with object read and write access to that bucket only. Then set these on the `storage`
service:

```yaml
STORAGE_BACKEND: s3
GLOBAL_S3_BUCKET: dawes-studios-storage
GLOBAL_S3_ENDPOINT: https://<account-id>.r2.cloudflarestorage.com
GLOBAL_S3_PROTOCOL: https
GLOBAL_S3_FORCE_PATH_STYLE: "true"
AWS_ACCESS_KEY_ID: <r2-access-key-id>
AWS_SECRET_ACCESS_KEY: <r2-secret-access-key>
REGION: auto
TUS_ALLOW_S3_TAGS: "false"   # video uploads use TUS; R2 rejects S3 object tagging
FILE_SIZE_LIMIT: 1073741824
```

The application does not use Storage image transformations, so `imgproxy` may stay disabled. Add
an R2 lifecycle rule that aborts incomplete multipart uploads after a few days; abandoned
resumable uploads leave those parts behind.

### Migrations

Apply only `supabase/migrations/`, in order, from a trusted machine over a private connection:

```bash
supabase db push --db-url "postgresql://postgres:<password>@<private-host>:5432/postgres"
```

Take a database dump first (see backups). Migrations are forward-only.

**Never apply** `supabase/seed.sql`, anything under `supabase/scripts/` or `supabase/demo/`
(provisioning, reset, SABRE demo), fixture passwords, or the local `supautils.hint_roles`
workaround. That workaround exists only for local image `17.6.1.106`. Confirm your pinned image
returns SQLSTATE 42501 to anonymous calls, and never grant anonymous execution instead.

## 2. Application containers

Copy `.env.production.example` to the ignored `.env.production` and fill in real values:

| Variable | Used by | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | web (build time) | `https://api.example.com` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web (build time), media | Public anon key |
| `NEXT_PUBLIC_MEDIA_URL` | web (build time) | `https://media.example.com` |
| `SUPABASE_INTERNAL_URL` | web, media (server) | The gateway URL that is reachable from the containers |
| `SUPABASE_SERVICE_ROLE_KEY` | web invitation/removal routes, media | Private; never in a browser variable |
| `APP_ORIGIN` | web, media | `https://app.example.com` (exact origin) |
| `MEDIA_ALLOWED_ORIGINS` | media | Empty in production |

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --wait web media
docker compose exec media df -h /scratch   # needs at least 2 GiB free for video remuxing
```

`NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing them. Both services
bind to `127.0.0.1` and run read-only as non-root with every capability dropped. They are
reachable only through the proxy. Tag each release image with its commit
(`docker tag dawes-studios-web:local dawes-studios-web:<sha>`, and the same for media) so you
can roll back.

The 1 GiB video ceiling must agree in six places: the five listed in `compose.yaml` and
`FILE_SIZE_LIMIT` on the production Storage service.

## 3. Reverse proxy and TLS

Terminate TLS for the three hosts at the proxy. The proxy must pass WebSocket upgrades to the
gateway, because Realtime needs them, and it must not cap request bodies below the upload
ceiling. Caddy does both by default. With nginx, set `client_max_body_size` for the API and media
hosts and add the upgrade headers. Keep Studio, Postgres and the Supabase analytics endpoints off
the public interface, and reach them through an SSH tunnel.

## 4. Backups and recovery

- **Database:** take a nightly `pg_dump -Fc` of the `public`, `private`, `auth`, `storage` and
  `supabase_migrations` schemas (the same scope as `supabase/scripts/backup_local.py`). Encrypt it
  and store it off-host, with credentials separate from the production bucket.
- **Files:** after each dump, copy the R2 bucket to a second bucket or provider, for example with
  `rclone sync --backup-dir` so deletions stay recoverable. Copying *after* the dump means every
  object the dump references exists in the copy. Newer objects are harmless orphans on restore.
- **Drill:** restore the dump and the bucket copy into staging, then repeat the role checks
  (agency and client login, a forbidden private-design read, an authorized download with a
  matching SHA-256). The local `restore_drill.py` covers only the local filesystem backend.
- **Monitoring:** watch container health (web `/login`, media `/health`), host disk (Postgres
  volume and `media-scratch`), Postgres, Auth and SMTP errors, and the media 4xx/5xx rates.

## 5. Release checklist

Record the results in `docs/verification/` before serving clients. This is the J10 audit in the
[acceptance matrix](../architecture/acceptance-matrix.md).

1. `npm run check`, `npm --prefix apps/media test` and `npm run db:test` pass on the release commit.
2. `npm run build` and `docker compose build` succeed. Both containers report healthy.
3. Staging uses this exact topology: self-hosted Supabase, R2 backend, and the proxy.
4. The browser suite runs against staging with `ACCEPTANCE_SUPABASE_URL` set, because the tests
   refuse an undeclared backend. Use a disposable staging dataset, never production data.
5. Invitation and password recovery emails arrive on the real domain. Sign-up is refused.
6. A video larger than 50 MB uploads, publishes and plays for a client. This proves
   `FILE_SIZE_LIMIT`, TUS on R2 and media scratch space.
7. The family C isolation checks pass on staging: no designer identity, internal comments or
   unpublished files reach a client.
8. A backup and restore drill succeeds, and monitoring alerts fire on a forced failure.
9. Rollback is ready: a pre-release dump plus the previous image tags.

There is no payment processor. Client credit requests and agency ledger allocations never
charge a card.
