# Codex / Claude continuation checkpoint

Updated: 2026-09-20. Maintainer: the active orchestrator.

## Ownership and purpose

- Current writer: **Claude Code, from 2026-09-20T09:51Z**, owning `apps/web`, `compose.yaml`, `supabase/`, and the verification/acceptance documentation. Task: reconcile the tree, establish a real functional baseline, and continue the remaining acceptance work.
- Transfer condition was met before this session wrote to shared integration files. The outgoing Codex run (process 47025, started 03:39) was observed still creating `apps/web/features/workspace/topbar-tools.tsx` and `client-identity.tsx` at 05:48; the user stopped it and it exited at 05:51:33. Its in-progress topbar/identity refactor was preserved, not reverted, and `npm run check` passes on the combined tree.
- Earlier transfer condition, retained for history: the outgoing Codex run and any workers editing the same paths have stopped. The incoming orchestrator records its name, time, and task here before writing.
- Only `/root` appeared in the current conversation's agent listing. The user named `/root/product_architecture`, `/root/design_reference`, and `/root/backend_foundation`, but their original threads and final reports are unavailable in this conversation. This does not establish whether unrelated sessions are still active.
- This checkpoint reconstructs project context from files on disk. It is not an export of the earlier agent conversations. No new product implementation or release is authorized by the acknowledgement itself.
- Git history starts at the `main` baseline commit recorded on 2026-09-20, which captured the implementation exactly as it stood. Work after that point is reviewable with `git diff` and `git log`. The baseline was committed with `--no-verify` after a manual `gitleaks` scan, because the repository-wide Prettier gap would otherwise have rewritten unrelated files; that formatting gap is still open.

## Objective that must survive the tool switch

Finish the existing Creative Canvas application for Dawes Studios, with real persistence and complete agency/client/designer workflows. Continue the [implementation plan](../architecture/implementation-plan.md) and [acceptance matrix](../architecture/acceptance-matrix.md). The product remains in progress. As of 2026-09-20 09:55Z the matrix holds 41 Verified and 75 Unverified rows; see the state section below.

The root instructions and linked architecture/setup guides establish these decisions:

- Standard Next.js App Router and Node.js server in `apps/web`; xyflow for board/project canvases; Supabase in Docker for Auth, PostgreSQL, Storage and realtime; trusted publication/delivery processing in `apps/media`.
- Backend-enforced tenant and role isolation. Client payloads exclude designer identity, assignments, internal comments, source metadata and unpublished artifacts. Only the agency publishes immutable client snapshots.
- Free briefing submission; atomic, idempotent budget acceptance creates one project and one debit, rejecting insufficient balance. Explicit campaign selection and private owner-scoped template drafts remain required.
- Deterministic acceptance baseline: exactly 10 clients and 20 projects, realistic related data, all required workflows and final visual/accessibility review. A successful build is insufficient.
- English for project content and artifacts; Brazilian Portuguese only for direct user chat. Preserve `docs/ref` and `brand`. Keep `AGENTS.md` and `CLAUDE.md` synchronized.

## Read in this order

1. [Root instructions](../../CLAUDE.md) and [orchestration procedure](agent-orchestration.md).
2. [Implementation plan](../architecture/implementation-plan.md) and [acceptance matrix](../architecture/acceptance-matrix.md).
3. Relevant domain guidance: [domain](../architecture/domain.md), [permissions](../architecture/permissions.md), [backend](../architecture/backend.md), [design system](../architecture/design-system.md), and feature README files.
4. Relevant evidence: [security](../verification/security-audit.md), [frontend findings](../verification/frontend-review.md), [design audit](../verification/design-audit.md), and [runtime cleanup](../verification/runtime-cleanup.md).
5. [Web setup](../../apps/web/README.md), [media setup](../../apps/media/README.md), and the package scripts before running commands.

## Domain routing for the earlier agent names

The associations below are navigation aids reconstructed from the current tree and plan. They are not recovered ownership records or signed reports from the named agents.

| Earlier name / responsibility | Existing context and implementation | Next integration need |
| --- | --- | --- |
| `/root/product_architecture` / product and intake | `docs/architecture/`; `apps/web/features/briefings/`, `credits/`, `settings/`; `apps/web/tests/e2e/intake-admin.spec.ts` | Reconcile intake/admin evidence and map actual results to acceptance rows. |
| `/root/design_reference` / design and references | `docs/architecture/reference-map.md`, `design-system.md`; `docs/verification/design-audit.md`, `frontend-review.md`; Brand Hub and shared styles | Recheck outstanding visual/logic findings and rerun the corrected browser scenarios. |
| `/root/backend_foundation` / backend | `supabase/migrations/`, `supabase/tests/`, `supabase/scripts/`; `apps/media/`; `docs/architecture/backend.md` | Reconcile policy, concurrency, media, fixture and recovery evidence against current files. |
| Orchestrator / integration | `apps/web/app/`, feature composition, root tooling, implementation plan and matrix | Establish the stable current state, integrate evidence, and own final acceptance. |

Future workers save actual reports in [handoffs/](handoffs/README.md). Do not backfill fictional reports for these unavailable threads.

## Existing evidence and unresolved work

These are historical claims from the linked files, not checks rerun during this handoff:

- The implementation plan records a successful Next.js production build, the three-role publication/revision/delivery journey, and a combined three-test navigation/workflow run. It explicitly leaves the full gate incomplete.
- The security report records clean dependency and candidate-file secret scans and a successful web container HTTP check. Database/HTTP/browser verification after the final fixture reset remains pending there.
- The runtime cleanup report records earlier type/build/lint failures. The later plan claims a passing build. Reconcile the current files and commands instead of treating either historical snapshot as definitive for today's tree.
- The design audit records three passing Brand tests and 42 captured surfaces, with a failing broad audit and pending corrections/reruns. Remaining topics include briefing/credit contrast, mobile credit overflow, canvas link naming/readability, long version notes, staged upload failure recovery, and production captures.
- The frontend review identifies measured version layout, contextual project controls, upload retry cleanup, and exact Brand asset search destinations. It distinguishes accepted corrections from final verification; inspect current code before changing it again.
- `docs/operations/seed-evidence.json` and `restore-evidence.json` exist. Their presence alone does not verify the current dataset or recovery state.
- Map current evidence to individual rows before marking them Verified; do not mark the whole application complete from a passing suite. A green gate proves the scenarios the suite covers, not the rows it never exercises.
- During its acknowledgement, Claude observed `apps/web/tests/e2e/intake-cleanup.tmp.spec.ts`, which was absent from the earlier test-file inventory and absent again at the orchestrator's follow-up. Treat this as a possible concurrent workflow: reconcile outgoing sessions and inspect the file if it reappears before changing it. No other session was stopped by this continuity task.

## State at 2026-09-20 09:55Z

Steps 1 to 4 of the previous list are complete; the detail is in [the baseline reconciliation report](handoffs/2026-09-20-claude-baseline-reconciliation.md) and the [implementation plan](../architecture/implementation-plan.md).

Every documented suite now passes on the current tree, including **24 of 24 browser tests**, and the dataset holds exactly 10 clients and 20 projects with no orphaned parents or leftover fixtures. Two defects were found and fixed: the invitation endpoint rejected every browser request in the container because it derived its origin from the server bind address, and earlier browser evidence had been measured against a container image older than the source. Codex's topbar/identity refactor was preserved and integrated, not reverted.

A passing gate is not a finished product. **75 acceptance rows remain Unverified**, and deployment, TLS and outbound SMTP remain unconfigured.

## Next actions, in order

1. Work through the remaining Unverified acceptance rows by domain, attaching the specific command or scenario to each row rather than citing the suite as a whole. The C, E, F and I families hold the largest gaps.
2. Cover the states the current suite does not reach: I04 and I05 transport failure, permission loss and interrupted writes; I07 responsiveness on the full dataset; G12 manual-copy fallback.
3. Complete the J family visual review at the documented widths against the rebuilt container, then refresh `docs/verification/design-audit.json` from one uninterrupted run.
4. Reconcile container restart and restore-drill evidence, and retire the stray `dawes-web-acceptance`, `dawes-media-acceptance` and `supabase_*-restore-drill` stacks once their evidence is recorded.
5. Keep deployment, TLS and SMTP explicitly out of scope until requested; this checkpoint publishes nothing.

Commands below are verified against the package manifests or backend guide. Unlike the earlier continuity task, **all of them were executed in the 2026-09-20 09:55Z session and passed**:

```bash
# Repository root; use the setup guides for prerequisites.
git status --short
npm run check
npm run build
npm --prefix apps/media test
npm run db:test
python3 supabase/tests/http_auth_storage_test.py
npm --prefix apps/media run test:integration
npm run test:e2e
```

Browser and integration suites require the local Supabase, media and web services, provisioned synthetic accounts, and ignored local configuration. Their mutations must use guarded fixtures and cleanup. Consult existing guides rather than copying credentials into this file.

## This continuity task

Implemented: persistent checkpoint, per-agent report template, transfer procedure, README navigation, and synchronized Codex/Claude instructions. Checked so far: repository/doc/script inspection; current agent listing; installed Claude Code version `2.1.278`; Claude authentication reports logged in. Product tests were not rerun.

Verified: Claude Code read the instructions, checkpoint, orchestration procedure, report template, implementation plan and acceptance matrix, then returned a successful read-only acknowledgement (process exit 0, no reported permission denials). Its response and limitations are saved in [the Claude handoff receipt](../verification/claude-handoff.md). The invocation did not retain a resumable session; future Claude sessions read the current shared files.

Documentation validation confirmed identical root instruction files, resolving relative links, existing documented package scripts and browser test paths, an unborn Git branch, and 110 Unverified acceptance rows. No product tests were rerun. The acknowledgement confirms receipt of context, not correctness of the implementation or automatic quota-based takeover. The incoming orchestrator still owns the reconciliation and verification steps above.

## Workspace topbar consolidation (2026-09-20)

Owner: Claude Code, as orchestrator, implementing directly rather than delegating; no worker reports were produced for this task.

Implemented: the client workspace topbar now carries the client's brand mark and name in place of the studio/client breadcrumb, and the board's header and toolbar rows were folded into it. Pages contribute controls through a portal slot (`features/workspace/topbar-tools.tsx`); the board contributes search, a filter popover, the result count, the view selector and the primary action. The duplicated client name was removed from the board, briefings and credits headings. `--workspace-chrome` now derives the canvas height from the measured chrome, and the topbar reserves a second tool row below 1100 px.

Changed: `apps/web/features/workspace/{app-shell,topbar-tools,client-identity}.tsx`, `apps/web/features/board/board-page.tsx`, `apps/web/features/brand/brand-data.ts`, `apps/web/features/{briefings/briefings-page,credits/credits-page}.tsx`, `apps/web/app/globals.css`, and [the design system](../architecture/design-system.md).

Verified in this session: `npx tsc --noEmit`, `npm run lint` and `npm test` (109 unit tests) pass. The Playwright suite ran against a development server on port 3010: 23 passed, and `production-workflow.spec.ts` failed at the share-version dialog with `Failed to fetch`. That failure is environmental — the media service allows only `APP_ORIGIN=http://localhost:3003`, and a request carrying the port 3010 origin returns 403 while the same request from port 3003 returns 200. The spec passes against the container on port 3003. Re-run it from an allowed origin before treating any production-workflow row as evidence. Layout was measured at 1440, 1200, 1100, 1000, 900, 700 and 390 px with no horizontal or vertical overflow, and the `design-audit` accessibility spec passes.

Not done: the acceptance matrix rows remain as they were; no fixture, container or deployment state was changed.
