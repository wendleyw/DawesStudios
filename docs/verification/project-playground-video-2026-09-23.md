# Project Playground layer and video efficiency verification

Status: feature revision implemented and verified locally. Date: 2026-09-23. Owner: Codex orchestrator. This is not whole-product release approval.

## Scope and preserved work

The project-only Playground revision replaces the earlier modal/client-board interaction. Existing Team/startup/Playground/widget work remains uncommitted and preserved. No commit or public deployment was performed. The broader product acceptance matrix remains separate.

The [initial snapshot](project-playground-baseline-2026-09-23.json) contains 10 clients, 25 projects, four Playground boards (two legacy workspace scopes and two project scopes), 32 saved Playground items and 149 stored files. Legacy workspace rows/files remain archived without authenticated access; they were not assigned to arbitrary projects. The [post-Playground comparison](project-playground-preservation-2026-09-23.json) proves identical state for all 35 public tables and all 149 stored-file SHA-256 values after migration and focused browser tests. Original reference/brand artifacts were not changed.

## Playground result

- One project-owned named region slides down over the work area and slides up before closing. Header/app navigation remain usable; no modal/backdrop/body lock or global focus trap. Only the obscured work area is inert and remains mounted, retaining its viewport. Reduced motion skips the animation.
- Playground is absent from the client board. Migration `202609230007` requires project scope, enforces role/project/tenant access at RPC/table/Storage boundaries, and preserves legacy rows through an unvalidated CHECK that rejects future null-project writes.
- Upload/edit forms temporarily close their native dialog without unmounting fields or selected files. Returning reopens the same form; a real final image upload was verified.
- Saving, multi-file drop, real private download, drag/resize, keyboard geometry, conflicts, stale removals, uncertain-response retries and cleanup retain their existing behavior. Save/discard guards protect ordinary app links and explicit close; browser history/programmatic navigation can still abandon in-memory drafts, as documented in the feature README.

## Checks completed for the Playground gate

| Check | Actual result |
| --- | --- |
| `npm run check` | 574 tests / 46 files; TypeScript and formatting passed; zero lint errors, one pre-existing board hook warning |
| Production web build and healthy container | Passed after keyboard correction |
| `npm run db:test` | 337 assertions / 15 files passed |
| `supabase db lint --local --schema public,private` | No schema errors |
| Playground HTTP suite | 8 passed, including role/project and legacy denials |
| Existing HTTP/Auth/Storage suite | 9 passed |
| `npm --prefix apps/web run test:e2e -- playground` | 9/9 passed in 21.5 seconds against rebuilt web |
| Manual desktop/mobile screenshots | Inspected 1600 × 1000 and 390 × 844; project containment, usable inspector and no horizontal overflow |
| Baseline comparison | All 35 public tables and 149 stored files unchanged |

Intermediate failures were resolved: fixture heading selectors matched widget headings as well as the client heading; a disabled Save button did not prove persistence finished; CSS keyframe `to` was incorrectly treated as an element selector by a structural test; and Chromium moved focus to the body after disabling Save, preventing locally handled Escape. The final run uses scoped headings/committed status, excludes keyframe offsets from selector comparisons, and handles Escape only when focus is in the layer or has fallen to the body. These are recorded corrections, not remaining failures.

## Video efficiency results

The [browser baseline](video-loading-baseline-2026-09-23.json) uses 20 distinct four-second, 27,682-byte clips. Before opening a design, the board creates 20 video elements, signs 20 URLs and fetches 553,640 media bytes across 20 requests. This is a repeatable request-count measurement, not a large-file throughput claim. The baseline [audit](../engineering/handoffs/2026-09-23-video-optimization-baseline.md) also confirms disk streaming and metadata-stripping stream-copy remux already exist.

The [after measurement](video-loading-after-2026-09-23.json) uses the same 20 clips and observation window. Passive project tiles now create **zero video elements, signing calls, media GETs or media bytes**. Opening one design signs and fetches only that clip (one request, 27,682 bytes). Viewer metadata became available in 56 ms in the final run versus 58 ms in the baseline; those single observations are not a latency-improvement claim. The main client board also avoids signing/downloading videos as images and retains the selected version on its Video tile.

The player retains one media element and restores time, playback rate and paused/playing state after renewing its signed URL. Browser verification shortens only the 55-minute video query interval to two seconds, without changing the Auth clock. Both paused-at-two-seconds and active playback survive actual new signed URLs. Delaying the renewal's media response proves Add pin is disabled and canvas interaction creates no zero-time draft until the restored frame is ready. This closes the independent review's material finding; timed marker/list handlers use the same readiness guard.

The server computes SHA-256 and byte count while uploading, then passes that trusted result to the existing attestation RPC only after uncancelled nonempty EOF and successful HTTP completion. The [repeatable 4 MiB benchmark](media-upload-io-2026-09-23.json) shows **8 MiB → 4 MiB application bytes read** for upload plus attestation in each of internal sanitization and publication copying, with the same SHA, uploaded bytes and recorded size. It measures neither physical disk I/O nor total pipeline latency. Metadata stripping, stream-copy remux, provenance and immutable publication are unchanged. Uncertain publication uploads now also attempt cleanup of their newly allocated target.

Final source gate passed **593 tests / 49 files**, TypeScript, formatting and lint (zero errors, one existing board hook warning). Media unit tests passed **45 / three files**. Rebuilt media passed **15 existing raster/PDF HTTP integration checks**; the separate real video browser flow passed upload, sanitization, publication, three-role timed feedback and client REST privacy. The focused video browser run passed **2/2** in 11.3 seconds. The [independent audit](../engineering/handoffs/2026-09-23-project-layer-video-review.md) found the corrected timing issue and no further new material defect in its reviewed scope.

The complete browser suite passed **51/51 in 3.0 minutes** before the last responsive-viewer correction. Manual inspection then found that resizing an already open viewer from desktop to mobile could crop the video. The viewer now fits its known artwork bounds on actual canvas-size changes, with a maximum zoom of 1; playback, comments and ordinary rerenders do not reset the viewport. A first refinement capped the fit at the current zoom, which preserved an unreadably small intermediate fit during the sidebar transition. The final constant cap allows the settled mobile canvas to recover its useful size.

After rebuilding the final source, `npm --prefix apps/web run test:e2e -- video-loading video-designs design-audit brand-canvas-final` passed **7/7 in 33.8 seconds**. This includes actual video sanitization/publication and three-role privacy, paused/playing URL renewal, delayed pin readiness, responsive accessibility, saved-pin alignment, and video containment greater than 98% with a player wider than 300 px on the 390 px viewport. The final source gate was rerun and passed all 593 tests. The complete 51-test suite was not repeated after this focused correction. Desktop/mobile [viewer](screenshots/video-viewer-390.png), [desktop viewer](screenshots/video-viewer-1600.png), project tiles and client-board captures were inspected. No material issue remains in this bounded revision.

Final local images are web `sha256:70bf6e15151a00d0a5b6dcab496373da0e2cca9ff3848d5b7066429a776596e9` and media `sha256:5f207952d772c86c29a23cddc0aa9384cc188d0fffb4c53fc15a3aaab526f438`; both containers are healthy.

## Final data reconciliation

The [final snapshot](project-playground-final-baseline-2026-09-23.json) and [read-only reconciliation](project-playground-final-reconciliation-2026-09-23.json) retain **10 clients, 25 projects, four Playground boards, 32 saved items and all 149 stored-file hashes**. The Playground board/item table digests exactly match the initial snapshot, including the two archived workspace scopes. SABRE retains seven projects and the other nine workspaces two each; no temporary acceptance clients/projects remain. The 13 Auth users and the studio name `Offline probe` are preserved.

After the complete browser suite, **31 of 35 public-table digests** match the initial snapshot. The four expected exceptions are `credit_accounts` (reconciliation/timestamps; balances agree with the unchanged ledger), `service_presets` and `workspace_settings` (edit-and-restore revisions/timestamps), and `service_preset_history` (53 to 55 rows from the two append-only edit/restore audit entries). The tests restore the prior editable values. These audit records were retained rather than removed to manufacture an identical digest. This final comparison is distinct from the earlier exact 35-table Playground-phase comparison.

Documentation checks confirmed local link targets in eight affected documents (the active section only for the historical checkpoint), identical `AGENTS.md`/`CLAUDE.md`, and a clean `git diff --check`. Prior user work remains uncommitted and preserved.

## Remaining scope

This completes a bounded feature revision, not production release approval. The broader J10 audit and production hosting/TLS/SMTP remain open. Video-processing attempt recovery after failed sanitization, cancellation, abandoned raw/internal staging cleanup and mixed-workload queue scheduling remain separate lifecycle work. Existing in-memory Playground drafts can still be lost through browser history or programmatic navigation. Legacy workspace Playground files are preserved but require an explicit project destination to migrate. No large-file latency, whole-service throughput or memory reduction is claimed.
