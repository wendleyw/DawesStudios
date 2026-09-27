# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex; sidebar and named invitations integrated, no active delegated writers**.

## Objective and accepted decisions

- Continue production preparation and preserve role-specific workflow notifications.
- Latest correction: keep List/Canvas/Timeline/Kanban/Calendar tools on the desktop left rail;
  only viewport width up to 900 px moves them below. Height alone no longer changes orientation.
- User approved the compact campaign/title/due header for project pages only. `44dba3b` makes it
  the default for all roles; the preview flag and old layout branch are removed.
- Latest task: fix the clipped sidebar control, add a designer invitation name, and test delivery.
  Resend remains unconfigured; local Auth captures mail. User's existing Gmail invitation remains
  pending and requires password setup. Do not consume its verification link in automation.
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
  plus81targeted tests. Other uncommitted project CSS belongs to separate work.
- Preview follow-up: campaign via the existing authorized hook and role-specific due badge;
  no duplicated project date below. Opened the shared browser at its native size after a fixed
  test viewport clipped the user's window. Future size matrices run in isolated browsers.
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

- Web gate: 127 files / 1,249 unit tests; types/lint/format pass.
- Recovery safety: 11 tests pass. CI guard tests:4 pass. Proxy render:3 pass; Docker proxy checks
  were not rerun (six skipped). Python parse, diff whitespace and AGENTS/CLAUDE sync pass.
- Full isolated HTTP/Auth/Storage restore passed:10clients/68projects/72designboards/13Authusers,
  237Storageobjects,81creditentries,totalbalance1278; all118foreignkeys valid.
- Agency/client/both designers:4 password logins pass; agency scope, client tenant/internal-data
  isolation and exact designer board scopes pass. Authenticated delivery hash and all237physical
  file hashes match. No exhaustive xattr comparison rerun in this task.
- Source/old-clone16container IDs/start times unchanged and allrunning. Successful and failed owned
  drill stacks cleaned up. Local preserved data remains10/68/50; canonical staging was untouched.
- Fixture cleanup:2 backend-only Playwright regressions pass with real persisted Storage bytes
  and preferences. New spec passes targeted types/lint/format. Retained-target recheck passes;
  its clone was removed after ownership validation. Final live counts and all118FK match.
- Live `/login` returns200. No Acceptance clients/projects remain. Preview evidence docs being
  updated by the separate UI thread are excluded from this task commit.
- [Current evidence](../verification/recovery-and-email-2026-09-27.md). Original backup/orphan archive:
  `supabase/.backups/20260927-recovery-hardening/`; successful backup:
  `supabase/.backups/20260927-recovery-verified/`. Keep these ignored operational artifacts.

## Environment and next concrete work

- Current task: sidebar control remains fully clickable when expanded/collapsed at1512px wide
  and900/696/600px tall. Optional full name reaches new Auth profiles; existing names stay intact.
- Web gate:128files/1259tests, types/lint/format pass. New Chromium designer invite→local mail→
  password→acceptance→fresh sign-in passes; no projects visible before assignment. Dialog Axe0.
  All118FK pass; live10/68/50 preserved; disposable designer removed.
- [Invitation/sidebar evidence](../verification/team-invitation-and-sidebar-2026-09-27.md).
  User tests the existing invitation from local inbox55424 in a separate/private browser session.
  External Gmail delivery requires Resend credentials and a verified sender on the host.

- Current toolbar checks: web gate127files/1249tests and Chromium search/filter/focus/Axe across
  five sizes, including1512×696 and1440×600, pass. Desktop captures inspected; live10/68/50 and
  all118FK preserved. [Toolbar evidence](../verification/board-left-toolbar-2026-09-27.md).
- Prior header-preview UI checks: web gate 127 files / 1,249 tests; six Chromium widths 320–1600 px,
  campaign/date placement, channel/round actions, More/Escape and Details pass; header Axe0.
  Native shared tab1512×696: account, project bar and bottom tools entirely visible, no overflow.
  Final desktop/mobile preview captures inspected. See the linked UI report.

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
