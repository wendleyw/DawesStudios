# Backend operations

The repository has a tested local Docker development stack and production-oriented application/media containers. No public production environment has been deployed. The Supabase CLI stack is a local fixture environment and must remain private; a production installation uses the official self-hosted Docker distribution described in the [production guide](production.md). Supabase explicitly distinguishes these environments in its [self-hosting guide](https://supabase.com/docs/guides/self-hosting).

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

`start` starts only project `dawes-studios`, applies pending migrations, starts the media Docker container if no healthy native service is already bound, then provisions fixture Auth passwords, brand files, project covers and the delivery file. File provisioning preserves existing Storage bytes, including photographic overlays, and creates only missing fixture objects whose application records still reference the intended paths; a project that already has a cover keeps it. Creates never overwrite an object that another writer uploaded concurrently. Storage authorization, transport and unexpected response errors stop provisioning; they are not treated as missing files. `stop` stops this Supabase project and its managed media container, retaining Docker volumes. It leaves native foreground media processes under their original terminal. The lifecycle script validates project identity and labels before managing containers.

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

Stop all browser mutation suites before resetting. This command deletes only the local `dawes-studios` database and Storage volumes, recreates them and loads the deterministic fixture dataset. `start` then brings up the media worker before provisioning, because each project's cover is posted to its `/covers/prepare` route and only a sanitized, attested cover is accepted. Covers are synthetic cards rendered at the true pixel size of the format the project's leading deliverable was ordered in — print formats at 150 DPI, and formats without dimensions at 1080x1080:

```sh
python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss
python3 supabase/scripts/verify_local.py
```

The supported reset replaces a fixture environment; applying `seed.sql` repeatedly over populated tables is intentionally unsupported. `build_seed.py` deterministically regenerates checked-in seed SQL and fixture IDs. The dataset contains 10 clients and 25 projects — two for each of nine workspaces, and seven for SABRE, whose campaigns, projects and open briefings come from the reference package that documents that workspace. It covers all 20 services, five projects with multiple deliverables, 30 products and 70 templates. Production follows the Miro model and is written through the real RPCs (`create_design_board`, `send_board_round`, `share_miro_version`, `review_publication`, `post_comment`) under each actor's own identity: 29 design boards, one per assigned designer and due on or before the project, with three projects staffed by both designers; 30 rounds and 22 client versions on placeholder Miro boards with Miro's 12-character id shape (`uXjV` + 7 + `=`, as in the SABRE demonstration; Miro refuses to frame any other shape), whose statuses follow each project's status with the same mapping as the SABRE demonstration (`miro_history`): planned and in-progress projects have boards only, because sending a round moves a project to internal review; internal review keeps one or two rounds with the studio; client review, changes requested and approved end on a client version with that decision, and every client version before the latest was sent back. Internal and client comments carry no design or pin data. Every project has a cover, visible to the client only once it has a client version (14 of 25). Files: 70 brand files, 25 covers and one delivery. All creative files are clearly labeled synthetic demonstration resources. `verify_seed.py --staging` checks the same dataset on the disposable staging rehearsal (`deploy/staging`).

### Looking at a populated board

The fixture covers are deliberately synthetic — flat generated cards — which is right for an acceptance baseline and wrong for judging how a board reads. `npm run db:covers:photos` replaces each seeded project's cover with a photograph from picsum.photos, cropped server side to the canvas of the project's leading deliverable. Every photograph goes through the media worker's `/covers/prepare` route under the agency session, like a cover the studio uploads, so it is sanitized and attested, the previous cover object is discarded and the cover's client visibility is kept. Boards, rounds and client versions are untouched: their content lives on Miro, and the seeded placeholder `uXjV…` boards simply show Miro's own "not found". Nothing is added to the repository, `build_seed.py` and `fixture_media.py` are untouched, and later `npm run db:start` calls keep the photographs; only the explicit destructive reset restores the synthetic cards. `verify_seed.py` still passes afterwards, because it checks each cover's canvas and the absence of producer metadata rather than its bytes. The photographs are placeholders for looking at layout, not approved client material.

Normal provisioning keeps a project's existing cover and reports how many it kept; it prepares a cover only for a seeded project that has none. On the current local database, which kept its canonical projects through the retire-Versions migration and carries the SABRE overlay, the next `local_stack.py start` therefore adds covers to the 18 canonical projects that have none (measured read-only on 2026-09-27). Those covers fall outside the SABRE demonstration's rollback scope. Seeded boards, rounds, client versions, reviews, comments and notifications are written through RPCs that take no id, so their ids change on every load; the seed and `verify_seed.py` refer to them by natural keys (board name, round number and request key, version number, comment idempotency key). A successful start therefore does not prove canonical fixture integrity; `verify_seed.py` remains the strict check.

`verify_local.py` runs SQL assertions/lint, real Auth/Storage checks, four-session Realtime boundaries, media behavior/integration/dependency checks, then verifies the final exact dataset and downloads actual files under client sessions. It writes `backend-evidence.json` and `seed-evidence.json`; web build/browser/visual evidence is separate. Run `python3 supabase/scripts/verify_seed.py` for the read-only all-client dataset check.

Concurrency tests are intentionally restricted to `http://127.0.0.1:55521`, the disposable restore-drill project:

```sh
python3 supabase/tests/concurrent_workflows_test.py
```

They test simultaneous acceptance/overdraft, allocation/fulfillment/correction, publication/review/delivery races, stale draft saves and duplicate submission. They add test records only to the disposable stack, so run canonical seed assertions before these mutations or reset that disposable stack afterward.

## Storage cleanup: retired Versions bytes

`202609270007_retire_versions_schema.sql` deleted the legacy per-deliverable Versions rows and
recorded every Storage path they referenced in `private.retired_version_objects` — a migration
cannot delete Storage bytes, only Postgres rows. `supabase/scripts/cleanup_versions_storage.py`
is the one-time follow-up that deletes those bytes through the Storage API:

```sh
python3 supabase/scripts/cleanup_versions_storage.py            # dry run: prints counts only
python3 supabase/scripts/cleanup_versions_storage.py --apply    # deletes through the Storage API
```

It removes (a) every path `private.retired_version_objects` still has a matching object for, (b)
every remaining object in the (now retired) `published-assets` bucket, and (c) any `internal-assets`
object at least 24 hours old that no `project_assets` row references and that (a) does not already
cover. It never touches `project_assets`, `project-covers` or `delivery-files` objects, is
idempotent (a dry run after `--apply` reports zero), and refuses to run against a non-local URL the
same way `local_stack.py`/`sabre_demo.py` do. `202609270008_drop_published_assets_bucket.sql` then
dropped the emptied `published-assets` bucket, its storage policies and
`private.retired_version_objects` itself.

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

The production target, configuration mapping, persistent filesystem Storage, container release, proxy, backups and release checklist are in the [production deployment guide](production.md). Creative work lives in Miro; R2 is no longer required (user decision, 2026-09-27). Remaining application uploads use Supabase Storage. Production uses the official self-hosted Supabase distribution with fresh secrets, real SMTP and only the versioned migrations. The seed, demonstration overlay, provisioning and reset scripts stay local.

The dedicated Realtime publication broadcasts inserts/updates only because deleted-row events do not enforce the same SELECT RLS filtering. Maintenance deletions therefore require list refresh rather than a delete event. Normal application operations use durable status changes and scoped insert/update events.

## Local permission-error compatibility

The local Supabase image `17.6.1.106` can crash while adding enhanced permission-denied hints for reserved roles. This was reproduced during Playground/widget authorization verification, including a direct denied SQL call outside pgTAP. The upstream reports are [supabase/postgres#2112](https://github.com/supabase/postgres/issues/2112) and [supabase/supabase#48614](https://github.com/supabase/supabase/issues/48614).

`npm run db:start` checks the running Dawes database image. For that exact affected image, `local_stack.py` sets `supautils.hint_roles` to an empty value through `ALTER SYSTEM` and reloads the configuration. This disables optional error hints only; function grants, RLS and authentication remain enforced. The setting is scoped to the local Dawes container and its volume. It does not change another project's database or publish anything. Credentials stay inside the container.

After applying it, real anonymous calls to `get_playground_board` and `save_board_widgets` return HTTP 401 / SQLSTATE 42501, rather than crashing PostgreSQL. Keep the actual denied-call tests enabled. When upgrading to a fixed Supabase image, review and remove this workaround and reset its local configuration after verifying the same negative tests; do not grant anonymous execution to avoid the crash.
