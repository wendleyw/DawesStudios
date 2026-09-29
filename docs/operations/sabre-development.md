# Local SABRE development dataset

> **Current state (2026-09-28, later the same day):** with the user's authorization the six
> projects below were replaced by the 20-project funnel test (F01–F20, two designers, public Miro
> test boards), after a full backup at `supabase/.backups/20260928-before-funnel-reset`. SABRE
> credits were reset to 500 before the run. See the
> [funnel test record](../verification/funnel-test-2026-09-28.md). The pruning procedure below is
> kept as history and recovery reference; its six-project guard no longer matches the live data.

This one-time operation reduces the **existing local** demonstration from 10 clients and 68
projects to SABRE and six representative projects. It does not change the canonical seed, its
10-client/25-project assertions, the SABRE population recipe, or production data. The previous
50-project overlay and its ignored rollback checkpoint remain recovery evidence; do not run the
overlay's `remove` command after this pruning because its snapshot no longer matches.

The six retained projects are fixed by ID, title and current public phase:

| Project | Public phase | Activity | Why retained |
| --- | --- | --- | --- |
| Brand Guidelines | In progress | Active | Two designer boards and work requests |
| Social Launch | In progress | Backlog after pruning | Separate activity demonstration |
| Campaign Landing Page | Client review | Active | Two client versions |
| Trail Weekend Social Series | Changes requested | Active | Feedback and revision history |
| Email Banner | Approved | Active | Staged final files |
| Everyday Essentials Launch | Delivered | Active | Released final files |

The script removes nine other client workspaces, their 18 projects, and 44 other SABRE projects.
It removes related briefings, boards, rounds, versions, comments, workflow receipts, notifications, files, client
workspace content, and memberships. The SABRE brand, campaigns, private template drafts, retained
project content, Miro links, files, agency/designers, and **all Auth accounts** remain. The pending
Gmail invitation remains. Former client accounts lose workspace access because their memberships
are removed. SABRE's deleted project debits are removed and its ledger running balances, monthly
balance, and account balance are reconciled in the same database transaction.

## Applied local state — 2026-09-28

The orchestrator applied the guarded operation after a transaction rollback rehearsal. The local
stack now contains **1 client / 6 projects**, with Social Launch in Backlog. The SABRE account and
ledger both reconcile to **648 credits**; the post-operation audit passed **133 foreign keys**.
All 203 scoped Storage objects were removed and the saved operation state is complete. The backup
contains the previous 10-client/68-project database and 237 physical Storage files. It was taken
after migration 007 and before 008; restoring it requires applying later forward migrations.

The default Board activity filter shows five Active projects. Choose **Filters → Activity → All
projects** to see all six, or **Backlog** to find Social Launch. Brand Guidelines retains both
assigned designers. The [verification record](../verification/action-driven-workflow-2026-09-28.md)
records checks and final screenshots. This is the current local development target; do not rerun
canonical provisioning or the old overlay removal on it.

The following procedure documents the completed operation and its recovery behavior.

## Prerequisites and preview

Use only the local `dawes-studios` project at `http://127.0.0.1:55421`. The full database and
filesystem Storage backup must exist at
`supabase/.backups/20260928-before-sabre-only/`; `--apply` validates its manifest and SHA-256
hashes before writing. Keep the web and media writers stopped during application. Do not use
`supabase db reset` or `supabase migration down`.

```sh
python3 supabase/scripts/sabre_development.py
```

The default command is read-only. It prints selected project IDs and current board, designer,
version, file and work-request counts, plus the number of records and Storage objects in scope.
The source guard requires exactly 10 clients, 68 projects, 50 SABRE projects, the six listed
ID/title/phase pairs, a two-designer Brand Guidelines board, and balanced SABRE credits. If any
condition differs, inspect the new data and update the plan before running.

## Application and recovery

```sh
python3 supabase/scripts/sabre_development.py --apply
python3 supabase/scripts/backup_local.py --check-only
```

Application uses one database transaction, then deletes the scoped Storage objects through the
Storage API. It does not delete `storage.objects` rows with SQL. The operation's ignored state is
saved at `supabase/.local/sabre-development/plan.json` with mode 0600. If Storage deletion fails
after the database commit, rerun `--apply`: it resumes from the saved object list and verifies
that the scoped objects are gone. If the database differs from both the saved source and the
one-client/six-project target, the script stops for inspection. The complete backup is the
rollback path; do not invoke the old SABRE overlay removal on this new dataset.
The transaction temporarily disables only the published-version and credit-ledger immutability
triggers, then re-enables both before commit. It leaves foreign-key and other triggers enabled.

After application, inspect all six projects with agency, SABRE client, and both designer
sessions. Check role isolation, current work requests, retained Miro links and downloads, the
Backlog/Active filter, and the five public phases. The deterministic canonical tests should run
against a separate canonical fixture, not this intentionally smaller local dataset.

## Dates and team members

On 2026-09-28 the user asked for realistic dates and a larger SABRE team in the local dataset, so
the board's due marks, ranges and "Requested by" can be exercised:

- Every SABRE project has a start and due date relative to 2026-09-28: delivered work was due the
  week before; F08 and S01 are overdue (Sep 26 and Sep 27); the rest are due Sep 30 – Oct 23.
- Every design board carries the designer's internal date, two to four days before its project's
  due date, so designers see earlier dates (and more overdue work) than the client.
- Two client members joined SABRE: Alexia (`alexia@client.dawes.local`) and Molly
  (`molly@client.dawes.local`), with the local demo password. Alexia requested D01, F01, F05, F08,
  F12, F15, F18 and S01; Molly requested F02, F04, F06, F09, F13, F16, F20 and S02; SABRE Team keeps
  the other nine.

`supabase/.backups/20260928-before-due-dates/restore.sql` (ignored) puts the previous dates and
requesters back; its closing comment removes the two memberships, after which their Auth users are
deleted through the Auth admin API.
