# Baseline reconciliation and brand/logo fixture completion

- Updated at: 2026-09-20T09:56:00Z
- Reporting agent and tool: Orchestrator / Claude Code
- State: verified — every documented suite passes on the combined tree
- Objective: reconcile the working tree, establish a real functional baseline, and continue the next incomplete task
- Owned paths: `apps/web/tests/e2e/design-audit.spec.ts`, `apps/web/tests/e2e/brand-canvas-final.spec.ts`, `apps/web/app/api/invitations/route.ts`, `compose.yaml`, this report
- Dependencies: local Docker Supabase (`127.0.0.1:55421`), trusted media service, web container on `localhost:3003`, fixtures in `supabase/fixtures.json`
- Acceptance criteria: current commands executed with recorded output; remaining failures attributed to a verified cause

## Completed work and changed files

Ownership transferred cleanly. Process 47025 `codex --dangerously-bypass-approvals-and-sandbox`, started 03:39, was still creating and editing files at 05:48 (`app/globals.css`, `features/board/board-page.tsx`, `features/brand/brand-data.ts`, `features/workspace/app-shell.tsx`, and the new `features/workspace/client-identity.tsx` and `features/workspace/topbar-tools.tsx`). Work paused until the user stopped it; it exited at 05:51:33 having resolved its own lint error, and its topbar-portal and client-identity refactor was preserved and integrated rather than reverted. Nothing was discarded.

The checkpoint was already stale on arrival: it records 110 Unverified acceptance rows, while `docs/architecture/acceptance-matrix.md` now holds 79 Unverified and 37 Verified.

Changes written by this session:

- `supabase/scripts/provision_logo_exports.py` was executed (it had been written but never run). It added the 20 missing `mark-png` / `mark-pdf` brand asset records and provisioned 70 brand files. All ten clients now expose SVG, PNG and PDF logo resources; the canonical dataset remains exactly 10 clients and 20 projects.
- `apps/web/tests/e2e/design-audit.spec.ts` now widens the fixture deliverable name through the service role. Accepted deliverables are intentionally read-only for `authenticated` (`foundation.sql` grants `select` only, and application code only reads them), so the previous authenticated `update` asserted a write path the product must deny.
- `apps/web/tests/e2e/brand-canvas-final.spec.ts` locators corrected: the asset category `<select>` is named by a wrapping label whose text also contains every option label, so `{ exact: true }` could never resolve; and `@xyflow/react` v12 labels its controls `Zoom In`, `Zoom Out` and `Fit View`.
- `apps/web/app/api/invitations/route.ts` resolves the workspace origin from `APP_ORIGIN` before falling back to the request URL.
- `compose.yaml` passes `APP_ORIGIN` to the web service, as it already did for media.

## Decisions and interface changes

**The browser test target was a stale artifact.** `localhost:3003` is served by the `dawes-studios-app-web-1` container, which had been built at 05:39 from older source. Its compiled CSS still carried `.brand-asset-preview{color:#78786f}` while the source had already moved to `var(--muted)` (`#6c6c67`). The recorded `assets-desktop` axe contrast failure (3.82:1) was therefore an artifact of the stale image, and the surface passes once the image is rebuilt. Any browser evidence in this project must state which build served port 3003.

**A real container defect was found in the invitation endpoint.** The same-origin guard compared the browser `Origin` against `new URL(request.url).origin`. Under the standalone Node.js server the request URL reflects the bind address, so the container computed `http://0.0.0.0:3003` and rejected every real browser invitation with HTTP 403 "This request must come from your workspace." Reproduced directly:

```
Origin: http://localhost:3003  -> 403
Origin: http://0.0.0.0:3003    -> 401 (origin accepted, missing token)
```

The same value also built `redirectTo`, so emailed invitation links would have pointed at `http://0.0.0.0:3003`. The endpoint now trusts the configured `APP_ORIGIN`, matching `apps/media/src/server.js`. Verified after the rebuild: the same probe returns 401 instead of 403, and `intake-admin.spec.ts:543` passes in 2.4 s, which also unblocked the three tests serial mode had been skipping.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` | repository root, 05:42 | pass — typegen, `tsc --noEmit`, ESLint, 109 Vitest tests in 7 files | terminal output |
| `npm --prefix apps/media test` | 05:46 | pass — 7 tests | terminal output |
| `npm run db:test` | 05:47 | pass — 133 pgTAP assertions across 5 files | terminal output |
| `npm run test:e2e` (stale 05:39 image) | 05:42–05:45 | 15 passed, 6 failed, 3 skipped | `scratchpad/e2e.log`, `apps/web/test-results/` |
| `docker compose --env-file .env.production up --build -d --wait web` | 05:45 | pass — image rebuilt from current source, container healthy | `scratchpad/rebuild.log` |
| `npm run test:e2e` (rebuilt image) | 05:46–05:49 | 17 passed, 4 failed, 3 skipped | `scratchpad/e2e2.log` |
| `python3 supabase/scripts/provision_logo_exports.py` | 05:46 | 20 logo export records added, 70 brand files provisioned | script output, database query |
| Database baseline query | 05:46 | exactly 10 clients and 20 projects | `psql` count |
| `curl` origin probe on `/api/invitations` | 05:48 | 403 for the real browser origin, 401 for `http://0.0.0.0:3003` | terminal output |
| `npm run check` after the invitation fix | 05:49 | fail — ESLint `react-hooks/set-state-in-effect` in the concurrent refactor's `topbar-tools.tsx`; Codex resolved it itself before exiting | `scratchpad/check2.log` |
| `npm run check` on the combined tree | 05:51 | pass — typegen, `tsc --noEmit`, ESLint, 109 Vitest tests | terminal output |
| `docker compose ... up --build -d --wait web` | 05:52 | pass — image rebuilt from the combined tree, container healthy | `scratchpad/rebuild3.log` |
| `curl` origin probe after the fix | 05:53 | 401 for the real browser origin, so the guard now accepts it | terminal output |
| `npm run test:e2e` (final) | 05:53–05:55 | **pass — 24 of 24 in 1.9 minutes** | `scratchpad/e2e3.log` |
| `python3 supabase/tests/http_auth_storage_test.py` | 05:56 | pass — 9 authorization/storage tests | terminal output |
| `npm --prefix apps/media run test:integration` | 05:56 | pass — 15 checks, temporary objects removed | terminal output |
| Dataset integrity query | 05:56 | 10 clients, 20 projects, 0 campaign/client parent mismatches, 0 leftover `Acceptance %` rows, 0 leftover fixture Auth accounts, 3 logo mime types | `psql` output |

## Remaining risks and next action

Every documented suite passes and four acceptance rows moved to Verified with scenario-level evidence: B01, G03, G08 and J07. The matrix now holds 41 Verified and 75 Unverified rows.

A green gate is not a finished product. The suite proves the scenarios it covers, not the rows it never exercises. The largest remaining gaps are the C, E, F and I families, the failure-state rows I04 and I05, dataset responsiveness in I07, and the J family visual review. Deployment, TLS and outbound SMTP remain unconfigured and out of scope.

Stray containers from earlier sessions are still running and were deliberately left alone: `dawes-web-acceptance`, `dawes-media-acceptance`, the `supabase_*-restore-drill` stack and an unrelated `creative-canvas-web-1`. Retire them once their evidence is recorded.

## Ownership at handoff

Claude Code owns `apps/web`, `compose.yaml`, `supabase/` and the verification/acceptance documentation, recorded in the shared checkpoint. No other writer was active at the time of this report. Nothing was committed, published or deployed; the repository still has an unborn `main` branch and untracked files.
