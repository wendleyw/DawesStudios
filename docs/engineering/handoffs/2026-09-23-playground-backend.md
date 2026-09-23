# Playground backend and data contract

- Updated at: 2026-09-23T05:56:13Z
- Reporting agent and tool: continuity_code_map / Codex
- State: tested (database, real HTTP/Storage, concurrency and source checks passed; final browser integration remains orchestrator-owned)
- Objective: Implement role-isolated persistent client/project brainstorming boards, guarded private files, item revisions and retry-safe feature data functions matching the orchestrator's Playground contract.
- Owned paths: `supabase/migrations/202609230003_playground.sql`, `202609230005_playground_staged_cleanup.sql`, `202609230006_playground_conflict_response.sql`, `supabase/tests/database/playground.test.sql`, `supabase/tests/playground_storage_http_test.py`, `apps/web/features/playground/playground-data.ts`, `apps/web/features/playground/playground-types.ts`, and this report. The orchestrator explicitly extended ownership to migrations 005/006 and the HTTP test after initial integration.
- Dependencies: `docs/architecture/playground-and-board-widgets.md`; active membership helpers from migrations `202609230001`/`002`; Supabase Storage; orchestrator-owned shared generated database types; UI worker owns all other Playground files.
- Acceptance criteria: real role/scope persistence; inaccessible cross-role/tenant/removed-member data; explicit grants; stable insert identity and guarded revisions; ownership-bound private attachments; observable cleanup/retry behavior; meaningful authorization/conflict database tests.

## Completed work and changed files

Created the seven assigned implementation/test files and this report. No existing Team/startup changes or untracked planning artifacts were replaced. The orchestrator, not this worker, applied migrations and regenerated shared database types after the SQL was declared ready.

- `202609230003_playground.sql` creates `playground_boards`, `playground_items`, explicit RLS and grants, the private `playground-assets` bucket, three item/scope RPCs and one cleanup-discovery RPC, and supporting private authorization/path/payload helpers.
- `playground-data.ts` exposes the exact agreed query/mutation/upload/download interfaces. All data access stays inside the feature. Components own field validation, stable UUIDs, retries, and draft state.
- `playground-types.ts` exposes the agreed item/input/scope/result types and a shared MIME/size allowlist for the UI.
- `playground.test.sql` adds 51 rollback-contained assertions covering role/tenant/scope isolation, insertion/update/deletion replay, stale revision refusal, direct-write denial, Storage/item namespace binding, uploader ownership, pending cleanup discovery, stale-stage retention, revoked designer access, removed members, and actual anonymous execution denial plus ACLs.
- `202609230005_playground_staged_cleanup.sql` extends cleanup to the caller's abandoned, unclaimed uploads older than 24 hours, preserving recent and other-uploader stages.
- `202609230006_playground_conflict_response.sql` changes business conflicts to `PT409`, the existing application convention, after real HTTP concurrency exposed PostgREST's handling of `40001`.
- `playground_storage_http_test.py` exercises real file bytes, Storage and RPC boundaries through existing local-only helpers. It creates an isolated client/project with existing fixture sessions and cleans all its temporary objects/rows afterward.

## Decisions and interface changes

### Scope and authorization

Each `(client, optional project, role)` has exactly one board. The current database role is authoritative. Agency has no bypass to client/designer boards. A project must belong to the stated client and be accessible to the caller; designers lose project Playground access when assignment is revoked. The active-member helpers close access to removed accounts even with a previously issued token.

No author identity is stored or returned in item payloads. Tables permit authenticated reads under RLS only; all writes use definer RPCs with an empty search path and explicit `PUBLIC`/`anon` revokes. Direct profile IDs, roles and target board IDs cannot be used to cross the scope checks.

### Item bounds, concurrency and retries

- Maximum 500 active items per board; title 160 characters; body 20,000 characters; coordinates from -100,000 to 100,000; width/height from 100 to 2,400.
- Stable item UUIDs implement insert retries. An identical insert at revision one returns the existing row. Different content under that ID conflicts.
- Updates require the saved revision. A lost-response retry with identical complete content at `expectedRevision + 1` returns the committed row without another increment. Other stale payloads fail with code `PT409` and immediate HTTP 409, preserved on the JavaScript `Error` for UI conflict recovery. The UI worker was informed to recognize this final code.
- Item kind, file path and MIME are immutable after insertion. Attachment replacement creates a new item; title/body/position/size remain editable.
- Per-board and per-item advisory locks serialize limits and item mutations. Storage insert/delete checks acquire the same item lock, preventing a staged-file discard from racing an attachment save.

These bounds and replay details were sent to the UI worker before its implementation depended on them.

### Private files and cleanup

Paths are exactly `<board UUID>/<item UUID>/<safe filename>`. SQL verifies the path's board and item, caller ownership of the staged object, MIME and stored size. Only PNG/JPEG/WebP/GIF images and the agreed PDF/text/CSV/RTF/Office formats are allowed, at up to 25 MiB. No overwrite policy exists. Staged files are readable only by their uploader; saved files are shared within the authorized role board. Documents get short-lived URLs with forced download disposition; image previews get ten-minute signed URLs renewed by the open query.

`uploadPlaygroundFile` always uses `upsert:false`. After an error, an existing private object can count as the completed upload only when MIME, size and SHA-256 match the original `File`; a duplicate filename or matching size alone is insufficient.

Deletion uses a hidden tombstone preserving revision and exact attachment path. Database deletion commits first; Storage cleanup follows. Failed cleanup remains retryable with the same deletion input. At the orchestrator's request, `get_playground_cleanup(boardId)` exposes authorized tombstone paths that still have stored objects, so the query also retries deletion when the Playground reopens or refreshes after a reload.

The only additive UI contract is `PlaygroundData.cleanupError?: string`: pending cleanup failures remain visible while the active canvas stays available. The UI worker was informed to display the warning and a retry action. Cleanup discovery processes up to 100 paths per query; a later refresh handles the next batch.

The final cleanup RPC also discovers the current uploader's unclaimed staged files older than 24 hours in the authorized board. This is lazy cleanup on opening/refreshing that board, not a permanently running sweeper. Recent uploads and another uploader's files are excluded. Storage's item lock rechecks a discovered stage at delete time, so a file saved meanwhile is retained. If cleanup wins before an old draft saves, the server reports a missing upload; the UI worker was told to retain its `File` and restage with the same path before retrying. A committed item never enters this staged-file sweep.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| Read project contract, current handoff, project-structure skill, testing skill and its universal rules | Current working tree, 2026-09-23 | Followed existing feature/data boundaries and transaction-contained pgTAP patterns. | Assigned implementation paths |
| `apps/web/node_modules/.bin/prettier --write apps/web/features/playground/playground-data.ts apps/web/features/playground/playground-types.ts` | Repository root | Passed; both owned TypeScript files formatted. | TypeScript files |
| `npx eslint features/playground/playground-data.ts features/playground/playground-types.ts` | `apps/web`, before and after implementation finished | Passed, no errors or warnings for owned files. | Current source |
| `npx prettier --check features/playground/playground-data.ts features/playground/playground-types.ts` | `apps/web`, final check | Passed. | Current source |
| `npx tsc --noEmit --pretty false` | `apps/web`, after parent generated types | Owned modules reported no errors; whole command failed on the concurrently edited `tests/e2e/playground-fixture.ts:68` and `:69` (`UserResponse` allows `user:null`). Reported to parent; not claimed as a global pass. | Parent-owned fixture integration |
| `supabase test db supabase/tests/database/playground.test.sql` — first run | Local Supabase after parent applied migration | 43 assertions passed, then local PostgreSQL terminated the connection while pgTAP invoked the denied RPC under `anon`. Overall FAIL due to missing TAP finish. The same engine failure was independently observed by the widget worker. | Initial test result |
| Replace only that denied-call assertion with `has_function_privilege('anon', 'public.get_playground_board(uuid,uuid)', 'execute') = false`, then rerun the same command | Local Supabase, 2026-09-23 | **PASS: 44 assertions, one file.** All test mutations rolled back. | `supabase/tests/database/playground.test.sql` |
| Restore the actual anonymous denied-call assertion after the orchestrator confirmed its scoped `supautils.hint_roles` runtime workaround; run `supabase test db supabase/tests/database/playground.test.sql` with migrations 005/006 applied by parent | Local Supabase, final run | **PASS: 51 assertions, one file**, including actual anonymous `42501` refusal, cleanup TTL, concurrent-candidate save protection, and final `PT409` conflict codes. All test mutations rolled back. | Final database test |
| `python3 supabase/tests/playground_storage_http_test.py` — initial run and isolated concurrency reproduction | Local HTTP stack | Real bytes/role isolation/cleanup passed. Found two issues: Storage list correctly returns `200 []` for anonymous callers, requiring an empty-data assertion; revision conflict code `40001` caused an HTTP request to exceed 20 seconds. Reproduced the latter with only the concurrency scenario before changing behavior. | HTTP test and migration 006 |
| `python3 supabase/tests/playground_storage_http_test.py` — final run after 006 | Local HTTP stack | **PASS: six tests in 0.846 seconds.** All three roles upload/save/download identical PNG, plain text, PDF and DOCX bytes through authenticated and signed URLs; other roles cannot read/sign them; foreign uploads and HTML are refused; duplicate writes cannot replace bytes; live attachments cannot be discarded; committed deletion cleanup survives a fresh RPC; two competing edits yield one success and one immediate `PT409`/HTTP 409. Anonymous RPC returns 401 and Storage exposes no rows. Temporary client/project/boards/items/files removed by guarded cleanup. | Final HTTP test |
| `python3 -m py_compile supabase/tests/playground_storage_http_test.py` | Repository root | Passed. | HTTP test |
| `npx tsc --noEmit --pretty false` followed by owned-file ESLint and Prettier checks | `apps/web`, 2026-09-23T05:56:13Z | **All passed.** The earlier concurrent fixture type error is resolved; no global TypeScript failure remains at this snapshot. | Current integrated source |
| `git diff --check` | Repository root, final check | Passed. | Working tree |

No migration was applied, shared database types generated, or browser suite run by this worker. Database tests exercise transaction-contained object metadata and policies; the separate HTTP suite additionally verifies real uploaded/downloaded bytes and cleans them afterward. Runtime service compatibility changes were performed only by the orchestrator.

## Remaining risks and next action

1. The orchestrator must finish the browser-level draft/retry/upload-return interaction and visual/accessibility audit. Current HTTP evidence proves actual bytes, authorization, deletion recovery and concurrent conflict responses; it does not establish that every UI recovery control is wired correctly.
2. Staged files become eligible after 24 hours and are cleaned when their uploader opens/refreshes the authorized role board. No background job is introduced. Files whose uploader never returns require a future operator retention policy if automatic global reclamation is desired; this implementation does not claim that a passive bucket deletes files by elapsed time alone.
3. Previously minted signed URLs remain bearer capabilities until expiration (ten minutes for image previews, one minute for downloads). New authenticated reads/signing operations enforce current membership and scope. This follows the application's existing private-Storage model.
4. Whole-project compilation passed at the final snapshot; final build and browser integration remain owned by the orchestrator. The local PostgreSQL compatibility workaround must stay in the orchestrator's documented startup path so genuine denied-call checks remain reliable on the affected image.

## Ownership at handoff

All assigned code and report paths are released to the orchestrator. No worker-started service/process remains. The running application, database lifecycle, existing power assertion, canonical fixtures, and unrelated changes were preserved. This worker ran only the explicitly authorized rollback-contained database file and guarded ephemeral HTTP fixture suite.
