# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex; board action labels clarified, spacing clarification pending**.

## Objective and accepted decisions

- Continue production preparation and preserve role-specific workflow notifications.
- Latest correction: keep List/Canvas/Timeline/Kanban/Calendar tools on the desktop left rail;
  only viewport width up to 900 px moves them below. Height alone no longer changes orientation.
- User approved the compact campaign/title/due header for project pages only. `44dba3b` makes it
  the default for all roles; the preview flag and old layout branch are removed.
- Prior Auth task: user reached sign-in from an invalid Auth invitation link. The screen now explains
  failed verification; named designer tests remove their captured mail. The user's original Gmail
  invitation remains pending and needs password setup. Never consume its link in automation.
- Miro is the primary creative workflow; no R2 or simultaneous-upload reservation architecture.
- Resend is the selected production email provider, through Supabase Auth SMTP. No direct SDK.
- Server, public domain, verified sender and credentials remain unknown. No push/deployment or
  external email delivery performed. Configure secrets only on the target host.
- Preserve live SABRE 10 clients / 68 projects / 50 SABRE and canonical staging 10/25.
- Never migration down/db reset. Preexisting `login.png` deletion remains unrelated/uncommitted.

## Integrated implementation

- Prior `695a7e2`: production proxy and CI gates; `6340e66`: actionable role notifications.
  [Prior checkpoint](history/handoff-2026-09-27-before-recovery.md) retains their detailed evidence.
- UI thread promoted the project header in `44dba3b`;
  [current report](handoffs/2026-09-27-project-header-default.md) owns its visual evidence.
  Follow-up `45439d2` sets title weight to700; its owner verified both fonts/phone and desktop
  plus81targeted tests. The compact header remains limited to project pages.
- Resend host SMTP fragment and [email runbook](../operations/email.md) prepared. Invitation and
  recovery APIs stay in Supabase Auth; actual delivery is still a target-environment gate.
- Backup format2 retains owners/ACLs, checks all foreign keys, records image versions and binds
  dump/archive hashes plus every physical file's hash and a delivery-download expectation.
- Restore uses a unique owned project/workdir/ports, current Miro RLS and four actual Auth logins.
  Cleanup checks resource identities; retained verification binds the exact backup. It does not
  reuse the older fixed clone. Logs/backups remain ignored and private.
- Found historical fixture-cleanup orphans: 4 client preferences and 7 empty Playground boards.
  Archived all 11 rows plus the original full backup before guarded removal; no valid content
  removed. Fixed fixture-dependent cleanup, including Playground Storage objects. SABRE checkpoint
  untouched. Added safety tests, fixture regressions and final CI foreign-key audit.

## Recovery/Resend evidence (prior task)

- `a7b35e5` verified an isolated restore:10clients/68projects/72boards,237Storageobjects,
  all118foreignkeys, four role logins and authenticated delivery hashes. Local overlay preserved.
- [Recovery evidence](../verification/recovery-and-email-2026-09-27.md) and
  [prior checkpoint](history/handoff-2026-09-27-before-board-designer.md) retain checks and caveats.
- Keep ignored backup/orphan archives in `supabase/.backups/20260927-recovery-hardening/` and
  the successful `supabase/.backups/20260927-recovery-verified/`. Older fixed clone is untouched.

## Environment and next concrete work

- Board action follow-up: **Add board** links existing Miro work; **New version** labels sharing.
  Dialog title/description clarified;73targeted tests,lint/format,3responsive dialogs/Axe0 pass.
  [Action clarity evidence](../verification/board-action-clarity-2026-09-27.md). No records created.

- Working files now highlights the selected board's designer for the agency, including one board.
  Profile name joins existing RLS; client rows and other designers' boards remain inaccessible.
- Current gate129files/1272tests and2Chromium full workflow/privacy journeys pass. Desktop/phone
  badge checks and2Axe scans pass;118FK and live10/68/50 preserved. First browser run interrupted
  by macOS sleep; unchanged rerun passed. [Designer evidence](../verification/board-designer-2026-09-27.md).
- Project context UX: inline Briefing, named comment destinations, organized side panels,
  full-width image strip and centered copy/paste feedback. Mobile panels cover project chrome.
- Prior context gate129files/1269tests passes; final81CSS checks pass. Browser3roles×4sizes×3panels,
  6realPNGcopies/30Axe scans, download fallback and light/dark inspection pass.
- [Context UX evidence](../verification/project-context-ux-2026-09-27.md) and
  [handoff](handoffs/2026-09-27-project-context-ux.md). External Miro access/paste not verified.
- Pending: user sent a tiny spacing crop; asked whether channel/+ or header/bar gap. Await answer.
  Board designer emphasis is integrated; existing spacing selectors are unchanged.

- Compact Miro review controls now overlap padding and stay centred on phones; next UI action:
  user reviews the compact stack. Web gate128files/1259tests and14Chromium light/dark size checks pass;
  [review-control evidence](../verification/compact-miro-review-2026-09-27.md) records scope and captures.

- Sidebar control and optional new-account full name: [prior evidence](../verification/team-invitation-and-sidebar-2026-09-27.md).
- Prior invitation gate:128files/1262tests, types/lint/format pass. Chromium designer invitation passes
  invalid link→correct link→password→acceptance→fresh sign-in→reused link; unassigned projects hidden.
  Invalid-link Axe0 and desktop/phone visuals pass. All118FK and live10/68/50 preserved.
- [Callback evidence](../verification/invitation-link-errors-2026-09-27.md). Actual clicked message
  unknown; Auth rejected three links, while the original recipient's token still matched. A newer
  retired test message was archived/removed. User received their specific inbox message link.
  Manual acceptance is pending; Resend delivery still requires sender and host credentials.

- Current toolbar checks: web gate127files/1249tests and Chromium search/filter/focus/Axe across
  five sizes, including1512×696 and1440×600, pass. Desktop captures inspected; live10/68/50 and
  all118FK preserved. [Toolbar evidence](../verification/board-left-toolbar-2026-09-27.md).
- Live app3003/API55421/DB55422/media55430 left available. Existing older fixed clone retained.
- Filesystem staging remains stopped with data/volumes retained. When resumed:
  API56110/DB56111/web3113/media56114/mail56115. Do not provision or reseed it again.
- Recovery/Resend is verified in `a7b35e5`; its owner released this checkpoint before UI integration.
  The unrelated `login.png` deletion is preserved. Next UI action: user tests the pending local designer invitation.
- Then obtain target server/domain/sender configuration and use the [production runbook](../operations/production.md)
  when deployment is explicitly requested. Verify Resend delivery with controlled recipients.
- Remaining release gates: real DNS/TLS issuance/renewal, external SMTP, off-host recovery,
  monitoring alerts, actual Miro sharing and first hosted CI execution. Local restore is not
  an off-host or production claim. Firefox launch and external Miro WebKit warning remain as
  recorded in the prior checkpoint; complete three-engine coverage is not claimed.
