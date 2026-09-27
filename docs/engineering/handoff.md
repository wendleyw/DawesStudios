# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex**, taking over both interrupted Claude tasks at the user's request.

## Ownership and recovery

- The user asked Codex to recover and finish both Claude sessions after their weekly usage limit.
- Recovered project-scoped session messages for `dawesstudios-9e` and `dawesstudios-f4`.
  Their workers stopped with rate-limit errors; the process check found no remaining test/editor
  commands, only idle tool servers and the existing `caffeinate` command. Do not resume competing writes.
- Preserved the current diff and untracked files under ignored `outputs/recovery-2026-09-27/`.
- Previous checkpoint: [pre-recovery history](history/handoff-2026-09-27-pre-recovery.md).
- Base commit: `f111bf6`. Existing `login.png` deletion is unrelated and remains outside this task.
- Codex owns integration, the checkpoint and acceptance evidence. Delegated paths must be disjoint.

## Completed task 1 — Drive links by channel

- Internal/client links are isolated by RLS and rendered per channel; agency edits both, Files reads client only.
- Integrated Claude's migration 0011, generated types/seed and scripts with the completed frontend.
- Forward migration 0012 rejects NULL channels; guarded SABRE removal blocks uncovered populated tables.
- Current checks: source gate 1,195 tests; Drive pgTAP 40; Python 22; Drive journey 1;
  navigation/Files journeys 8; canonical seed; canonical pgTAP 1,020; canonical browser 7; container build.
- [Integration evidence](../verification/drive-links-recovery-2026-09-27.md) records corrections and limits.

## Active task 2 — All-role functional and visual audit

- Recovered directive: audit every role, action, text, badge, status and layout, then fix findings.
- Claude's agency/client auditors stopped early; designers had not started. Working artifacts are
  under ignored `outputs/audit/`; the recovered brief is `.superpowers/sdd/all-roles-audit/brief.md`.
- Retire-Versions acceptance already ran after a reset approved in that Claude conversation:
  [record](../verification/retire-versions-acceptance-2026-09-27.md). Do not repeat that reset.
- Current canonical checks pass (seed, 1,020 pgTAP assertions and seven browser tests).
  The remaining 98 browser tests are running on the live overlay with disposable fixtures.
- Client/designer read-only audit completed 130 route visits and REST scope checks. Confirmed findings:
  designers can open Send to studio on delivered projects; service labels show raw catalog codes.
- Agency audit is finishing; collect its report, fix verified findings and repeat affected checks.
- SABRE guarded removal currently refuses newer credit timestamps and a lazily created Playground
  board. Diagnose and preserve genuine changes; do not weaken rollback guards or reset the overlay.

## Accepted decisions

- Creative work lives in Miro. R2 is not required; remaining app uploads use persistent filesystem
  Supabase Storage. [Production guide](../operations/production.md), [decision](handoffs/2026-09-27-production-without-r2.md).
- Official self-hosted Supabase plus web/media containers behind TLS; keep the upstream Realtime hostname.
- Miro is a project view with separate internal/client channels, immutable client versions and
  agency-only sharing/link writes. No Miro API or sync; copy/paste assets into Miro.
- Project covers are sanitized by media and visible to clients only when marked. Files delivers finals.
- Monthly credits support plans, extras, transfers, current plus 11 future months, and agency
  movement/one-time final settlement with a reason. Briefing submission is free; acceptance is atomic.
- Canonical baseline: 10 clients / 25 projects. Preserve the active SABRE overlay: 10 / 68 / 50 SABRE.
- Default theme is System per browser; designers see assigned work without credits or client identities.
- Every client person has a separate login and the same client permissions; studio manages membership.

## Environment and constraints

- Next.js dev server: `http://localhost:3003`; local Supabase ports 55421–55424; media port 55430.
- No competing dev server. Never `supabase migration down` or `supabase db reset`.
- Correct applied migrations forward. A fresh reset would need new explicit user approval.
- Existing disposable MinIO staging is running at web 3103, gateway 56010, database 56011 and media 56014
  for canonical checks; it does not verify the revised production filesystem Storage target.
- No push, PR or deployment requested. Complete each integrated task with a gate and Conventional Commit.

## Verification still required

- Finish all-role audit fixes and the 98-test overlay browser run; rerun SABRE HTTP/count checks
  after disposable browser fixtures have been cleaned up, then record the final gate.
- Real deployment remains deferred: persistent Storage/restore, TLS, SMTP and proxy rate limiting.
- J10 remains open. Prior matrix rows describing retired designs/video/Versions are historical.
- Existing known gaps include client re-invitation/multiple-client invitations, unknown-route HTTP 200,
  Safari/Firefox coverage and browser CI. Reconcile against current behavior during the audit.

## Next concrete action

Commit the verified Drive integration, then fix the delivered-action/service-label audit findings and
complete the all-role gate. Keep reconstructed Claude evidence separate from checks executed now.
