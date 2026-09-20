# Backend operations

The repository has a tested local Docker development stack and production-oriented application/media containers. No public production environment has been deployed. The Supabase CLI stack is a local fixture environment and must remain private; a production installation uses the official self-hosted Docker distribution. Supabase explicitly distinguishes these environments in its [self-hosting guide](https://supabase.com/docs/guides/self-hosting).

## Local lifecycle

Run these commands from the repository root with Docker running, Supabase CLI installed, Python 3.11+, Node 22+ and npm available. The validated CLI version is 2.98.2; test upgrades in the disposable environment before changing the active stack.

```sh
python3 supabase/scripts/local_stack.py start
python3 supabase/scripts/local_stack.py status
python3 supabase/scripts/local_stack.py stop
```

`start` starts only project `dawes-studios`, applies pending migrations, provisions fixture Auth passwords/files and starts the media Docker container if no healthy native service is already bound. `stop` stops this Supabase project and its managed media container, retaining Docker volumes. It leaves native foreground media processes under their original terminal. The lifecycle script validates project identity and labels before managing containers.

| Service | Local address |
| --- | --- |
| Supabase API/Auth/Storage/Realtime | `http://127.0.0.1:55421` |
| PostgreSQL | `127.0.0.1:55422` |
| Studio | `http://127.0.0.1:55423` |
| Captured invitation/recovery email | `http://127.0.0.1:55424` |
| Trusted media | `http://127.0.0.1:55430` |
| Web application | `http://localhost:3003` |

The media container uses a read-only root filesystem, a bounded temporary filesystem, non-root user, memory/CPU/PID limits and no privilege escalation. Local keys/passwords are generated or read into ignored mode-0600 environment files. The fixture password survives supported resets through `supabase/.env.local`. Service credentials are server-only.

Auth redirect URLs include the configured app origin, `/auth/recovery` and `/auth/invite` for both `localhost` and `127.0.0.1`. After changing Auth runtime values on an already-running local stack, `python3 supabase/scripts/reload_auth_config.py` recreates only this project's Auth container while preserving signing keys and database state.

## Canonical fixture reset and acceptance

Stop all browser mutation suites before resetting. This command deletes only the local `dawes-studios` database and Storage volumes, recreates them and loads the deterministic fixture dataset:

```sh
python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss
python3 supabase/scripts/verify_local.py
```

The supported reset replaces a fixture environment; applying `seed.sql` repeatedly over populated tables is intentionally unsupported. `build_seed.py` deterministically regenerates checked-in seed SQL and fixture IDs. The dataset contains 10 clients, 20 projects, all 20 services, four projects with multiple deliverables/V1/V2, 30 products, 70 templates and 59 actual file objects. All creative files are clearly labeled synthetic demonstration resources.

`verify_local.py` runs SQL assertions/lint, real Auth/Storage checks, four-session Realtime boundaries, media behavior/integration/dependency checks, then verifies the final exact dataset and downloads actual files under client sessions. It writes `backend-evidence.json` and `seed-evidence.json`; web build/browser/visual evidence is separate. Run `python3 supabase/scripts/verify_seed.py` for the read-only all-client dataset check.

Concurrency tests are intentionally restricted to `http://127.0.0.1:55521`, the disposable restore-drill project:

```sh
python3 supabase/tests/concurrent_workflows_test.py
```

They test simultaneous acceptance/overdraft, allocation/fulfillment/correction, publication/review/delivery races, stale draft saves and duplicate submission. They add test records only to the disposable stack, so run canonical seed assertions before these mutations or reset that disposable stack afterward.

## Database, Auth and Storage backup

```sh
python3 supabase/scripts/backup_local.py --output supabase/.backups/manual-backup
python3 supabase/scripts/restore_drill.py supabase/.backups/manual-backup
```

The output directory must not already exist. The backup contains a PostgreSQL custom dump of `public`, `private`, `auth`, `storage` and `supabase_migrations`, plus actual Storage volume bytes, checksums, image version and diagnostic counts. Credentials, audit history, invitation token hashes and Auth password hashes are confidential; backup folders are ignored with restrictive permissions. Encryption and off-host retention must be configured by the production operator.

Storage files require extended attributes. The scripts use GNU tar with xattrs/ACLs and numeric owners; a plain tar copy loses metadata needed by the local Storage backend. Database dumps alone do not include file contents. A dump and later file archive are not one atomic consistency point: pause writes during production backups, or use versioned immutable Storage and record the matching database point.

The drill starts only `dawes-studios-restore-drill` on ports 55521–55524, initializes matching Supabase service schemas, restores application/Auth/Storage data with proper ownership and restores Storage bytes. It then performs actual agency/client password login, exact record comparison, a forbidden private-design query and an authorized PDF download with SHA-256 verification. By default it removes only the drill stack/volumes afterward. `--keep` retains it for inspection; `--verify-only` checks an existing restored drill. Source services and data are never modified by the drill.

The checked-in [restore evidence](restore-evidence.json) records a successful isolated restoration of the original 10-client/20-project dataset with its real PDF. The richer fixture is separately verified in [seed evidence](seed-evidence.json); those are distinct claims.

## Production deployment requirements

Provision the official [Supabase Docker distribution](https://supabase.com/docs/guides/self-hosting/docker) on the intended server, pin compatible images/configuration, and retain its database and Storage volumes. Configure TLS at a reverse proxy, real SMTP, public Auth/API URLs, recovery/invitation redirect allowlists and fresh production secrets. Keep database, Studio and worker service credentials private. The CLI mail inbox and demonstration accounts are local test conveniences. The official distribution supports filesystem or S3-backed Storage; select and back up the actual configured backend.

Apply only versioned migrations to production, never the demonstration seed or local provisioning/reset scripts. Point the app at the public Supabase URL with its public key; inject service credentials only into the web server invitation endpoint and media worker. Give media its exact allowed app origin and an internal Supabase URL. Use the root application/container configuration for the web image; the worker image is defined in `apps/media/Dockerfile`.

Before serving real clients, configure independent encrypted backups/retention, monitoring for database/storage/Auth/media failures, disk capacity and scheduled cleanup failures, a restore schedule with an agreed recovery target, and an upgrade/rollback procedure. Verify email delivery and recovery on the actual domain. There is no payment processor integration: client credit requests and agency ledger fulfillment allocate studio credits and never charge a card. PDF delivery is flattened; video/ZIP delivery sanitization is not implemented.

The dedicated Realtime publication broadcasts inserts/updates only because deleted-row events do not enforce the same SELECT RLS filtering. Maintenance deletions therefore require list refresh rather than a delete event. Normal application operations use durable status changes and scoped insert/update events.
