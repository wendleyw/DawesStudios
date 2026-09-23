# Project-only Playground backend

- Updated at: 2026-09-23T07:30:16Z
- Reporting agent and tool: continuity_code_map / Codex
- State: verified within the assigned backend scope
- Objective: require project-scoped Playground access, preserve inaccessible legacy content, and retain role, tenant, file and revision guarantees.
- Owned paths: `supabase/migrations/202609230007_project_playground.sql`; `apps/web/features/playground/playground-data.ts`, `playground-types.ts`, `playground-data.test.ts`; `supabase/tests/database/playground.test.sql`; `supabase/tests/playground_storage_http_test.py`; this report.
- Dependencies: [current plan](../../architecture/project-playground-and-video-optimization.md), [checkpoint](../handoff.md), migrations 003–006, orchestrator-owned migration application/shared types/runtime.
- Acceptance criteria: null/omitted scopes and known legacy identifiers are denied across RPC/RLS/Storage; project/role isolation and retry behavior remain functional; original rows and files remain unchanged.

## Completed work and changed files

- Migration 007 adds `playground_requires_project CHECK (project_id IS NOT NULL) NOT VALID` at line 4. Existing rows remain unchanged; new null inserts/updates fail even for privileged direct writes. The orchestrator reviewed and applied this migration; this worker did not apply it.
- The shared access helper at migration line 9 now joins a matching project/client and checks the current active role plus both client/project authorization. Existing board/item SELECT policies, save/delete/cleanup RPCs and all three Storage policies already delegate to this guard, so known legacy UUIDs confer no access.
- The resolver at migration line 19 rejects omitted/explicit-null projects with SQLSTATE `42501`, retains the project/role advisory lock and returns existing project boards idempotently. Grants remain explicit and exclude anonymous execution.
- `PlaygroundScope.projectId` is required. The data hook sends it explicitly, separates cache entries by project/user/role and disables automatic fetches for obsolete runtime callers lacking a project. Write/retry/file APIs retain their signatures and semantics.
- Added six colocated data regressions. Expanded pgTAP from 51 to 72 assertions, including own-role legacy SELECT/save/update/delete/cleanup/Storage denial, privileged null insert refusal, preserved legacy contents, and separate same-client projects. Expanded HTTP from six to eight scenarios with two ephemeral projects and all three roles, required project scope, privileged direct insert rejection, and read-only probes of existing legacy content.

## Decisions and interface changes

- The SQL default remains `NULL` only so old calls receive an explicit authorization error. It never creates or resolves a workspace board. UI and root integration were notified before changing the TypeScript interface.
- Legacy rows are retained without deletion, reassignment or cleanup. The NOT VALID constraint is intentional until an explicit legacy-content decision exists; it must not be validated while null rows remain.
- The pgTAP legacy fixture is synthetic and transaction-contained. It drops/recreates the CHECK under the transaction's exclusive table lock, restores the production constraint before exercising access, then rolls everything back. No original legacy item is used for destructive probes.
- Storage DELETE policy coverage uses `SET LOCAL storage.allow_delete_query='true'`, matching the Storage API and the existing trusted-media SQL test. This is test-transaction state, not a persistent runtime change or ACL bypass.
- HTTP legacy probes are read-only: board/item reads, cleanup discovery, authenticated download and URL signing. They never attempt to delete or overwrite an original user object.

## Checks actually executed

All checks below ran on 2026-09-23 around 07:28–07:30 UTC against the integrated local working tree. These are fresh results, not the prior feature's evidence.

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run test -- features/playground/playground-data.test.ts` | `apps/web`, Vitest/jsdom | 6/6 passed | Colocated test file: explicit scope, project/role cache separation, absent-scope disablement, denied reads and cleanup, PT409 retention |
| `npx eslint features/playground/playground-data.ts features/playground/playground-types.ts features/playground/playground-data.test.ts` | `apps/web` | Exit 0, no findings | Owned TypeScript paths |
| `npx tsc --noEmit` | `apps/web`, after root regenerated shared types | Exit 0 | Integrated source typecheck |
| `npx prettier --write features/playground/playground-data.ts features/playground/playground-types.ts features/playground/playground-data.test.ts` | `apps/web` | Exit 0 | Formatted owned files |
| `python3 -m py_compile supabase/tests/playground_storage_http_test.py` | Local Python | Exit 0 | HTTP test syntax |
| `supabase test db supabase/tests/database/playground.test.sql` | Local Supabase, migration 007 already applied by root | Final: 72/72 passed | Includes actual anonymous execution denial, removed membership, revoked assignment, staged ownership/cleanup, stale edit/delete and legacy preservation |
| `python3 supabase/tests/playground_storage_http_test.py` | Isolated local endpoint guarded by existing HTTP helper | 8/8 passed in 1.049 s; class cleanup completed | Real PNG/PDF/text/DOCX bytes for agency/client/designer; cross-role/tenant denials; duplicate upload protection; delayed deletion recovery; concurrent edits return one 200 and one PT409/409 |
| Read-only table digest and original Playground file SHA-256 comparison | Against `/tmp/dawes-project-playground-video-before-20260923.json` | All four checked table digests and 32 file hashes identical | Results below |

The first pgTAP attempt stopped after 20 passing assertions because Storage's direct-delete protection trigger rejects SQL DELETE without its API transaction flag. The added local flag allowed testing the intended RLS boundary; the complete rerun passed. Both attempts ended their test transaction without persistent fixtures.

Final preservation observations:

| Inventory | Count | Initial snapshot comparison |
| --- | ---: | --- |
| Clients | 10 | Entire table digest unchanged |
| Projects | 25 | Entire table digest unchanged |
| Playground boards | 4 | Entire table digest unchanged; two remain workspace-only |
| Playground items | 32 | Entire table digest unchanged |
| Playground stored objects | 32 | All 32 original byte hashes unchanged |
| Clients named `Playground HTTP %` | 0 | HTTP fixture cleanup complete |

The comparison reused `startup_preservation_test.sql()` for SELECT-only table digests and the existing guarded HTTP helper for service-authorized reads. It printed counts and equality results only; no credentials were logged or saved.

## Remaining risks and next action

- Previously minted signed URLs remain valid until their original expiry (up to ten minutes for image previews; one minute for attachment downloads). New reads/signing are denied. This migration does not retroactively invalidate an already issued capability.
- The legacy-content transfer/archive decision remains with the user and orchestrator. No arbitrary destination was chosen.
- Whole-database suites, rebuilt browser interaction/animation checks and video work are outside this bounded validation. Root should integrate the UI, run the complete acceptance checks and update shared documentation/checkpoint. No media integration or runtime lifecycle actions were performed here.

## Ownership at handoff

All owned paths are released to the orchestrator. No test process or worker-owned background process remains active. No source outside the listed paths, shared types, runtime settings or original user content was changed by this assignment. This report verifies the backend change only and does not approve a release.
