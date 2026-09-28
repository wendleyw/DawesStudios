# Codex / Claude continuation checkpoint

Updated: 2026-09-28 EDT. Owner: **Codex orchestrator**. No active delegated writers.

## Latest task (Claude, 2026-09-28) — SABRE funnel test + layout fixes

- Local data: SABRE only, 20 funnel projects F01–F20 (two designers, public Miro test boards),
  402 credits; backups `supabase/.backups/20260928-before-funnel-reset` and `...-before-sabre-only`.
- 20 scenarios / 263 UI actions passed via Playwright MCP; [record](../verification/funnel-test-2026-09-28.md).
  Ignored harness `outputs/funnel-harness` (serve with `python3 outputs/funnel-server.py`), report
  `outputs/funnel-report/index.html`. One scenario per MCP call (30-minute idle limit).
- UI: docked project footer + framed Miro embed, Review R#, role-aware Backlog/empty copy, pinned
  dialog actions, scroll-row navigation/tabs, solid client sticky header with scroll-padding,
  overview/briefing/brand/files grid and spacing fixes, canvas fit floor 75%.
- `npm run check` PASS (1,293 tests). Updated stale e2e assertions (miro-workspace, project-feedback,
  client-navigation). Client-switcher, overview-notes and sabre-development specs need other data.
- The dev server does not hot-reload `globals.css`: restart with `outputs/funnel-harness/restart-web.sh`.

## Latest UI change

- Client Overview now shows the client's logo, the signed-in viewer's greeting and studio-local
  weekday/date. The old Overview/agency-preview text is removed.
- The logo appears in either the welcome card or the upper menu. Navigation, history and keyboard
  activate a460ms move/scale; direct visits and reduced motion use immediate placement.
- `ClientIdentityProvider` retains only departing geometry; guards handle Strict Mode and cached
  route effects. Client/designer permissions, figures and the SABRE1/6 dataset are unchanged.
- [UI verification](../verification/overview-client-identity-2026-09-28.md) records final checks,
  desktop/mobile captures and animation coverage. No active workers or database migration.

## Current objective and completed workflow task

- Action-driven project workflow is implemented locally; the latest authorized data reduction is
  complete. The local target is now **SABRE only, six projects**, not the previous 10/68 overlay.
- [Verification record](../verification/action-driven-workflow-2026-09-28.md) contains commands,
  results, screenshots and remaining release evidence. [Workflow guide](../architecture/production-workflow.md)
  describes current buttons and notification recipients.
- Root instructions remain synchronized. Preserve the unrelated preexisting `D login.png`.
- No push/deployment requested. No database reset or migration down is allowed.

## Implemented behavior

- Acceptance creates In progress and one debit; internal submissions never replace the public
  review/approval. R numbers are per board; V1/V2/V3 are client iterations, not deliverables/debits.
- Private per-board production release creates assignment-scoped work. One contextual bottom bar
  per role/view; no Mark ready, Ready for client or internal Approve. Header duplicates removed.
- Feedback handoff explicitly continues selected boards and may close others. Omitted boards stay
  unchanged. Empty/close-only handoffs fail. Agency may handle changes and publish directly.
- Reassignment/revocation ends old work and advances generation; fresh instructions are required.
  Closed boards retain authorized history; reactivation requires a new release.
- Active/Backlog in Edit project preserves phase/history/credits and suppresses actions. Server
  guards block advances while paused; Delivered cannot enter Backlog. Board filters expose both.
- Publication captures latest V and review revision; stale forms conflict. Delivery requires latest
  approval and a real file, stamps delivered_at once, and permits safe retry.
- Current requests drive Home/Reviews/action notifications. Clients never receive internal boards,
  identities, briefs, receipts or Studio review. Miro composition remains manual; links stay editable.
- Workflow email is not implemented; events are in-app. Resend is the selected Auth SMTP provider.

## Local runtime and data

- Web http://localhost:3003; API55421/DB55422/media55430; Next dev and media remain running.
- Live data is the 20-project funnel set (see the latest task above); the earlier six retained
  projects were removed with authorization after a backup. Earlier cleanup (nine workspaces, 62
  projects) stands; all Auth accounts remain and former clients have no memberships.
- Complete ignored backup: `supabase/.backups/20260928-before-sabre-only/` (DB +237 Storage files,
  taken after007/before008); operation state: `supabase/.local/sabre-development/plan.json` complete.
  [Dataset guide](../operations/sabre-development.md) documents guards/recovery. Do not run the old
  SABRE overlay removal against this new state. Preserve its checkpoint as historical evidence.
- Canonical seed/assertions remain exactly10clients/25projects. Seed was regenerated, not applied.
- Original Gmail invitation remains pending; never consume it in automation. Do not touch older
  restore clone or stopped stagingAPI56110/DB56111/web3113/media56114/mail56115.

## Workflow checks (previous task, commit9f2b704)

- Forward migrations003–008 applied with `supabase migration up --local`. No reset/down migration.
- Final `npm run check`:132files/1293tests, types/lint/format PASS. `npm run build`:PASS.
- Nine named SQL suites:385assertions PASS after cleanup; production_integrity now owns rollback
  fixtures instead of depending on deleted projects. Full canonical SQL suite was not run on1/6.
- Seven Chromium/API checks PASS: two-designer workflow through actual file delivery, duplicate
  send/share and review/publication race, SABRE six-state check and four role overview checks.
- Foreign-key audit:133relationships PASS. Backup hashes, rollback rehearsal, Storage cleanup,
  retained file download, former-client access denial and credit reconciliation PASS.
- Real HTTP tests exposed PostgREST infinite retries for custom40001; migration006 usesPT409.
- Independent review's five findings fixed by008: delivered_at, revocation generation, notification
  recipients, direct metadata grants and old-round comment recipients. Regression SQL passed.
- Historical within this task: broad HTTP9PASS before data reduction on10/68. Not repeated on1/6.
- Reviewed desktop1600/mobile390 captures; committed final images are linked in verification record.

## Next concrete work and release boundaries

- Continue remaining acceptance evidence on a separately controlled canonical10/25 environment;
  do not reset/reseed this local SABRE dataset. See verification record for unexercised race and
  Realtime permutations, fresh canonical provisioning and external Miro/Resend requirements.
- SMTP/DNS/TLS, off-host recovery and hosted CI remain release gates. Local checks do not establish
  production readiness; push/deployment need a user request.
- Worker reports in `handoffs/2026-09-27-workflow-*.md` and `2026-09-28-workflow-*.md` preserve
  bounded evidence; their earlier pending checks are superseded by the integrated record above.
- [Previous checkpoint](history/handoff-2026-09-27-before-workflow-implementation.md) preserves
  pre-workflow history. Read archived material only when needed.
