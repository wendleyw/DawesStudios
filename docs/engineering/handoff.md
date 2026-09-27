# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex**. All delegated writers have released ownership.

## Current result — unified project comments

- User approved consolidating Conversation and Feedback after identifying the duplicated toolbar.
- Implemented one Comments button with All activity and This version inside the panel.
- All activity reads the channel's general and version comments, and posts to Project. This version
  reads/posts only to the selected internal round or client version. The composer names its target.
- History shows scope labels; internal rounds include the board name. Channel changes keep the panel
  open and reset All activity. Drafts/retry keys remain isolated by viewer/project/channel/version.
- Thread remounting binds pending writes to their original target. Late success preserves a distinct
  follow-up draft. Identical trimmed submitted text is still treated as the same draft.
- Existing backend permissions and formal Approve/Request changes actions remain unchanged.
- Feature/help/architecture documentation updated. No DB/schema change.
- Evidence: [unified comments](../verification/unified-comments-2026-09-27.md).
- Existing `login.png` deletion is unrelated and remains outside this task's commit.

## Checks executed in this task

- Source gate: types, lint, formatting, 126 Vitest files / 1,224 tests passed.
- Final browser selector edits: typecheck, targeted ESLint and format:check passed.
- Production web/media images rebuilt and ran healthy in filesystem staging.
- Chromium: 16 relevant cases passed (15 combined, then corrected design-audit case).
- Canonical browser: 10 clients / 25 projects, 13 actors, 79 project visits, no captured page errors.
- Design audit: 42 surfaces across widths 390/768/1000/1024/1600, no app axe/overflow findings.
- Client Comments desktop/mobile captures inspected; scope, destination, focus and mobile composer
  reachability verified. External Miro iframe content is outside this audit.
- Canonical HTTP verification passed scopes/credits and 110 actual downloads.
- Final live SQL: 10 clients / 68 projects / 50 SABRE, zero Acceptance projects.
- Failed initial runs and fixes are recorded in the verification record, not counted as passing gates.
- In-app browser runtime returned no browsers; ordinary Playwright Chromium supplied browser evidence.

## Accepted decisions and continuity

- Agency may edit a shared version's Miro URL after approval/delivery without a new version or
  review reset. Identity, number and note remain immutable. Drive links stay separated by channel.
- Creative boards live in Miro; no R2. Remaining uploads use Supabase filesystem Storage.
- Clients must never receive designer identity, internal comments or unshared production artifacts.
- Canonical baseline stays 10/25; preserve the live SABRE 10/68/50 overlay and rollback checkpoint.
- Never run `supabase migration down` or `supabase db reset`; apply corrective migrations forward.
- AGENTS.md and CLAUDE.md remain synchronized. No other orchestrator owns shared files.
- Prior work: [preproduction checkpoint](history/handoff-2026-09-27-pre-comments.md) and
  [hardening evidence](../verification/preproduction-hardening-2026-09-27.md).

## Remaining production work

- Atomic aggregate capacity protection across all upload paths, retries and ambiguous remote writes.
  Existing 50 MiB per-file caps do not protect total capacity; RLS probes cannot reserve it.
- Production TLS, SMTP, proxy throttling/body limits, monitoring alerts and off-host/HTTP recovery.
- Distinct-image rollback rehearsal, real Miro permissions, Firefox/WebKit and DB/browser CI.
- Project-details extraction remains a maintainability follow-up. Ordered offset pagination is not
  a snapshot and eventually holds all visible records in browser memory.
- Previous DB/media/backup results are historical evidence, not rerun as part of this UI task.

## Environment and next action

- Live app remains http://localhost:3003; API/DB 55421/55422, media 55430, mail 55424.
- Filesystem staging API/DB 56110/56111, web3113, media56114; fixtures already provisioned.
- Staging is stopped after verification; data/images/credentials retained. Resume with
  `STAGING_STORAGE=file ./deploy/staging/scripts/stage.sh up`, then `app-up` with the same prefix.
- MinIO staging remains stopped and separate. Do not re-seed either existing dataset.
- Next: resume aggregate storage limits, production proxy controls and off-host/HTTP recovery.
  Server/domain/SMTP details previously requested remain unanswered.
- No push or external deployment. Both still require an explicit request.
