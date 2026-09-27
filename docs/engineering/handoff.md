# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Codex**. No delegated writer remains active.

## Current result

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

## Checks executed in this session

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

The requested extension/action pass is integrated. Use the browser guide if relay attachment
fails again; a new session may be needed to expose personal MCP tools natively. The next separate
release task is J10 operational verification when requested. No push or release is authorized.
