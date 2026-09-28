# Action-driven workflow and SABRE development dataset

Date: 2026-09-28 EDT. Owner: Codex orchestrator. State: implemented and verified locally;
production release and full canonical acceptance remain separate.

## Integrated behavior

Acceptance starts In progress with one debit. Board work requests drive separate designer tasks,
private instructions, submissions and agency handoffs. Client V1/V2 iterations do not add
deliverables or charges. Public phases never become Studio review. Contextual bottom buttons,
Active/Backlog, explicit direction closure/reactivation, latest-version review/delivery guards,
assignment generations, Home/Reviews/action notifications and cache invalidation are integrated.
See the [workflow guide](../architecture/production-workflow.md) for the button and recipient map.

Forward migrations `202609280003` through `202609280008` were applied to the local API55421 /
DB55422 stack. No reset, migration down, production write, push or deployment was performed.
The [independent review](../engineering/handoffs/2026-09-28-workflow-independent-review.md)
identified five findings; migration 008 and regression checks resolve delivery timestamps,
assignment revocation, unauthorized notification recipients, direct metadata writes and historical
round notifications. See the [hardening report](../engineering/handoffs/2026-09-28-workflow-backend-hardening.md).

Custom serialization errors caused PostgREST 14 to retry stale requests indefinitely during the
real HTTP race probe. Migration 006 changes business conflicts to `PT409`; concurrent submission,
publication and review/replacement probes now finish normally with one committed result.

## Current local data and recovery

The user authorized deleting other development clients and keeping SABRE with representative
workflow states. The guarded operation retained one project in each current public phase plus
Backlog, including two designers on Brand Guidelines. Result: **1 client / 6 projects**.
It removed 9 workspaces, 62 projects, their related records and 203 scoped Storage objects. All
Auth accounts and the pending Gmail invitation remain; former clients have no workspace membership.
The SABRE account and ledger reconcile to **648 credits**, including 185 credits returned from
removed SABRE projects. The foreign-key audit passed all **133 relationships**.

The full pre-operation database and Storage backup is ignored at
`supabase/.backups/20260928-before-sabre-only/` (10 clients, 68 projects, 237 physical files).
SHA-256 verification and a complete transaction rollback rehearsal passed before application.
The backup predates migration 008; restoring requires subsequent forward migrations. The ignored
operation state at `supabase/.local/sabre-development/plan.json` is complete. The
[dataset guide](../operations/sabre-development.md) documents exact retained projects and recovery.

## Checks executed on the final local state

| Check | Result |
| --- | --- |
| `npm run check` | PASS: type generation, TypeScript, ESLint, Prettier; 132 files / 1,293 unit and component tests |
| `npm run build` | PASS: optimized Next.js build and route generation |
| Nine named SQL suites below | PASS: 385 assertions after migration 008 and the data reduction |
| Seven Chromium checks below | PASS: real role flow, HTTP concurrency, reduced dataset and role overviews |
| `python3 supabase/scripts/backup_local.py --check-only` | PASS: 133 foreign-key relationships after cleanup |
| Seed generation and Python compilation | PASS; generated canonical counts remain 10 clients / 25 projects; no seed replay |

Database command (each suite rolls back its mutations):

```sh
supabase test db \
  supabase/tests/database/project_workflow.test.sql \
  supabase/tests/database/workflow_hardening.test.sql \
  supabase/tests/database/production_briefs.test.sql \
  supabase/tests/database/action_notifications.test.sql \
  supabase/tests/database/miro_workspace.test.sql \
  supabase/tests/database/retire_versions.test.sql \
  supabase/tests/database/miro_version_links.test.sql \
  supabase/tests/database/production_integrity.test.sql \
  supabase/tests/database/security_definer_coverage.test.sql
```

`production_integrity.test.sql` initially depended on projects deleted by the authorized reduction.
It now creates its own rollback fixtures, including a valid approved version and delivery file;
all original assertions remain. The canonical count tests were not relaxed.

Browser/API command (mutation fixtures remove only their own records):

```sh
SABRE_DEVELOPMENT=1 npm --prefix apps/web run test:e2e -- --project=chromium \
  tests/e2e/action-workflow.spec.ts \
  tests/e2e/workflow-concurrency.spec.ts \
  tests/e2e/sabre-development.spec.ts \
  tests/e2e/overview.spec.ts
```

The browser journey releases two private briefs, pauses/resumes, submits both designers' R1,
shares V1, records client changes, rejects close-only handoff, continues A/closes B, checks each
designer's Home/action feed, submits R2, shares V2, approves and uploads/delivers real final bytes.
The API probe races duplicate sends/shares and review versus replacement; it checks single IDs,
HTTP conflict responses, no-files rejection, approval preservation and exactly one credit debit.
The dataset check verifies all six phases/activities, Active/Backlog/All filters, old-client denial,
client request isolation and a retained file download. Overview checks include all three roles,
phone/dark mode and client accessibility assertions. Earlier locator failures and a briefing-column
test typo were corrected; the final seven-check run passed.

Local ignored logs: `outputs/workflow-final-check.log`, `workflow-production-build.log`,
`workflow-post-cleanup-final-database.log`, `workflow-final-browser.log`,
`workflow-post-cleanup-integrity.log`, `sabre-only-backup.log`, `sabre-development-apply.log`.

## Visual review

Reviewed the final 1600px desktop and 390px mobile action bars, studio review, handoff dialog,
Backlog editor and delivery state. Browser checks assert no horizontal overflow, no duplicate
header advance buttons, reachable dialog controls and keyboard activation. The project-view
toolbar remains on the left. Final captures retained with this record:

- [SABRE: all six project examples](screenshots/workflow-2026-09-28/sabre-six-projects.png)
- [Studio review: one desktop action bar](screenshots/workflow-2026-09-28/studio-review-desktop.png)
- [Two-designer handoff on mobile](screenshots/workflow-2026-09-28/handoff-mobile.png)

## Evidence boundaries and next release work

- The full 10-client/25-project canonical matrix was not rerun: the current local dataset is
  intentionally 1/6. Generated seed/manifest and canonical assertions retain 10/25; fresh isolated
  provisioning and the canonical browser/HTTP suites remain required before release.
- `http_auth_storage_test.py` passed nine tests before the cleanup on 10/68. That is historical
  evidence for this session, not a claim that its removed-client fixtures run on 1/6.
- The [W01–W19 plan](../superpowers/plans/2026-09-27-action-driven-workflow.md) is implemented;
  selected SQL/HTTP/browser paths passed. Exhaustive parallel acceptance, every pause/close/reassign/
  publish/deliver race, every Backlog phase and Realtime reconnect/history transport permutations
  were not all independently exercised in this run. Preserve those release checks.
- Miro embed/content access and real external sharing were not verified. Resend SMTP/DNS,
  TLS, off-host restore and hosted CI remain operational release gates. Workflow notifications
  remain in-app; Auth SMTP configuration does not implement workflow email delivery.
- Existing toolchain deprecation notices and database lint unused-variable warnings do not fail
  the checks. No production-ready claim follows from the local build alone.
