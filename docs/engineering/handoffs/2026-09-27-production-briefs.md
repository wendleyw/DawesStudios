# Private production briefs handoff

- Owner: Codex orchestrator; implemented and verified locally.
- Scope: per-design-board agency instructions, editor, designer reading and backend privacy.
- Source: projects/production-brief*, project data/details/workspace, briefings route/data,
  workspace project projection, related component/E2E tests and generated database types.
- Backend: forward migrations202609280001/002 applied; draft/released RLS, agency save RPC,
  expected revision/idempotency, internal deadline, one designer activity event.
- Designers no longer read original briefing/attachments/contracted quantities or description.
- Agency can edit scope/quantities/direction/service/references/deadline; explicit Save draft/Send.
- Existing boards await explicit release; no automatic copy or fixture releases remain.
- Client scope, credits, round/client-version status and manual Miro copy workflow unchanged.
- Gate: types/lint/format and132files/1289tests pass;197DB assertions;9HTTP/Auth/Storage tests.
- Chromium:3workflows pass; final production retest passes;5Axe/overflow checks pass.
- Integrity:122FK relationships pass;live10clients/68projects/50SABRE preserved.
- Canonical board-count browser case fails on overlay; assertion preserved, canonical not rerun.
- SQL lint: no errors; empty legacy endpoint has unused argument/output warnings.
- Concurrency/intake legacy suites not rerun; external Miro/reference access not verified.
- [Verification/captures](../../verification/production-briefs-2026-09-27.md).
- Docs: feature READMEs, architecture/privacy/workflow, checkpoint and domain aligned.
- Pending product decisions: public In progress at acceptance, hide Studio review from client,
  V1/V2/V3 remain review iterations; explicit revision handoff/tasks are future work.
- No push/deployment; unrelated login.png deletion preserved.
- Next: user prepares/sends the first real production brief locally; workflow thread may resume
  its separate revision/status implementation after an explicit ownership transfer.
