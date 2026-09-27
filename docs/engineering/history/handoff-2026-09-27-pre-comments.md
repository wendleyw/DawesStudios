# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex**. All delegated writers have released ownership.

## Current result — preproduction hardening

- User authorized implementation after the production-readiness review.
- Completed changes and evidence: [verification record](../../verification/preproduction-hardening-2026-09-27.md).
- Forward migration `202609270017` limits working uploads to 50 MiB and PNG/JPEG/WebP/PDF.
  Applied to local and filesystem staging. Existing objects/attestations remain readable.
- Workspace, Files and Board use ordered 500-row pages and 100-ID/signature batches, with cancellation.
- Isolated official Supabase filesystem staging uses `STAGING_STORAGE=file`, `.work-file` and
  the named Linux volume `dawes-staging-file_staging-storage`. A macOS bind mount failed xattrs.
- Release images use `WEB_IMAGE`/`MEDIA_IMAGE`, including digests; app-up does not rebuild.
- CI now runs Node.js 24 and adds the production web build. Remote CI execution is unverified.
- Project-details extraction, aggregate upload quotas and DB/browser CI remain unimplemented.
- Existing `login.png` deletion is unrelated and remains outside this task's commit.

## Checks executed in this task

- Source gate passes: types, lint, formatting, 125 Vitest files / 1,218 tests.
- Media: 2 files / 31 tests. Compose/script tests: 5/5, including filesystem --force refusal.
- Final web/media images build and run healthy. Header/health checks pass on local filesystem staging.
- Direct Storage HTTP: 7 assertions pass for agency/designer upload size/MIME enforcement and client denial.
- Canonical filesystem staging pgTAP: 26 files / 1,052 assertions pass after provisioning.
- Canonical HTTP: 10 clients / 25 projects; all scopes/credits and 110 real downloads verified.
- Chromium staging: 7/7 workspace, Files/campaigns, covers and Miro/delivery cases pass.
- Actual web Board: 1,005 tagged projects displayed for agency/client/assigned designer via three
  pages; unassigned designer and other client see zero. Exact-ID cleanup restored 10/25.
- Offline recovery: separate database/volume restored 10/25 and all 96 physical files plus xattrs;
  restored client SQL/RLS saw 7 projects and 0 internal boards. Source data never overwritten.
- Storage/imgproxy containers recreated; canonical verifier and 110 downloads passed again.
- SABRE HTTP: 42/42 pass. Final live SQL: 10 clients / 68 projects / 50 SABRE; 0 Acceptance projects.
- No UI layout changed. No new screenshots, reset, migration down, push or deployment.

## Important limits

- Per-file caps do not protect total disk capacity. Atomic quotas must cover all upload paths,
  concurrent requests, retries and ambiguous remote writes; Storage RLS permission probes alone
  cannot reserve capacity. This is still a release gap.
- Recovery evidence is same-host/offline with preserved owners/ACLs, not an off-host restored HTTP
  stack. Use the trusted Supabase administrative role and reconcile the empty target's public schema.
- Public TLS, SMTP, proxy throttling/body limits, alerts and distinct-image rollback remain unverified.
- Real Miro account/board permissions, Firefox/WebKit, and concurrent-write paging remain open.
- Paging uses offsets, not a database snapshot, and collects all visible records into browser memory.

## Accepted decisions and continuity

- Agency may edit a shared version's Miro URL after approval/delivery without a new version or
  review reset. Identity, number and note remain immutable. Drive links stay separated by channel.
- Creative boards live in Miro; no R2. Remaining uploads use Supabase filesystem Storage.
- Clients must never receive designer identity, internal comments or unshared production artifacts.
- Canonical baseline stays 10/25; preserve the authorized live SABRE 10/68/50 overlay and checkpoint.
- Never run `supabase migration down` or `supabase db reset`; apply corrective migrations forward.
- AGENTS.md and CLAUDE.md are synchronized. No other orchestrator owns shared files.
- Earlier extension/action audit: [previous checkpoint](handoff-2026-09-27-pre-hardening.md)
  and [verification](../../verification/extension-role-actions-2026-09-27.md).

## Environment and next action

- Local app remains http://localhost:3003; API/DB 55421/55422, media 55430, mail 55424.
- Filesystem staging API/DB 56110/56111, web3113, media56114; canonical fixtures are already provisioned.
- Staging containers are stopped after verification; data/images/credentials are retained. Resume
  with `STAGING_STORAGE=file ./deploy/staging/scripts/stage.sh up`, then `app-up` with the same prefix.
- MinIO staging remains stopped and separate. Do not re-seed either existing dataset.
- Next: atomic aggregate storage limits, production proxy controls and off-host/HTTP recovery.
  Server/domain/SMTP details were requested asynchronously and remain unanswered.
- Push and external deployment still require an explicit request.
