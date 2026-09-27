# Repository cleanup audit — 2026-09-27

## Objective and scope

Keep the creative collaboration application maintainable by removing proven unused work,
putting feature-owned code beside its consumers, and separating application inputs from local
state and historical evidence. The product remains a Next.js web application with Miro review,
Supabase authorization/data/Storage/realtime, and a trusted cover/delivery media worker.

The initial tracked inventory contained 2,143 files. This review covered every top-level folder,
all 16 web features, runtime import reachability, direct dependency references, backend/script
consumers, documentation links, and local branch/worktree status. It is a repository cleanup
audit, not a new certification of every product workflow or production readiness.

Coordination: the existing production session retained project-details, proxy, CI, browser
configuration, production documentation and the shared checkpoint. This session owned the
cleanup paths below. Both sessions agreed ownership before overlapping areas were edited.
No database, Docker service, environment secret, ignored dataset or rollback checkpoint was
changed by this cleanup. The pre-existing deletion of `login.png` remains outside its commit.

## Implemented cleanup

| Area | Evidence and resulting change |
| --- | --- |
| Web dependencies | No production/configuration consumer of `tus-js-client` remains after retirement of the old uploader. Removed it and 19 exclusively dependent lockfile packages; no packages added or retained versions changed. Running `node_modules` was preserved. |
| Brand dependency cycle | `brand-assets.tsx` imported Products, which imported its preview back from Assets. Moved the identical preview implementation to `brand-asset-preview.tsx`; Assets, Products and Logos now import it directly. |
| Feature boundaries | Moved `canvas-fit.ts` and its test to Board, `concurrency.ts` and its test to Playground, and `version-row.ts` and its test to Projects. Updated all production/E2E imports. Function bodies and tests are unchanged. |
| SABRE derivatives | Current consumers read PNG/PDF entries only. Removed unused MP4/FFmpeg generation and its index field; kept motion briefing metadata, artwork layouts, canonical fixtures and the live overlay. Existing generated derivatives were preserved. |
| Docker context | Added exclusions for local output/tool directories, both staging data modes, vendored upstream, restore-drill data, documentation, source branding and Python caches. Web Dockerfile copy inputs remain present. This reduces eligible build context; it does not delete local data. |
| Evidence location | Moved all 12 tracked `outputs/miro/*.png` into `docs/verification/screenshots/miro-version-links/`; all SHA-256 hashes match the original committed bytes. Updated their record and handoff references. Working `outputs/` remains ignored. |
| Documentation | Repaired 15 broken local links in three historical records, including a retired video test now identified by its removal commit. Updated affected feature/renderer docs and stale media/CSP/helper comments. |

## Folder-by-folder decisions

### Repository root and tooling

| Folder or files | Decision and rationale |
| --- | --- |
| Root manifests, Compose, hooks configuration | Keep: root commands delegate to web/backend tools; Compose still supplies web/media. No second application runtime was found. |
| `AGENTS.md`, `CLAUDE.md` | Keep synchronized; their byte-identical duplication is required project guidance, not dead content. |
| `.claude/agents/` | Keep all four bounded specialist definitions. They are development tooling, not product infrastructure. |
| `.github/` | Keep CI; its new canonical DB/browser job is owned by the concurrent production session. |
| `.husky/` | Keep: commit hooks use gitleaks, lint-staged and commitlint. Their development dependencies are real consumers. |
| `.git/` | Keep. Both other local branches are fully merged into `main`; `feature/video-designs-and-feedback` remains checked out in a separate worktree. No worktree or branch was removed. |
| `node_modules/`, `.next/`, test reports | Generated and ignored. Keep active installations/builds; cache deletion would be a separate disk-maintenance action. |
| `.superpowers/`, `.playwright-mcp/`, `outputs/`, `work/` | Ignored local work; exclude from the application build context. Preserve ongoing-session files and backup/evidence output. |
| `scripts/` | New CI support belongs to the concurrent session. Keep its guard/bootstrap/snapshot lifecycle and tests. |
| `brand/` | Keep both original supplied source assets; production uses derived files under `apps/web/public/brand/`. |

### Web application

The initial read-only import graph started from 37 App Router TS/TSX entry files and reached all
248 runtime TS/TSX/CSS modules. Four other non-test TypeScript files were expected CLI/typegen
configuration. This establishes no proven whole runtime module deletion; it is not proof that
every export or CSS selector executes at runtime. Every public brand asset and every E2E helper
had a source consumer.

| Path | Decision |
| --- | --- |
| `apps/web/app/` | Keep routes, API handlers, intercepted modal routes, layout and shared styles as framework entry points. |
| `apps/web/lib/` | Keep Supabase/configuration and validation helpers plus their tests. |
| `features/assets/` | Keep Files grouping, preview, upload and download flows; Miro has not replaced final-file delivery. |
| `features/auth/` | Keep session/provider/login behavior and permission-aware entry points. |
| `features/board/` | Keep current canvas/list/calendar/timeline behavior; colocate its viewport fit utility and tests. |
| `features/brand/` | Keep directory, products, links, logos and uploads; break the Assets/Products import cycle. |
| `features/briefings/` | Keep intake, campaign selection, drafts and budget acceptance. |
| `features/campaigns/` | Keep campaign pages and data used by boards/briefings. |
| `features/competitors/` | Keep active competitor-ad board widget/data and optional server integration. |
| `features/credits/` | Keep monthly account, transfer, adjustment and settlement flows; these are current business rules. |
| `features/overview/` | Keep role-aware workspace overview. |
| `features/playground/` | Keep the independent per-project, per-role collaboration canvas; colocate bounded upload/download concurrency. |
| `features/projects/` | Keep Miro boards/rounds/client versions, covers, comments, Drive and delivery actions; colocate version display helpers. Project-details extraction belongs to the other session. |
| `features/reviews/` | Keep the current review queue and client-version actions. |
| `features/settings/` | Keep account/client settings and admin controls. |
| `features/shared/` | Keep cross-feature primitives; remove the three domain-only helpers from this directory without changing their behavior. |
| `features/team/` | Keep invitation/member/activity flows and protected server actions. |
| `features/workspace/` | Keep application shell, navigation, themes, current client and notification state. |
| `tests/` | Keep cross-feature browser scenarios and five consumed E2E helpers; update the moved version helper import. Unit tests remain colocated. |
| `public/` | Keep all five referenced branding assets. Original sources in root `brand/` remain preserved. |
| Package/build/test configuration | Remove only `tus-js-client`; retain actual framework, runtime, test and hook dependencies. Correct CSP comments without changing header behavior. |

### Media, database and deployment

| Path | Decision |
| --- | --- |
| `apps/media/src/` | Keep cover/delivery server, sanitizer, backend adapter, unit tests and HTTP integration check. Correct retired publication/video descriptions only. |
| `apps/media` manifests/Dockerfile | Keep required image/PDF dependencies and runtime setup; clarify the scratch-volume comment. |
| `supabase/migrations/` | Keep all 85 ordered migrations. Retired tables/functions in earlier migrations are replay/upgrade history; deleting them would break later transitions. |
| `supabase/tests/` | Keep authorization, workflow, concurrency, rollback and compatibility coverage. Legacy widget compatibility is explicitly retained. |
| `supabase/scripts/` | Keep stack lifecycle, backup/restore, fixture generation/provisioning/verification, retired-object cleanup and SABRE state tools. One-time logo backfill remains pending upgrade-path review. |
| `supabase/demo/sabre/` | Keep plan, originals, renderer and rollback tests; remove only unused video derivative generation. |
| Supabase config/types/seed/manifest | Keep generated types and deterministic seed artifacts; they serve different runtime and verification consumers. Canonical assertions stay exactly 10 clients/25 projects. |
| Ignored Supabase state | Preserve live SABRE 10 clients/68 projects/50 SABRE, credentials, restores and rollback checkpoint; these are not repository garbage. |
| `deploy/staging/` | Keep filesystem production rehearsal and explicit historical MinIO compatibility. Preserve both data directories and vendored upstream, excluding them from build context. |
| `deploy/production/` | Active proxy templates/renderer/tests belong to the other session; keep and integrate its evidence separately. |

### Documentation and evidence

| Path | Decision |
| --- | --- |
| `docs/architecture/` | Keep contracts, decisions, acceptance matrix and implementation history. Older Playground/video documents carry historical evidence and do not authorize restoring retired code. |
| `docs/engineering/` | Keep current checkpoint, workflow guides, bounded reports and explicit history. Repair moved-history links; the production session owns updating the shared checkpoint. |
| `docs/operations/` | Keep operations/recovery guidance and evidence. Production changes belong to the other session. |
| `docs/ref/` | Preserve all 789 supplied files (about 76 MiB tracked); inventory only, not a rewrite or deletion target. |
| `docs/superpowers/` | Keep 38 plans/specs as decision history; a reference to a retired feature in a historical plan alone is not a deletion signal. |
| `docs/verification/` | Keep cited acceptance/browser evidence (about 43 MiB tracked at baseline). Place the 12 Miro images here alongside their record. No new UI capture was needed for unchanged markup/styles. |

The local size inventory found approximately 2.7 GiB of `.next`, 2.1 GiB of `outputs`, 594 MiB of
vendored staging upstream and 79 MiB of historical staging state. These are disk usage figures,
not committed-source size or measured Docker transfer savings. No such directory was purged.

## Verification executed for this cleanup

- Targeted Vitest: **10 files / 136 tests passed**, covering Brand, board layout/fit, Playground
  albums/concurrency, version helpers and Next security-header configuration.
- `npx --no -- tsc --noEmit --incremental false`: passed.
- Targeted ESLint and Prettier across every modified/moved TypeScript source/test: passed without
  warnings. `node --check` on renderer and edited media JS: passed. `git diff --check`: passed.
- Isolated renderer smoke with actual Chromium: PNG signatures/dimensions, PDF signature,
  motion-job PNG with no MP4 or video index field, and second-run derivative-cache reuse passed.
  The temporary test tree was removed; live renderer output and index were untouched.
- Local-link scan of **281 tracked Markdown files outside `docs/ref`**: zero missing targets
  after repair. The scan checks relative Markdown destinations, not external URLs or anchors.
- **12/12 SHA-256 comparisons** confirm evidence images match their original Git blobs.
- Lockfile comparison: **20 packages removed, zero added, zero retained-version changes**.
  Independent review found no remaining lock dependency referencing the removed closure.
- Static Docker-context checks: ten newly excluded directory boundaries and all four local
  web Dockerfile `COPY` inputs checked. The production session owns the actual image rebuild.
- Independent source review: preview/helper/test bodies preserved; old imports absent; zero
  runtime cycles across the 14 Brand modules. Review reports are linked below.

An initial targeted test/typecheck exposed one missed Logos preview import; it was fixed and the
complete targeted command passed on rerun. The initial failure is not counted as passing evidence.
The full source/image/browser gate belongs to the coordinated production session, after cleanup
source freezes. No database test, reset, full acceptance rerun or production deployment was
performed by this cleanup session.

## Retained candidates and limits

1. `deploy/staging/scripts/stage.sh` still defaults to historical MinIO. Consider making filesystem
   mode the default in a dedicated operation change, updating helper defaults, tests and docs
   together. Existing rehearsal data must remain separate; no default was changed during a run.
2. `supabase/scripts/provision_logo_exports.py` backfills rows now present in the seed. Keep until
   support for older local fixtures is explicitly retired; no unused-file claim was established
   for that upgrade path.
3. Keep merged branch/worktree state until its user confirms no pending work in the other checkout.
4. No exhaustive proof of dead SQL exports, unused CSS selectors or inaccessible runtime branches
   was attempted. Static reachability supports the bounded cleanup, not blanket deletion.

Confidence: purpose/architecture/entry points **5/5**; static cleanup references **4/5**; complete
runtime/release behavior **3/5**, because this task reran targeted checks only. Authorization,
TLS/SMTP/recovery and release evidence remain in the acceptance matrix and production workstream.

Reports: [web inventory](handoffs/2026-09-27-cleanup-web-audit.md),
[backend/infrastructure inventory](handoffs/2026-09-27-cleanup-backend-audit.md), and
[independent implementation review](handoffs/2026-09-27-cleanup-web-review.md).
