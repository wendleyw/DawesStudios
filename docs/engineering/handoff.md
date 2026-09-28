# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex; designer context UX integrated**.

## Objective and accepted decisions

- Improve project UX for agency, client and designer while preparing production workflows.
- Project pages alone use the compact campaign/title/due-date header for every role (`44dba3b`),
  title weight700 (`45439d2`). No preview flag or saved layout preference is needed.
- Desktop client view tools stay on the left rail; only viewport widths up to900px move them below.
- Miro is the primary creative workspace. No R2 or simultaneous-upload reservation architecture.
- Resend is selected for production email through Supabase Auth SMTP; no direct SDK.
- Server/domain/sender credentials unknown. No push, deployment or external email delivery.
- Preserve live SABRE10clients/68projects/50SABRE and canonical staging10/25.
- Never migration down/db reset. Unrelated preexisting login.png deletion remains uncommitted.

## Latest integrated task: designer context UX

- Designer first tool is Briefing when linked; it opens the saved scope directly. Project info
  contains secondary metadata/resources. Without a brief, Project details remains available.
- The designer inspector never mounts the project cover. Board-card covers/read permissions
  unchanged. Agency/client retain their Overview and cover controls.
- Designer Miro bar: Working files, assigned board name even with one board, Live board/R1/R2.
- Internal comments use This round; designer audience says You and the studio. Client keeps
  This version. Named project/round destinations, drafts and existing writes remain intact.
- Agency icon-only + immediately before designer badge stays grouped8px apart (`506dae7`).
  Shared with client retains New version. No workflow status, permission or database changes.
- Current full gate: npm run check passes types/lint/format and129files/1278tests.
- Focused6files/85tests; Chromium3real roles×4sizes,40geometry checks,19Axe scans,0page errors pass.
- Designer direct-panel link and submission dialog open/cancel checked. No application writes.
- [Current report](handoffs/2026-09-27-designer-context-ux.md) and
  [verification/captures](../verification/designer-context-2026-09-27.md).
- External Miro requests blocked in isolated checks; actual sign-in/editing not verified.
- Next concrete UI action: user reviews the designer project page locally.

## Workflow map and outstanding product work

- Funnel docs committed in8402aa9; checkpoint ownership released to this UI task.
- [Production workflow](../architecture/production-workflow.md) maps current Miro role actions,
  notification rules and gaps. Its final designer labels match this implementation.
- [Intake audit](handoffs/2026-09-28-funnel-intake-map.md) and
  [notification audit](handoffs/2026-09-28-funnel-notifications-map.md) are source/schema evidence.
- Next workflow fixes: designer revision action vs Home mismatch, missing Miro production-start
  transition, no briefing decline/cancel. Auth SMTP does not provide workflow email notifications.
- Agency confirms/accepts budget; client reviews shared versions. No funnel behavior changed here.

## Prior verified work and evidence

- Project context UX: inline Briefing, named comment destinations, organized side panels,
  full-width Playground strip and centered copy/paste feedback. Mobile panels cover project chrome.
- [Context evidence](../verification/project-context-ux-2026-09-27.md): prior129files/1269tests,
  81CSS checks,3roles×4sizes×3panels,6PNGcopies/30Axe; external Miro paste not verified.
- [Designer badge](../verification/board-designer-2026-09-27.md): prior129files/1272tests,
  2Chromium workflows,118FK,live10/68/50. Agency gets authorized display name only.
- [Plus placement](../verification/board-action-clarity-2026-09-27.md): prior44tests,
  3responsive dialogs/Axe0. Add design board links an existing Miro board; it does not create one.
- [Before this task](history/handoff-2026-09-27-before-designer-context.md) retains earlier details.

## Recovery, invitation and deployment continuity

- a7b35e5 verified isolated restore:10clients/68projects/72boards,237Storageobjects,118FK,
  four role logins and authenticated delivery hashes. [Evidence](../verification/recovery-and-email-2026-09-27.md).
- Keep ignored backups/orphan archives in supabase/.backups/20260927-recovery-hardening/ and
  successful supabase/.backups/20260927-recovery-verified/. Older fixed clone is untouched.
- Guarded cleanup removed only11archived fixture orphans; local SABRE checkpoint preserved.
- Original Gmail invitation remains pending; user still needs password setup. Never consume that
  invitation in automation. Named test invitations remove only their own captured mail.
- [Callback evidence](../verification/invitation-link-errors-2026-09-27.md) retains Auth investigation.
- [Email runbook](../operations/email.md) prepares Resend host SMTP; actual delivery is a host gate.
- Live app3003/API55421/DB55422/media55430 left available. Existing older fixed clone retained.
- Filesystem staging stopped with data retained:API56110/DB56111/web3113/media56114/mail56115.
  Do not provision/reseed it again.
- Obtain target server/domain/sender and use [production runbook](../operations/production.md)
  only when deployment is explicitly requested. Verify Resend delivery with controlled recipients.
- Remaining release gates: real DNS/TLS issuance/renewal, external SMTP, off-host recovery,
  monitoring alerts, actual Miro sharing and first hosted CI. Local restore is not production proof.
- Firefox launch/external Miro WebKit limitations remain; complete three-engine coverage not claimed.
