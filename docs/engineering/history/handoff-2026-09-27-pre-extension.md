# Archived checkpoint before extension audit integration

Updated: 2026-09-27 EDT. Owner: **Codex**, running the requested Playwright extension and role-action audit.

## Ownership and recovery

- The user asked Codex to recover and finish both Claude sessions after their weekly usage limit.
- Recovered project-scoped session messages for `dawesstudios-9e` and `dawesstudios-f4`.
  Their workers stopped with rate-limit errors; the process check found no remaining test/editor
  commands, only idle tool servers and the existing `caffeinate` command. Do not resume competing writes.
- Preserved the current diff and untracked files under ignored `outputs/recovery-2026-09-27/`.
- Previous checkpoint: [pre-recovery history](handoff-2026-09-27-pre-recovery.md).
- Base commit: `f111bf6`. Existing `login.png` deletion is unrelated and remains outside this task.
- Codex owns integration, the checkpoint and acceptance evidence. Delegated paths must be disjoint.

## Completed task 1 — Drive links by channel

- Internal/client links are isolated by RLS and rendered per channel; agency edits both, Files reads client only.
- Integrated Claude's migration 0011, generated types/seed and scripts with the completed frontend.
- Forward migration 0012 rejects NULL channels; guarded SABRE removal blocks uncovered populated tables.
- Current checks: source gate 1,195 tests; Drive pgTAP 40; Python 22; Drive journey 1;
  navigation/Files journeys 8; canonical seed; canonical pgTAP 1,020; canonical browser 7; container build.
- [Integration evidence](../../verification/drive-links-recovery-2026-09-27.md) records corrections and limits.

## Completed task 2 — All-role audit

- Recovered directive: audit every role, action, text, badge, status and layout, then fix findings.
- Agency audit: 86 route/viewport visits and 14 axe samples. Client/designers: 130 route visits,
  network role checks and mobile/dark inspection. System tour: 147 surfaces, zero overflow,
  serious/critical accessibility violations or uncaught exceptions in the application.
- Broad browser pass: 95/95 active overlay tests plus 7/7 canonical tests. The three optional
  system-tour tests were then enabled explicitly and passed. Miro regression: 2/2.
- Fixed delivered-project Send/Share/New version controls, repeated sharing of an already-shared
  round, and raw service names in Details. Desktop/mobile rechecks passed for agency and both designers.
- Also fixed existing-client and removed-client invitations. Forward migrations 0013–0016 are applied
  locally and in staging; trusted token metadata preserves passwords and validates email before mutation.
  Return waits for completed Auth removal; stale memberships are deleted before restoring access.
- Final gate: source 1,206 tests; canonical pgTAP 1,052; corrected invitation/intake/Miro browser 10/10;
  container build; SABRE HTTP 42/42; canonical seed. Dependency audit and history secret scan passed.
- [Audit evidence](../../verification/all-roles-recovery-2026-09-27.md) records scope, screenshots and limits.
- SABRE removal guard deliberately refuses the old snapshot: missing Drive table coverage plus
  newer credit timestamps and Playground data. Preserve both live state and ignored checkpoint.

## Accepted decisions

- Creative work lives in Miro. R2 is not required; remaining app uploads use persistent filesystem
  Supabase Storage. [Production guide](../../operations/production.md), [decision](../handoffs/2026-09-27-production-without-r2.md).
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
- Disposable MinIO staging was stopped after the final production-image browser pass (7/7), with
  containers/volumes retained. It does not verify the production filesystem Storage target.
- No push, PR or deployment requested. Complete each integrated task with a gate and Conventional Commit.

## Verification still required

- Application audit is complete within its documented browser/dataset scope. No reset was performed;
  final local counts are 10/68/50, with zero Acceptance clients/projects or orphan Drive rows.
- Real deployment remains deferred: persistent Storage/restore, TLS, SMTP and proxy rate limiting.
- J10 remains open. Prior matrix rows describing retired designs/video/Versions are historical.
- Known limits: dummy Miro boards are not live creative content; unknown routes can stream the
  unavailable page with HTTP 200; Safari/Firefox coverage and browser CI remain outside this pass.

## Next concrete action

Both recovered tasks are integrated: Drive `85d0a6f`, all-role recovery `d804799`.
The user now requested Playwright MCP extension setup and a fresh action-by-role test pass.
The personal extension server is already configured; a new MCP handshake succeeded, but browser
attachment and this new audit are not yet verified. Inventory is delegated read-only; Codex owns
browser actions, integration and evidence. No push or production release is authorized.
