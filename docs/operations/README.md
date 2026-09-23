# Backend operations

The repository has a tested local Docker development stack and production-oriented application/media containers. No public production environment has been deployed. The Supabase CLI stack is a local fixture environment and must remain private; a production installation uses the official self-hosted Docker distribution. Supabase explicitly distinguishes these environments in its [self-hosting guide](https://supabase.com/docs/guides/self-hosting).

## Web development and backend containers

Run `npm run dev` from the repository root to serve the checked-out frontend on
`http://localhost:3003` with live source updates. The frontend source lives in `apps/web`; the
Compose web image is an optional compiled production preview, not a separate source repository.
Before development, release the web port with `docker compose --env-file .env.production stop web`
if that preview is running. This stops only the web process; database, Auth, Storage and media stay
available. No backend lifecycle or provisioning command is needed for an ordinary frontend edit.
See [web runtime switching](../../apps/web/README.md#development-from-the-repository).

Automation-launched development servers must use a detached session with file-backed stdout/stderr
and `/dev/null` stdin. Keep logs outside watched source directories, such as
`/tmp/dawes-next-dev.log`. If port 3003 listens but HTTP times out, inspect the owning process and
logs before restarting only that checkout's web process. Do not restart Supabase or reset data to
recover a frontend process hang. See the [2026-09-23 recovery](../verification/development-recovery-2026-09-23.md).

## Local lifecycle

Run these commands from the repository root with Docker running, Supabase CLI installed, Python 3.11+, Node 22+ and npm available. The validated CLI version is 2.98.2; test upgrades in the disposable environment before changing the active stack.

```sh
python3 supabase/scripts/local_stack.py start
python3 supabase/scripts/local_stack.py status
python3 supabase/scripts/local_stack.py stop
```

`start` starts only project `dawes-studios`, applies pending migrations, provisions fixture Auth passwords/files and starts the media Docker container if no healthy native service is already bound. File provisioning preserves existing Storage bytes, including photographic overlays, and creates only missing fixture objects whose application records still reference the intended paths. Creates never overwrite an object that another writer uploaded concurrently. Storage authorization, transport and unexpected response errors stop provisioning; they are not treated as missing files. `stop` stops this Supabase project and its managed media container, retaining Docker volumes. It leaves native foreground media processes under their original terminal. The lifecycle script validates project identity and labels before managing containers.

The isolated provisioning regression tests require no services or credentials: `python3 -m unittest discover -s supabase/tests -p test_fixture_provisioning.py -v`.

For the integrated lifecycle check, stop other local mutation suites first, then run:

```bash
python3 supabase/tests/startup_preservation_test.py exercise /tmp/dawes-startup-before.json --output docs/operations/startup-evidence.json
```

This local-only check temporarily changes one internal fixture image, runs a warm start and a cold restart, compares public-table row digests and all Storage file hashes, then restores the image and verifies the original state. It does not reset the database. A `capture` / `compare` mode using the same baseline path provides read-only snapshots around a manually executed lifecycle. Keep the baseline file until the test succeeds; a failed run reports missing cleanup rather than silently replacing unrelated edits.


| Service                            | Local address            |
| ---------------------------------- | ------------------------ |
| Supabase API/Auth/Storage/Realtime | `http://127.0.0.1:55421` |
| PostgreSQL                         | `127.0.0.1:55422`        |
| Studio                             | `http://127.0.0.1:55423` |
| Captured invitation/recovery email | `http://127.0.0.1:55424` |
| Trusted media                      | `http://127.0.0.1:55430` |
| Web application                    | `http://localhost:3003`  |

The media container uses a read-only root filesystem, a bounded temporary filesystem, non-root user, memory/CPU/PID limits and no privilege escalation. Local keys/passwords are generated or read into ignored mode-0600 environment files. The fixture password survives supported resets through `supabase/.env.local`, in the working tree that holds that file. A second tree without one cannot read the stack's current password, so `start` refuses to provision rather than minting a replacement and locking the first tree out. Service credentials are server-only.

Auth redirect URLs include the configured app origin, `/auth/recovery` and `/auth/invite` for both `localhost` and `127.0.0.1`. After changing Auth runtime values on an already-running local stack, `python3 supabase/scripts/reload_auth_config.py` recreates only this project's Auth container while preserving signing keys and database state.

## Canonical fixture reset and acceptance

The active local workspace has a user-authorized temporary **50-project SABRE demonstration**
(10 clients / 68 total projects). All current clients are test data. Preserve that demonstration
while it is used for agency walkthroughs; do not reset it to satisfy canonical seed counts.
The [demo guide](../../supabase/demo/sabre/README.md) documents its generated imagery, real workflow
population, role checks, saved before/after snapshots and guarded removal. The canonical seed
described below remains unchanged at 10 clients / 25 projects.

Stop all browser mutation suites before resetting. This command deletes only the local `dawes-studios` database and Storage volumes, recreates them and loads the deterministic fixture dataset. The 27 private production images and their 18 published copies are rendered at the true pixel size of the format each deliverable was ordered in — print formats at 150 DPI, and deliverables whose format carries no dimensions at 1080x1080 — so the fixtures show work at the shape it would really be delivered in:

```sh
python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss
python3 supabase/scripts/verify_local.py
```

The supported reset replaces a fixture environment; applying `seed.sql` repeatedly over populated tables is intentionally unsupported. `build_seed.py` deterministically regenerates checked-in seed SQL and fixture IDs. The dataset contains 10 clients and 25 projects — two for each of nine workspaces, and seven for SABRE, whose campaigns, projects and open briefings come from the reference package that documents that workspace. It covers all 20 services, five projects with multiple deliverables (four of them on V1 and V2 throughout), 30 products, 70 templates and 116 actual file objects (70 brand files, 27 private production images, 18 published copies and one delivery). All creative files are clearly labeled synthetic demonstration resources.

### Looking at a populated board

The fixture artwork is deliberately synthetic — flat generated cards — which is right for an acceptance baseline and wrong for judging how a board reads. `npm run db:artwork:photos` replaces the 27 production images in `internal-assets` with photographs from picsum.photos, cropped server side to the exact canvas each deliverable was ordered in. Nothing is added to the repository, `build_seed.py` and `fixture_media.py` are untouched, and a reset restores the synthetic artwork. Subsequent `npm run db:start` calls preserve the photographs and existing project history; returning to canonical artwork requires the explicit destructive reset above, not a normal start.

Two things it deliberately does not do. It leaves the published copies alone: a publication is an immutable client snapshot, and `register_sanitized_asset` refuses to re-describe an existing path with different bytes, so a client login still shows the generated cards. Publish a new version through the product to change what a client sees. And it is an overlay, not a fixture: run `verify_seed.py` before it, because that check compares production artwork byte for byte against the generated cards and will fail — correctly — once those bytes are photographs. The photographs are placeholders for looking at layout, not approved client material.

Normal provisioning also preserves an existing published object if its bytes differ from the canonical fixture, leaves its attestation unchanged, and reports the count of those preserved objects. It registers only known canonical published bytes, including a retry after a previous upload finished before its registration. A successful start therefore does not prove canonical fixture integrity; `verify_seed.py` remains the strict check.

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

## Local permission-error compatibility

The local Supabase image `17.6.1.106` can crash while adding enhanced permission-denied hints for reserved roles. This was reproduced during Playground/widget authorization verification, including a direct denied SQL call outside pgTAP. The upstream reports are [supabase/postgres#2112](https://github.com/supabase/postgres/issues/2112) and [supabase/supabase#48614](https://github.com/supabase/supabase/issues/48614).

`npm run db:start` checks the running Dawes database image. For that exact affected image, `local_stack.py` sets `supautils.hint_roles` to an empty value through `ALTER SYSTEM` and reloads the configuration. This disables optional error hints only; function grants, RLS and authentication remain enforced. The setting is scoped to the local Dawes container and its volume. It does not change another project's database or publish anything. Credentials stay inside the container.

After applying it, real anonymous calls to `get_playground_board` and `save_board_widgets` return HTTP 401 / SQLSTATE 42501, rather than crashing PostgreSQL. Keep the actual denied-call tests enabled. When upgrading to a fixed Supabase image, review and remove this workaround and reset its local configuration after verifying the same negative tests; do not grant anonymous execution to avoid the crash.
