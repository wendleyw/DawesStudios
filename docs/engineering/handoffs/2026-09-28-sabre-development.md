# SABRE-only local development dataset

- Updated: 2026-09-28 EDT · Agent: Codex bounded implementer · Model: top-tier delegate
- State: implemented, dry-run tested; database and Storage application not executed
- Objective/owned paths: `supabase/scripts/sabre_development.py`, `docs/operations/sabre-development.md`, this report.

## Changes
- Script fixes six project IDs/titles/phases, requires 10/68/50 source counts, verifies backup SHA-256 before `--apply`, and uses one guarded SQL transaction plus Storage API cleanup; guide covers application, resume and recovery.
- Retained `65ea09bf` Brand Guidelines: in_progress/Active; 2 boards, 2 designers, 2 work requests.
- Retained `c4737460` Social Launch: in_progress/Active, 0 requests; moves to Backlog.
- Retained `15e2d399` Campaign Landing Page: client_review/Active, 1 request, 2 versions.
- Retained `9e5d7758` Trail Weekend Social Series: changes_requested/Active, 1 request, 1 version.
- Retained `fc3cef34` Email Banner: approved/Active, 1 request, 1 version, 2 staged files.
- Retained `e8654248` Everyday Essentials Launch: delivered/Active, 1 request, 1 version, 2 files.

## Decisions and interface changes
- Scope: remove 9 non-SABRE clients, 62 projects total, 65 associated briefings and 9 memberships; preserve all Auth accounts, SABRE brand/campaigns and the pending Gmail invitation.
- Scoped Storage: 203 objects, 0 kept-reference conflicts; 63 brand, 41 briefing, 31 delivery, 3 internal, 3 playground and 62 cover objects.
- Billing: 71 ledger entries removed (44 SABRE project debits refund 185 credits); account/month and retained ledger running balances reconcile in transaction.

## Checks actually run
- `python3 -m py_compile supabase/scripts/sabre_development.py` and direct `verify_backup()` — passed; backup has 10 clients, 68 projects and 237 Storage files.
- `python3 supabase/scripts/sabre_development.py` — dry-run passed; no writes.
- `python3 supabase/scripts/backup_local.py --check-only` — passed, 133 FK relationships.
- `git diff --check -- supabase/scripts/sabre_development.py docs/operations/sabre-development.md` — passed.

## Risks and next action
- SQL deletion and Storage removal remain untested until parent reviews and applies; assignment-delete trigger from migration 008 is not bypassed, and deletion order removes boards before assignments.
- Stop web/media writers, review the guide and SQL, then have parent run `--apply`; audit 1 client/6 projects, balances, FK integrity, scoped bytes and role-specific UI.
- Ownership: three listed paths released; no process or mutation started.
