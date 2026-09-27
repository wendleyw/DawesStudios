# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex**. No delegated writer remains active.

## Current result — preproduction review

- The user asked what remains to analyze/refactor before production. The read-only review is
  [recorded here](../verification/preproduction-review-2026-09-27.md); proposed fixes are not applied.
- Fresh checks: web/media dependency audit 0 advisories; gitleaks 547 commits with no detected leaks;
  read-only SQL confirmed the legacy 1 GiB internal-assets bucket versus the 50 MiB upload UI.
- Priorities: backend upload budgets, production-shaped filesystem/TLS/SMTP staging, backup/restore,
  explicit release-image selection, proxy limits/alerts, real Miro permissions and pagination.
- Targeted refactor: extract project-details dialogs while preserving the data-access boundary.
  CI lacks database/browser/build gates; large-dataset behavior and actual host operation remain unverified.

## Previous completed work — extension/action audit

- Completed the requested Playwright MCP extension connection and fresh role-action audit.
- The initial relay WebSocket error cleared after a fresh connection. Actual Chrome actions ran
  through a temporary standard MCP SDK client; native Playwright tools were absent in this session.
- Agency, both designers and client completed board/round/share/review flows. Delivery completed
  through the extension; normal Playwright verified upload and exact client download bytes.
- The extension rejected native file upload (`DOM.setFileInputFiles: Not allowed`) and did not
  return the download event. Keep the normal CLI browser suite alongside interactive extension QA.
- Corrected stale Help text; added all-role account, logo/campaign and working-file cases;
  expanded competitor/project edits and the full Miro delivery/link-editing regression.
- [Action audit](../verification/extension-role-actions-2026-09-27.md) records coverage, corrections,
  final screenshots and limits. [Browser guide](browser-testing.md) records setup/troubleshooting.
- Prior recovery details: [archived checkpoint](history/handoff-2026-09-27-pre-extension.md).
  Drive recovery is committed as `85d0a6f`, role/invitation fixes as `d804799`, no-R2 docs as `b1d4e19`.
- Existing `login.png` deletion is unrelated; leave it outside this task's commit.

## Accepted decisions

- The user confirmed on 2026-09-27 that the agency may edit a shared version's Miro link.
  Identity, number and note remain immutable; link edits after approval/delivery preserve reviews
  and do not create a new version or reopen approval. A valid link is required. Existing behavior
  implements this; the new browser regression verifies it. AGENTS.md and CLAUDE.md are synchronized.
- Creative work lives in Miro. R2 is not required; app uploads use Supabase persistent filesystem
  Storage. See [production guide](../operations/production.md).
- Official self-hosted Supabase plus web/media containers behind TLS; keep upstream Realtime hostname.
- Internal/client channels stay separate; designer boards stay isolated. Files delivers final files.
- Monthly credits retain atomic acceptance and current plus 11 future month rules.
- Canonical baseline stays 10 clients / 25 projects; live SABRE overlay stays 10 / 68 / 50 SABRE.

## Prior checks — extension/action audit

- Final source gate: types, lint, formatting; 124 Vitest files / 1,206 tests pass.
- 113 distinct Chromium cases have passing executions across runs/reruns. This was not one clean
  invocation: shared trace paths and new test selectors were corrected, then affected cases passed.
- Settings/account final run: 5/5. Miro delivery/privacy plus post-delivery link edit: 2/2.
- Explicit system tour: 147 surfaces, zero overflow, serious/critical axe violations or page errors.
  External Miro placeholders produced failed requests; their real board contents were not verified.
- Canonical pgTAP: 26 files / 1,052 assertions. Canonical seed: 10 clients / 25 projects, reconciled
  credits, scopes and 110 real file downloads. Staging used the existing app image.
- Final SABRE HTTP: 42/42; clean live counts 10/68/50; zero Acceptance clients/projects/users and
  orphan Drive links. Temporary MCP and regression fixtures were removed through guarded helpers.
- Help copy inspected through Chrome extension at desktop 1600×1000 and mobile 390×844.
- No database reset, migration down, migration change, push or deployment occurred.

## Environment and remaining scope

- Local app: `http://localhost:3003`; Supabase API/DB 55421/55422; media 55430; mail 55424.
- The audit's Chrome tab was signed out and closed; other tabs and personal MCP configuration remain.
- Canonical staging was resumed for checks, then stopped with containers/volumes retained.
  It uses MinIO and does not verify production persistent filesystem Storage.
- Never run `supabase migration down` or `supabase db reset`; correct migrations forward.
  Preserve the live SABRE data and guarded ignored rollback checkpoint.
- J10 remains open for production Storage/restore, TLS, SMTP and proxy rate limiting.
- Other limits: real external Miro content, Firefox/WebKit and browser CI. Unknown routes can
  stream the unavailable UI with HTTP 200. Older matrix rows for retired design/video models
  remain historical evidence, as marked at the top of the acceptance matrix.

## Next concrete action

The review is complete; its prioritized changes await an implementation request. Start with the
backend upload budget and a production-shaped staging/release configuration, preserving SABRE.
No implementation, push or release was authorized by the review question.

## Local test adjustment — Welcome Email Journey

- User requested reopening SABRE's Welcome Email Journey on 2026-09-27. Its delivered project
  is now `client_review`; existing V1 is `pending`. Previous rows are backed up and privately audited.
- [Verification](../verification/welcome-email-review-reopen-2026-09-27.md): targeted API, preservation
  and file-access checks pass. SABRE HTTP passes 41 checks; its final fixed 10-file assertion now
  sees 9 because this project's file is hidden again. The assertion and original checkpoint remain.
- Next: refresh the app and repeat client review. The preproduction task above remains in progress.
