# Implementation Plan

Status: in progress. The current objective is a complete, tested production-oriented application; planning or a navigable mockup alone does not satisfy it.

## Product direction

Build Creative Canvas for Brianna Dawes Studios with xyflow, a minimalist modern interface, and a Docker-hosted Supabase backend. The supplied docs/ref is workflow and visual inspiration only. Consolidate repetitive prototype UI and expose secondary actions contextually. Preserve the current explicit product and permission requirements.

## Delivery sequence

| Stage | Owner | Deliverables | State |
| --- | --- | --- | --- |
| 1. Architecture and orchestration | Orchestrator + architecture agent | Domain, routes, permissions, design principles, acceptance matrix and reporting protocol | In progress |
| 2. Backend foundation | Backend agent | Supabase configuration, migrations, RLS, transactional RPCs, immutable publications, seeds and integration tests | In progress |
| 3. App foundation | Orchestrator | Typed React app, auth/session, feature boundaries, shell, route handling, shared UI, tooling | In progress |
| 4. Core collaboration | Orchestrator | Client board, projects, design/version canvas, pins, comments, agency publishing, review and delivery | In progress |
| 5. Intake and accounting | Product architecture agent | Service catalog, briefing wizard, explicit campaigns, budget review, idempotent acceptance, credits/report/CSV | In progress |
| 6. Supporting domains | Product and design agents | Brand Hub, personal templates, uploads, assets, settings, invitations, search and notifications | In progress |
| 7. Functional and isolation audit | Independent reviewer + orchestrator | Exactly 10 clients and 25 seeded projects, complete flows, concurrency, failure cases, persistence, access boundaries | In progress |
| 8. Design and maintainability audit | Design reviewer + orchestrator | Alignment, logic, spacing, minimalism, duplicate controls/code, accessibility and responsive QA | In progress |
| 9. Production verification | Orchestrator | Reproducible build, deployment configuration, operations/recovery documentation and release evidence | In progress |

## Architecture decisions

- apps/web contains the React/TypeScript frontend. It uses the Next.js App Router and the standard Next.js development, build and Node.js production server commands. Frontend modules are grouped by feature; route files compose them. Vite is only a transitive dependency of the Vitest test runner.
- Supabase is the authoritative store and authorization boundary. RLS and database functions protect all role-sensitive actions. Browser filtering is presentation only.
- @xyflow/react renders board/project viewports. Business state lives in Supabase; query cache and ephemeral view state are separate.
- TanStack Query owns server state and invalidation. Avoid a parallel client database or duplicated business store.
- No runtime AI infrastructure is required by the development orchestration agreement.
- Use npm and preserve each application's lockfile. Keep the Next.js ESLint configuration, formatting and meaningful tests aligned with the application.

## Evidence policy

Do not label a gate complete without current evidence. Record exact commands, assertions, browser scenarios, and limitations under docs/verification. Reference screenshots do not constitute implementation evidence. A successful build does not prove authorization, durable state, or visual quality.

## Cross-tool continuation

The current ownership, reconstructed domain context, verification gaps and next actions are recorded in [the Codex / Claude checkpoint](../engineering/handoff.md). Both tools follow the [handoff procedure](../engineering/agent-orchestration.md); future delegated reports are saved on disk. Claude has acknowledged the initial packet in a [read-only continuity check](../verification/claude-handoff.md). This does not transfer implementation ownership, import prior agent threads, or close any product acceptance gate.

## Integration evidence (2026-09-20)

- The current application runs through the standard Next.js CLI. The runtime cleanup was observed as a concurrent workspace change, preserved, and checked against the running app; its narrower historical results are in [runtime cleanup](../verification/runtime-cleanup.md).
- The three-role production browser journey passes: actual internal image uploads, draft and pin isolation, designer submission, agency publication, immutable published record and file hashes after internal edits, client feedback, V2 publication, approval, final file preparation, delivery and download. Temporary test projects are guarded and cleaned up.
- The agency/client navigation suite and the production journey passed together: 3 tests in 7.4 seconds. This does not yet verify every acceptance-matrix row.
- The production Next.js build passed, and dependency audits found zero known vulnerabilities in both web and media package lockfiles. A container build and the complete updated gate still need verification.
- Backend schema, fixture enrichment, scoped intake/admin journeys, responsive accessibility checks and operational recovery evidence are being integrated before the final deterministic reset.

### Consolidated run, 2026-09-20 09:55Z (Claude Code orchestrator)

Every suite below was executed in this session against the rebuilt `dawes-studios-app-web-1` container on `localhost:3003` and the local Supabase stack on `127.0.0.1:55421`.

| Suite | Result |
| --- | --- |
| `npm run check` | pass — route typegen, `tsc --noEmit`, ESLint, 109 Vitest tests |
| `npm --prefix apps/media test` | pass — 7 tests |
| `npm run db:test` | pass — 133 pgTAP assertions across 5 files |
| `python3 supabase/tests/http_auth_storage_test.py` | pass — 9 authorization/storage tests |
| `npm --prefix apps/media run test:integration` | pass — 15 checks, temporary objects removed |
| `npm run test:e2e` | pass — **24 of 24 browser tests**, 1.9 minutes |

The dataset after the run is exactly 10 clients and 25 projects, with no project whose campaign parent disagrees with its client, no leftover `Acceptance %` fixtures and no leftover fixture Auth accounts.

Two defects were found and fixed in this session. The invitation endpoint compared the browser `Origin` against `new URL(request.url).origin`, which under the standalone Node.js server reports the bind address, so the container answered every browser invitation with HTTP 403 and would have emailed `http://0.0.0.0:3003` links; it now resolves the workspace origin from `APP_ORIGIN`, which `compose.yaml` passes to the web service. Separately, browser evidence had been collected against a container image older than the working tree, which produced a contrast failure that no longer exists in source; see the [design audit](../verification/design-audit.md) reproduction note.

This is the first fully passing browser gate. It does not close the remaining acceptance rows: 75 stay Unverified, and deployment, TLS and outbound SMTP remain unconfigured.
