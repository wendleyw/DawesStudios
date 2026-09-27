# Recovery hardening and Resend preparation

Date: 2026-09-27. Scope: local backup/restore safety, fixture integrity and production Auth email
configuration. No production deployment or external email delivery occurred.

## Implemented

- Resend SMTP fragment for the official Supabase distribution and an
  [email runbook](../operations/email.md). Existing Supabase invitation/recovery APIs remain intact.
  Sending domain/address, API key and target host are still required; no credentials were committed.
- Format-2 backups preserve database ownership/ACLs, check foreign keys, record database/Storage
  images, and bind archive hashes, every physical Storage file hash and a delivery download probe.
- Restore runs use unique projects/work directories and available ports. Cleanup compares captured
  Docker container/volume/network identities; changed or incomplete ownership fails closed.
  Retained verification requires the exact manifest and recorded target. The older fixed clone is
  never reused. Logs and backups remain ignored and private.
- CI includes recovery safety tests, fixture-cleanup regressions and a post-acceptance foreign-key
  audit. The updated workflow has not run on GitHub Actions yet.

## Findings and repair

The first current-data restore failed when PostgreSQL validated a real broken foreign key. A
read-only audit of all 118 relationships found four `board_preferences` rows referencing removed
clients and seven `playground_boards` rows referencing removed projects. The fixture helpers had
used `session_replication_role=replica` without deleting these dependents. All seven boards were
empty: no items and no Storage objects under their board IDs.

Before repair, the complete original dump/archive and all 11 row values were preserved under
`supabase/.backups/20260927-recovery-hardening/`; the row archive has mode 0600. A guarded transaction
removed only those orphan records, with 10 clients / 68 projects / 50 SABRE asserted before commit.
No valid board, project, client or file was removed. The SABRE rollback checkpoint was untouched.
Fixture cleanup now removes project Playground bytes through Storage, its items/boards before the
project, and temporary-client preferences before the client. This corrects the cause as well as
its residue; no foreign-key constraint was removed or weakened.

The next restore reached HTTP checks and exposed a test query that selected restricted author
columns on rounds. The client row-isolation probe now selects readable IDs, as the canonical seed
verifier does. The application's column grants remain unchanged.

## Verified in this task

- Real isolated restore `dawes-restore-0e9008f9229d`: **passed**. Counts matched: 10 clients,
  68 projects, 72 design boards, 13 Auth users, 237 Storage objects, 81 credit entries and balance
  total 1,278. All **118 foreign keys** passed on the restored database.
- Actual password logins for agency, SABRE client and both designers: **4 passed**. Agency counts,
  client tenant isolation and denied internal rows, and both designers' exact board scopes matched.
- Authenticated delivery download matched the archived object's size and SHA-256. All **237
  physical files** matched expected byte hashes. The Storage archive preserved xattrs/ACLs/owners;
  no independent exhaustive xattr comparison was performed in this task.
- Successful and failed owned restore stacks were removed; their local evidence/logs remain under
  `supabase/.restore-drill/runs/`. The source and older clone's **16 container IDs and start times**
  matched before/after, with all still running. Neither was restarted by the drill.
- Recovery safety suite: **11 tests passed**, covering corruption, traversal/link entries, expected
  content hashes, manifest binding, target ownership and orphan detection. CI guard tests: **4
  passed**. Proxy render tests: **3 passed**; six Docker integration tests were not rerun here.
- Retained clone `dawes-restore-36e9dcfcecdf`: restore and repeat verification both passed with
  exact manifest/resource binding, then guarded cleanup removed its containers/volumes.
- Backend-only fixture regression: **2 Playwright tests passed**, proving actual Playground
  bytes/items/board removal and removal of an agency-owned preference for a temporary client.
  Client/project counts were restored. Targeted TypeScript, ESLint and Prettier passed.
- Full web gate: **127 files / 1,249 tests passed**, with types/lint/format passing. Final live
  counts matched the backup; all 118 foreign keys passed, zero Acceptance clients/projects
  remained, and `/login` returned HTTP 200.
- Resend parameters and configuration mappings checked against official documentation; fragment
  syntax, local links and formatting checked. Actual delivery is pending.

The successful backup and manifest are ignored under `supabase/.backups/20260927-recovery-verified/`;
run evidence is `supabase/.restore-drill/runs/dawes-restore-0e9008f9229d/evidence.json`. Container
preservation evidence is under `outputs/recovery-2026-09-27/`. These are local operational artifacts,
not committed secrets or evidence of off-host recovery.

## Release limits

This is a same-host rehearsal of the authorized live SABRE overlay, not a replacement for the
canonical 10-client/25-project acceptance baseline or an off-host production recovery drill.
Matching before/after counts cannot prove a database/file consistency point during concurrent
writes. Production backups still require paused writes or coordinated snapshots, encryption,
off-host retention, verified restoration and monitoring. DNS/TLS, real Miro access, SMTP delivery
and the first remote CI execution remain target-environment gates.
