# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex; integrated work complete, no active writers**.

## Objective and accepted decisions

- Continue production preparation. Latest user request: actionable notifications for agency,
  designer and client. Miro is the main workflow; no simultaneous-upload/reservation architecture.
- Actions derive from current workflow state. Reading historical Activity never completes work.
- No push or deployment authorized. Actual server/domain/SMTP configuration remains unknown.
- Preserve live SABRE 10 clients / 68 projects / 50 SABRE and canonical staging 10/25.
- Never run migration down or db reset. Preexisting `login.png` deletion remains unrelated/uncommitted.

## Completed implementation

- `7231a52`: unified Comments and scoped drafts.
- `6f6afd1`: coordinated repository cleanup; [folder audit](repository-cleanup-2026-09-27.md).
  Separate cleanup thread `01a0e4a2-8753-7930-a218-89f4122ac00c` released ownership.
- `8fdd098`: project details split into credit and Drive dialogs with existing behavior preserved.
- `6340e66`: nine kinds of role-specific pending actions, separate exact bell counts, pagination,
  links to authorized briefing/board/round/version/Files/credit destinations, Safari focus return.
  Internal action labels name the board, so several boards on one project are distinguishable.
- Migrations018/019/020 applied to both local and filesystem staging via forward commands only.
  Agency review survives designer departure; removed designers lose access. Client recipient
  routing preserves requester/notify_all/fallback. No client billing acceptance action was added.
- Production edge: nginx renderer with TLS hosts, public API allowlist, request/body/time limits,
  trusted forwarding headers, query-free access logs, WebSocket and private Auth admin gateway.
- CI: guarded disposable backend/Auth/media, pgTAP, production Chromium and exact count comparison.
  Filesystem staging includes local Mailpit at56115 and explicit acceptance mail selection.
- All delegates finished; portable reports are in `docs/engineering/handoffs/2026-09-27-*.md`.

## Checks executed in this session

- Web gate: 127 files / 1,249 unit tests; types/lint/format pass. Media: 31 tests pass.
- Canonical database: 27 files / 1,108 pgTAP assertions pass, including56 action assertions.
- Production web/media Docker images built and healthy.
- Existing Chromium: 53 cases pass. New notifications+Drive:4 cases pass across Chromium/WebKit;
  complete notification flow passed again in both engines after board-label correction.
- WebKit Comments, mobile/focus and notification-read cases:3 pass. Mobile page/popover Axe pass.
- Initial harness races (landing redirect, animation/resize, nonexact labels) fixed with stable
  destination/layout waits and exact selectors. No assertion or permission check was removed.
- Proxy:9 tests pass; real filesystem Supabase behind disposable TLS proxy:7 checks pass.
- CI bootstrap:4 tests pass; YAML/Python parse. npm audit0 advisories; GitLeaks551commits/source clean.
- Strict seed verifier:110 downloads,10 client logins, designer/tenant/credit checks pass.
- Final eight-table baseline matches:10clients/25projects/12campaigns/30briefings/29boards/
  30rounds/22clientversions/155notifications. Live remains10/68/50 with0 acceptance projects.
- Final images inspected. [Action evidence](../verification/action-notifications-2026-09-27.md);
  [production evidence](../verification/production-refactor-2026-09-27.md). AGENTS/CLAUDE identical.

## Environment and next concrete work

- Live app3003/API55421/DB55422/media55430 left available; `/login` responds200.
- Filesystem staging stopped with all data/volumes retained. Ports when resumed:
  API56110/DB56111/web3113/media56114/mail56115. Already provisioned; do not re-seed.
- Remaining release gates require actual target-host evidence: DNS/TLS issuance/renewal, external
  SMTP delivery, off-host restore and forced monitoring alerts, real Miro sharing permissions,
  and first hosted CI run. Local checks do not constitute production deployment.
- Firefox failed before app navigation because its profile could not launch on this host. A broader
  WebKit workspace scan reported an external Miro response-header warning; core flows above pass.
  Investigate these environment/third-party limits before claiming complete three-engine coverage.
- Next: obtain target-host configuration and execute the [release runbook](../operations/production.md)
  when deployment is explicitly requested. Keep current application changes and data intact.
- [Previous checkpoint](history/handoff-2026-09-27-pre-production-refactor.md).
