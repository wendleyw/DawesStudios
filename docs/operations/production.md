# Production deployment

Status: **not deployed.** This guide defines the production target and the release procedure.
Rehearse every step on a staging installation with the same topology before serving clients.
The local CLI stack described in the [operations runbook](README.md) is a fixture environment
and is never promoted to production.

**Decision, 2026-09-27:** creative work lives in Miro; Cloudflare R2 is no longer a production
dependency or release gate. Existing application uploads still use Supabase Storage, backed by
persistent server storage. This decision does not remove covers, briefing attachments, Brand Hub,
Playground uploads or working/delivery files from the application.

## Topology

```text
Browser ── HTTPS ──► reverse proxy (TLS)
                      ├─ app.example.com   → web container       127.0.0.1:3003
                      ├─ api.example.com   → Supabase gateway    127.0.0.1:8000 (Envoy by default)
                      └─ media.example.com → media container     127.0.0.1:55430

Self-hosted Supabase (official Docker distribution)
  Postgres · Auth · PostgREST · Realtime · Storage API · gateway   (Studio stays private)
  Storage API ── filesystem ──► persistent private server storage
```

**Application files remain behind Supabase Storage.** All authorization for files lives there:
RLS on `storage.objects`, the per-bucket limits in the migrations, and short-lived signed URLs.
That authorization keeps unpublished and internal artifacts away from clients. The filesystem
backend stores their bytes on the server; keep that directory private, persistent and backed up
off-host. The application continues to use the Storage API, policies and signed URLs. Miro hosts
the creative boards; it does not replace storage for the application's remaining upload features.

Managed Supabase Cloud is the alternative. It removes Postgres operations, and the application
runs against it unchanged with managed Storage. The rest of this guide targets self-hosting.

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
| Upload ceiling | `file_size_limit = "1GiB"` | Storage `FILE_SIZE_LIMIT=1073741824`. `internal-assets` still carries this legacy ceiling from the retired video-design path (`202609210004_video_storage.sql`); the official 50 MB default would silently reject it below its own bucket setting. |

Buckets, per-bucket size and MIME limits, RLS policies and the Realtime publication are all
created by the migrations. Do not create them by hand.

Keep the upstream Realtime hostname `realtime-dev.supabase-realtime`, either as the container name
or as a network alias. The gateway routes WebSocket traffic to that host, and Realtime derives its
tenant (`realtime-dev`) from it. The staging rehearsal renamed the container without an alias, and
every Realtime handshake failed with 503.

### Persistent filesystem Storage

Use the official distribution's default filesystem backend; do not add `docker-compose.s3.yml`
or an external object-storage service. The pinned upstream distribution used by the
[local rehearsal](../../deploy/staging/README.md) defines these settings on `storage`:

```yaml
STORAGE_BACKEND: file
FILE_STORAGE_BACKEND_PATH: /var/lib/storage
```

Upstream mounts `./volumes/storage:/var/lib/storage:z`. Keep that host directory on persistent
disk, outside disposable release directories, and preserve it across container replacement.
Keep `GLOBAL_S3_BUCKET` stable too: despite its name, upstream also uses it as a directory name
with the file backend. No external S3 credentials, object-tagging workaround or bucket lifecycle
rule is required. The distribution's `S3_PROTOCOL_ACCESS_KEY_*` values configure its own protocol
endpoint and are separate from external storage-provider credentials.

Set `FILE_SIZE_LIMIT: 1073741824` on `storage` through a Compose override. Upstream hardcodes
50 MiB, so adding a value only to `.env` does not change the service. The existing staging
override demonstrates that limit override, but its MinIO/S3 topology is historical and must not
be copied as the new production storage configuration. Verify actual uploads, restart persistence
and restoration on the filesystem-backed server before release.

The application does not use Storage image transformations, so `imgproxy` may stay disabled.

### Migrations

Apply only `supabase/migrations/`, in order, from a trusted machine. Publish the database port on
the server's `127.0.0.1` only, and reach it through an SSH tunnel. The connection pooler expects a
tenant-qualified user (`postgres.<tenant-id>`), so the direct port is simpler for this one-off step:

```bash
PGSSLMODE=disable supabase db push --db-url "postgresql://postgres:<password>@127.0.0.1:<tunnel-port>/postgres"
```

The upstream database has no TLS; the SSH tunnel provides the encryption. `PGSSLMODE=disable` must
be an environment variable: the rehearsal showed that `?sslmode=disable` in the URL alone is not
honoured. Take a database dump first (see backups). Migrations are forward-only.

### First agency account

A new database has no agency member, and the application has no public sign-up. From a trusted
machine, create the first account through the Auth admin API with the service key
(`POST /auth/v1/admin/users` with `email_confirm: true`). The `on_auth_user_created` trigger creates
its profile as a client. Promote it with SQL as `postgres`:

```sql
update public.profiles set role = 'agency' where id = '<new user id>';
```

That agency then invites everyone else from Settings. The rehearsal verified both steps, an
agency-only read with the resulting token, and that `POST /auth/v1/signup` is refused.

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
| `META_AD_LIBRARY_ACCESS_TOKEN` | web (server) | Optional; a Meta Ad Library API token (see below) |
| `META_AD_LIBRARY_COUNTRIES` | web (server) | Optional; comma-separated ISO codes, empty for every country |

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --wait web media
docker compose exec media df -h /scratch   # verify free scratch space for cover/PDF preparation
```

`NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing them. The web Content-Security-Policy is derived from the same two origins (Supabase and media, including the `wss:` Realtime origin), so a URL change also needs a rebuild. Both services
bind to `127.0.0.1` and run read-only as non-root with every capability dropped. They are
reachable only through the proxy. Tag each release image with its commit
(`docker tag dawes-studios-web:local dawes-studios-web:<sha>`, and the same for media) so you
can roll back.

The `internal-assets` bucket still carries a 1 GiB ceiling left over from the retired video-design
path (see the Upload ceiling row above); keep production's `FILE_SIZE_LIMIT` at least that high to
match it. `compose.yaml`'s own comment on this still names the removed `/designs/sanitize-video` and
`/publications/prepare` media routes and a since-deleted `apps/media/src/sanitize.js` constant —
that comment needs its own cleanup pass, tracked separately from this guide.

### Competitor ad previews (optional)

The board's Competitor ads widget always links to the official Meta, TikTok and Google ad
libraries. To also preview a competitor's Meta ads inside the app:

1. Create a Meta developer app and add the **Ad Library API** product.
2. Confirm the Meta account's identity and location at facebook.com/ID. Meta reviews this, which
   can take several days.
3. Generate a long-lived user access token for that app and set it as
   `META_AD_LIBRARY_ACCESS_TOKEN` for the `web` service; optionally set `META_AD_LIBRARY_COUNTRIES`.
   Restart `web` (no rebuild is needed; these are server variables).
4. Renew the token before its roughly 60 days run out. An expired token shows "The Meta Ad Library
   token has expired or was revoked. Renew it on the server." on the competitor screen.

Meta's API returns ordinary ads only where they reached the EU, and political or issue ads
elsewhere. The token stays on the server and is never sent to a browser. See the
[competitors feature](../../apps/web/features/competitors/README.md).

## 3. Reverse proxy and TLS

Terminate TLS for the three hosts at the proxy. The proxy must pass WebSocket upgrades to the
gateway, because Realtime needs them, and it must not cap request bodies below the upload
ceiling. Caddy does both by default. With nginx, set `client_max_body_size` for the API and media
hosts and add the upgrade headers. Keep Studio, Postgres and the Supabase analytics endpoints off
the public interface, and reach them through an SSH tunnel.

## 4. Backups and recovery

- **Database:** take a nightly `pg_dump -Fc` of the `public`, `private`, `auth`, `storage` and
  `supabase_migrations` schemas (the same scope as `supabase/scripts/backup_local.py`). Encrypt it
  and store it off-host with separate backup credentials.
- **Files and consistency:** pause writes for the database dump and Storage directory archive,
  or use coordinated snapshots, so the database and stored bytes share a recoverable point.
  Archive the persistent Storage directory with GNU tar, preserving extended attributes, ACLs
  and numeric owners, as the [local backup procedure](README.md#database-auth-and-storage-backup) does.
  Encrypt and retain versioned copies off-host; a database dump alone does not contain files.
- **Drill:** restore the dump and the filesystem archive into isolated staging, then repeat the
  role checks (agency and client login, a forbidden internal-board read, an authorized download
  with a matching SHA-256). The local `restore_drill.py` is local-only evidence, not a production
  restore command or proof that the server's volumes, permissions and backups are correct.
- **Monitoring:** watch container health (web `/login`, media `/health`), host disk (Postgres
  volume, Storage directory and `media-scratch`), Postgres, Auth and SMTP errors, and the media
  4xx/5xx rates. Miro-hosted board content is outside the application's database/file backups.

## 5. Release checklist

Record the results in `docs/verification/` before serving clients. This is the J10 audit in the
[acceptance matrix](../architecture/acceptance-matrix.md).

1. `npm run check`, `npm --prefix apps/media test` and `npm run db:test` pass on the release commit.
2. `npm run build` and `docker compose build` succeed. Both containers report healthy.
3. Staging uses the production topology: self-hosted Supabase with persistent filesystem Storage,
   the web/media containers and the TLS proxy. The existing [local rehearsal](../../deploy/staging/README.md)
   uses MinIO/S3 and records historical evidence; it does not yet verify this revised topology.
   Verify upload/download authorization, persistence across container replacement and off-host
   restoration on the filesystem backend. R2 and S3 object-tagging checks are not release gates.
4. The browser suite runs against staging with `ACCEPTANCE_SUPABASE_URL` plus
   `ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY`, `ACCEPTANCE_SUPABASE_ANON_KEY` and
   `ACCEPTANCE_DEMO_PASSWORD` set, because the tests refuse an undeclared backend and never mix it
   with local credentials. Use a disposable staging dataset, never production data.
5. Invitation and password recovery emails arrive on the real domain. Sign-up is refused.
6. A cover and a delivery file each prepare, sanitize and download for a client. This proves
   `FILE_SIZE_LIMIT`, the media worker's Poppler pipeline and media scratch space; see
   [`apps/web/tests/e2e/project-cover.spec.ts`](../../apps/web/tests/e2e/project-cover.spec.ts) and
   the delivery journey in
   [`apps/web/tests/e2e/files-campaigns.spec.ts`](../../apps/web/tests/e2e/files-campaigns.spec.ts).
7. The Miro round trip holds on staging: a designer sends a round, the agency shares a client
   version (Miro link and note), and the client reviews it — see
   [`apps/web/tests/e2e/miro-workspace.spec.ts`](../../apps/web/tests/e2e/miro-workspace.spec.ts).
8. The client-isolation checks pass on staging: no designer identity, internal comments, unshared
   rounds or an internal design board reach a client.
9. A backup and restore drill succeeds, and monitoring alerts fire on a forced failure.
10. Rollback is ready: a pre-release dump plus the previous image tags.

There is no payment processor. Client credit requests and agency ledger allocations never
charge a card.

## Known gaps to close before or at launch

The 2026-09-23 security audit found no dependency advisories (`npm audit`: 0 for web and media)
and no leaked secrets in the 155 commits of history (gitleaks). These operational gaps remain:

- **Rate limiting.** Nothing throttles requests per IP apart from the media worker's concurrency
  cap and the database limit on invitations. Add per-IP limits at the proxy, especially for
  `/auth/v1/token` and the media host.
- **Health depth.** The container health checks (web `/login`, media `/health`) prove the process
  is running, not that Supabase is reachable. Monitor the Supabase gateway separately.
- **Logging.** Both services log only to stdout and stderr. Ship container logs to a central
  store with alerting.
- **Server environment.** Compose `:?` guards reject missing variables, but a plain `next start`
  outside Compose boots without validating them. Always deploy through Compose.
- **Host gateway alias.** Both services declare `host.docker.internal` for local development. In
  production, point `SUPABASE_INTERNAL_URL` at the Supabase gateway on a shared Docker network
  and remove the alias if nothing uses it.
