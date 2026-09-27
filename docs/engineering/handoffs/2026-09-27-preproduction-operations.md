# Preproduction operations review

- Updated: 2026-09-27 19:46 UTC · Agent: Codex reviewer · Model: Sonnet-equivalent
- State: verified source findings; deployment behavior unverified
- Objective and owned paths: inspect `compose.yaml`, Dockerfiles, `.github/workflows/`, `deploy/staging/`, `docs/operations/production.md`, and local backup/restore tooling; report only this file.

## Changes
- `docs/engineering/handoffs/2026-09-27-preproduction-operations.md` — review report only; no product or infrastructure changes.

## Findings
- [High, documented gap] `deploy/staging/scripts/stage.sh:77-82` always layers `docker-compose.s3.yml`; `deploy/staging/README.md:14-19` confirms MinIO staging does not cover filesystem Storage, TLS, SMTP, persistence, or restore. Acceptance: rehearse a clean official Supabase bootstrap and migrations on the production filesystem/TLS topology, then prove authorized and denied upload/download, restart persistence, SMTP delivery, and isolated restore.
- [High, documented gap] `docs/operations/production.md:185-201` prescribes nightly off-host encrypted database and Storage backup, coordinated consistency, restoration, and monitoring, while `supabase/scripts/backup_local.py:10-25` and `restore_drill.py:11-13` are tied to local CLI containers. Acceptance: configure production scheduling, encryption, retention, off-host transfer, failure alerts, and a timed restore drill with matching file hashes and access checks.
- [High, operational defect] `docs/operations/production.md:147-151,230-231` says tag commit images for rollback, but `compose.yaml:4,31` always selects `:local`; no step retargets Compose to a previous tag, and migrations are forward-only (`production.md:104`). Acceptance: specify and rehearse a rollback to an immutable previous web/media image pair, with a compatible migration plan and pre-release database dump.
- [High, documented gap] `docs/operations/production.md:177-183,241-247` describes TLS, WebSocket forwarding, body size, rate limits, and central alerts, but no tracked production proxy configuration or monitoring definition exists in the reviewed deployment paths. Acceptance: install a production proxy, verify HTTPS and WebSocket upgrades, upload ceiling, per-IP throttling for Auth/media, private admin ports, and alert delivery on forced failure.
- [Medium, documented gap] `deploy/staging/scripts/stage.sh:221-225` sets a mail-catcher host absent from its Compose stack; `deploy/staging/README.md:177-181` explicitly says real invitation/recovery email is unproven. Acceptance: configure a real SMTP provider in production-shaped staging and verify invitation, recovery, sender domain, and rejection of public sign-up.
- [Medium, CI coverage gap] `.github/workflows/check.yml:21-37` runs static/unit checks and explicitly omits browser tests; `docs/operations/production.md:208-218` also requires database tests, builds, and staging browser checks. Acceptance: add a gated clean database/migration and build check plus a disposable role-action browser job, or enforce and archive equivalent release-commit checks before deployment.

## Decisions and interface changes
- None. Findings separate existing documented gaps from the concrete rollback mismatch; no production-ready claim.

## Checks actually run
- Read-only `rg`, `git ls-files`, `git status --short`, and numbered excerpts of scoped tracked files — confirmed six findings; no Docker, database, server, network, or runtime check run.
- `git status --short` before report: unrelated `login.png` deletion only; left untouched.

## Risks and next action
- Actual production host, proxy, SMTP, scheduler, off-host destination, and alerting configuration were outside this repository and remain unknown. Orchestrator should prioritize a production-shaped staging rehearsal and resolve each acceptance step before release audit.
- Ownership: report path released; no active writer or process.
