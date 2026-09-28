# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex; private production briefs integrated locally**.

## Objective and accepted decisions

- Improve project UX for agency, client and designer while preparing production workflows.
- Project pages alone use the compact campaign/title/due-date header (`44dba3b`), title weight700
  (`45439d2`). Desktop client tools stay on the left rail; widths up to900px move them below.
- Miro is the creative workspace. Agency manually copies chosen internal work to the client board.
- Internal requests may ask for extra concepts/quantities without changing client scope or credits.
- Designers receive only agency-released production instructions, never the original client request.
- Preserve live SABRE10clients/68projects/50SABRE and canonical staging10/25.
- Never migration down/db reset. Unrelated preexisting login.png deletion remains uncommitted.
- No push, deployment or external email delivery authorized. Target server/domain/sender unknown.

## Integrated task: private production briefs

- Working files → Project details → Production edits one private brief per selected design board.
- Editable title/service/direction/goals, deliverables/formats/dimensions/quantities, references and
  internal deadline. Explicit client-scope copy is available inside the agency editor only.
- Save draft remains agency-only; Send to designer releases instructions and one activity event.
- Forward migrations202609280001/002 applied locally. Expected revision is captured on open;
  database locks/idempotency protect saves. Stale edits keep the user's text and refuse overwrite.
- Old client briefing/attachment/deliverable reads blocked; visible_projects masks descriptions
  copied from client scope. Client data, billing, project deadline and workflow statuses unchanged.
- Existing boards have no auto-release; designers see a waiting state until the agency sends.
- Gate: types/lint/format and132files/1289tests pass;4DBfiles/197assertions;9HTTP/Auth/Storage tests.
- Chromium:3workflows pass plus final production retest;5Axe/overflow checks pass at desktop/mobile.
- Integrity:122FK relationships;live10/68/50;zero production fixture drafts/releases after cleanup.
- SQL lint has no errors; empty legacy endpoint has unused argument/output warnings.
- Expanded canonical board-count browser case fails on the demo overlay (8 expected including its
  fixture); assertion preserved. Full canonical matrix/intake/legacy concurrency not rerun.
- [Report](handoffs/2026-09-27-production-briefs.md) and
  [verification/captures](../verification/production-briefs-2026-09-27.md).
- External Miro requests blocked in isolated browser checks; actual sign-in/editing not verified.
- Next: user prepares/sends the first production brief locally. Production references are named
  HTTPS links; this change adds no new binary upload system or automatic Miro copy/publish action.

## Pending workflow decisions from the parallel planning thread

- The planning thread made no implementation/checkpoint edits during this task; Codex owned all
  shared integration paths. Agree the next owner explicitly before that thread writes them.
- User accepted: public project starts In progress on acceptance; client must see In progress
  during Studio review; V1/V2/V3 are iterations of the same work, not extra deliverables/debits.
- These status/projection changes are **not implemented** by the production-brief feature.
- Proposed next: agency selects affected boards, writes separate internal revision directions and
  sends to designer(s); board revision tasks plus public In progress while old review history stays.
- Board revision tasks/return-to-designer transitions remain future work. Sending a production
  brief currently changes only the released content, board deadline and designer activity.
- [Workflow map](../architecture/production-workflow.md), [intake audit](handoffs/2026-09-28-funnel-intake-map.md)
  and [notification audit](handoffs/2026-09-28-funnel-notifications-map.md) retain existing gaps.

## Prior integrated UI and evidence

- Designer context93e1a15: Briefing first, secondary Project info, no inspector cover;
  Working files/own board/Live board/R1 labels; This round comments, You and the studio audience.
  Its original-brief reading is superseded by the production isolation above.
- [Designer context evidence](../verification/designer-context-2026-09-27.md): prior129files/1278tests,
  3roles×4sizes,40geometry/19Axe,0page errors. Agency + before designer badge remains506dae7.
- [Project context evidence](../verification/project-context-ux-2026-09-27.md): inline brief,
  named comments, organized panels, full-width Playground and centered copy/paste feedback.
- [Board badge](../verification/board-designer-2026-09-27.md) and
  [plus/dialog](../verification/board-action-clarity-2026-09-27.md) retain previous evidence.
- [Prior checkpoint](history/handoff-2026-09-27-before-production-briefs.md) preserves earlier state.

## Recovery, invitation and deployment continuity

- a7b35e5 verified isolated restore:10clients/68projects/72boards,237Storageobjects,118FK,
  four role logins and authenticated delivery hashes. [Evidence](../verification/recovery-and-email-2026-09-27.md).
- Keep ignored backups/orphan archives in supabase/.backups/20260927-recovery-hardening/ and
  successful supabase/.backups/20260927-recovery-verified/. Older fixed clone is untouched.
- Guarded cleanup removed only11archived fixture orphans; local SABRE checkpoint preserved.
- Original Gmail invitation remains pending; user still needs password setup. Never consume it
  in automation. Named test invitations remove only their own captured mail.
- [Callback evidence](../verification/invitation-link-errors-2026-09-27.md) retains Auth investigation.
- Resend is selected through Supabase Auth SMTP; no direct SDK. [Email runbook](../operations/email.md)
  prepares host SMTP; actual delivery is a host gate. Auth SMTP does not send workflow emails.
- Live app3003/API55421/DB55422/media55430 left available. Existing older fixed clone retained.
- Filesystem staging stopped with data retained:API56110/DB56111/web3113/media56114/mail56115.
  Do not provision/reseed it again.
- Use [production runbook](../operations/production.md) only when deployment is requested.
- Remaining release gates: real DNS/TLS issuance/renewal, external SMTP, off-host recovery,
  monitoring alerts, actual Miro sharing and first hosted CI. Local restore is not production proof.
- Firefox/external Miro WebKit limitations remain; complete three-engine coverage not claimed.
