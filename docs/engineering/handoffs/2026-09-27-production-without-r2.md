# Production target without R2

- Updated: 2026-09-27 EDT · Agent: Codex (scoped documentation task)
- State: implemented; documentation and shell-syntax checks passed; production not deployed.
- Objective: record the user's removal of R2 now that creative work lives in Miro.
- Owned paths: root AGENTS/CLAUDE; production/runbook docs; J10; production-only checkpoint lines;
  staging README, override comments and script messages; this report.

## Changes
- Synchronized `AGENTS.md` and `CLAUDE.md`; removed R2 from the current release requirements.
- `docs/operations/{production,README}.md`: persistent filesystem Storage and off-host backups.
- `docs/architecture/acceptance-matrix.md`: J10 stays open; no real-R2 gate remains.
- `docs/engineering/handoff.md`: recorded the decision; Claude retains implementation ownership.
- `deploy/staging/`: labeled the existing MinIO rehearsal historical; no services/volumes changed.

## Decisions and interface changes
- User decision: R2 is no longer required. Current Miro links/boards remain the creative workflow.
- Implementation choice: retain Supabase's default filesystem backend for existing app uploads.
- Covers, briefing attachments, Brand Hub, Playground and working/delivery files still use Storage.
- No application API, permissions, database, upload feature or running environment was changed.

## Checks actually run
- `git diff --check` and `bash -n deploy/staging/scripts/stage.sh` — passed.
- Documentation assertions — identical AGENTS/CLAUDE, checkpoint <=100 lines, 162 file links resolve.
- Storage settings matched the pinned upstream Compose file; obsolete R2 configuration absent.
- Source inspection confirmed remaining Storage consumers; no application/browser suites rerun.

## Risks and next action
- Before release, verify filesystem Storage persistence/restoration, TLS and SMTP on the server.
- Ownership: documentation task complete; active Claude implementation and existing data preserved.
