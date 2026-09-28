# Project Instructions

## Language Policy

- Use English for all system and project content, including user interfaces, product copy, source code, identifiers, file names, comments, docstrings, tests, logs, error messages, documentation, configuration text, prompts, skills, agent instructions, and generated artifacts.
- Write commit messages, pull request titles and descriptions, and issue content in English.
- Use Brazilian Portuguese (pt-BR) only for direct chat responses to the user, including progress updates, explanations, questions, and final answers.
- Keep code snippets and content intended for project files or external artifacts in English, even when presented within a Brazilian Portuguese chat response.
- Apply this policy to new content and updates to existing content. A request written in Portuguese does not change the system or project language.

## Documentation Maintenance

- Documentation maintenance is a required part of every project change. Review and update all affected documentation as part of the same task, before considering the work complete.
- Keep documentation aligned with current project behavior, structure, setup, commands, workflows, and decisions. Update relevant README files, guides, references, and other affected documents whenever these change.
- Keep `AGENTS.md` and `CLAUDE.md` synchronized. Any addition, change, or removal of shared project instructions must be applied to both files in the same task.
- When a change affects guidance recorded in these instruction files, update both `AGENTS.md` and `CLAUDE.md` along with the affected documentation. Updating only one instruction file is incomplete.
- Verify documented claims, paths, links, and commands against the actual project. Remove or correct outdated guidance instead of leaving conflicting instructions.

## Orchestrator and Agent Workflow

- The primary agent is the orchestrator. Every delegated agent reports to it; agents do not independently redefine scope, approve releases, or declare the overall goal complete.
- Before delegation, define the task, owned paths, dependencies, acceptance criteria, and expected evidence. Keep write ownership disjoint and report cross-domain interface changes before implementation.
- Every report includes completed work, changed files, decisions, checks actually executed with results, unresolved risks, and the next required action. Distinguish planned, implemented, tested, and verified states. Keep reports to 30 lines or fewer.
- The orchestrator integrates results, resolves conflicts, redirects work, updates the implementation plan, and owns the final security, functional, visual, and release audit.
- Apply installed skills by responsibility: project-structure for boundaries; setup for tooling; testing for unit/integration verification; security for authorization and dependency review; codebase-review and first-principles-review for independent audits; refactor for maintainability; update-project for documentation.
- Keep feature code, data access, validation, and unit tests colocated. Share code only when multiple consumers need it. Avoid duplicate domain rules, catch-all modules, competing state stores, and unnecessary services.
- Do not run permanent background AI agents as product infrastructure merely to implement this development workflow. Persistent agent orchestration is documented in docs/engineering/agent-orchestration.md.

## Development Efficiency

- Delegate only bounded work, to the project agents in `.claude/agents/` (Codex: the equivalent model tier). Use the cheapest model that fits: Haiku for code search and for running named checks, Sonnet for bounded implementation and review. Keep the top tier for orchestration, cross-domain design and the release audit. Do not use general-purpose agents for routine work, and run at most three agents at once unless the user asks for more.
- Give every delegation an output cap and a list of what not to read (history, verification records, screenshots, `docs/ref`). Read large files by excerpt, compact at task milestones, and start a fresh session between unrelated tasks.
- Keep `docs/engineering/handoff.md` at or under 100 lines of current state. Move superseded entries to `docs/engineering/history/` and read them only when a task needs earlier evidence.
- Finish every integrated task with a passing gate and a Conventional Commit of that task's files. Do not let unrelated work accumulate uncommitted. Pushing, pull requests and deployment still need an explicit request.
- Capture screenshots only when a task changes UI. Save working captures to the ignored `outputs/` directory, and commit only the final-state images a verification record cites.
- See `docs/engineering/agent-orchestration.md#efficient-delegation`.

## Codebase Architecture Boundaries

- Data access: Supabase queries live only in `features/<feature>/<feature>-data.ts` — reads as `use<Thing>()` hooks, writes as plain `async (database, input)` functions; validation, trimming, idempotency keys and retry state stay in the component. See `docs/architecture/data-access.md`.
- Shared UI layer: a primitive moves to `apps/web/features/shared/` only with two or more real consumers today; consumer differences become props, never a normalized-away behavior. See `apps/web/features/shared/README.md`.
- Styling boundary: `apps/web/app/globals.css` holds tokens/`@theme`, reset and base element styles, and shared-primitive styles only; `apps/web/features/<feature>/<feature>.css` holds that feature's own rules; a namespace with consumers in two or more features stays in `globals.css` regardless of its name. See `docs/architecture/design-system.md#styling-boundary`.

## Cross-Agent Continuity

- Read `docs/engineering/handoff.md` before resuming work in either Codex or Claude Code. Preserve the current objective, accepted decisions, unfinished changes, and verification gaps.
- The orchestrator updates that checkpoint after each integrated task and before ending a session or transferring control. Record actual checks and the next concrete action; distinguish historical evidence from checks executed in the current session.
- Each delegated agent saves its report under `docs/engineering/handoffs/` using the documented template (30 lines or fewer) before returning. Assign a unique report path with its owned code paths. Chat-only reports and `/root/...` thread names are not portable project memory.
- Only one orchestrator owns shared integration files at a time. During transfer, stop or collect outgoing workers, preserve their changes, and record the incoming owner before it writes. A read-only Claude acknowledgement does not transfer ownership or authorize a release.
- If interrupted before a checkpoint, the incoming orchestrator reconciles the working tree and saved reports first, marks missing evidence as unknown, and continues the existing plan. Never discard uncommitted or untracked work to recreate an older checkpoint.

## Product and Delivery Requirements

- Run `apps/web` directly with the Next.js App Router and its standard CLI. The web application uses a Node.js server; authentication, data, storage and realtime remain in Supabase. Keep hosting-provider integrations out of the application unless explicitly requested.
- Production target: the official self-hosted Supabase Docker distribution, plus the `web` and `media` containers from `compose.yaml` behind a TLS reverse proxy. Creative work lives in Miro; Cloudflare R2 is no longer required (user decision, 2026-09-27). Existing application uploads use Supabase Storage's filesystem backend on persistent server storage, with off-host backups. See `docs/operations/production.md`.
- Production authentication email uses Resend through Supabase Auth SMTP. Keep invitation/recovery delivery in Supabase Auth; configure SMTP credentials only on the target host. See `docs/operations/email.md`.
- Build a real application using xyflow for the board and project canvas, with Supabase running in Docker for authentication, PostgreSQL, storage, and realtime capabilities.
- Treat docs/ref as inspiration and workflow evidence, not a specification to reproduce screen by screen. Build a minimalist, lightweight, modern interface with the supplied branding in brand; consolidate duplicate controls and reveal secondary actions contextually. Preserve these original source artifacts; write new implementation documentation and all product content in English.
- The user's production request supersedes the reference package's earlier wireframe-only limitations. Prototype simulations, role previews, browser filters, and toast-only actions are not production implementations.
- Enforce agency/client/designer permissions in the backend. Clients must never receive designer identity, assignment, internal comments, source metadata, or unpublished production artifacts.
- Only the agency shares client versions per project. A published version's identity, number and note remain immutable; the agency may edit its Miro link after publication, including after approval or delivery, without creating a version or resetting review history. A shared version must retain a valid Miro link. Keep internal and client comment channels separate, including drafts. A designer never sees another designer's board. Covers are sanitized by the media worker and client-visible only when marked. Final files are delivered through Files.
- Follow the accepted action-driven workflow target in `docs/superpowers/specs/2026-09-27-action-driven-workflow-design.md`; implementation progress is tracked in its linked plan. Accepted projects start In progress; clients never receive Studio review. Keep board work, project activity (Active/Backlog), and client-version decisions separate. Do not add Mark ready or Ready for client. Ending a designer direction must explicitly close that board while preserving history; an omitted board is unchanged. Review versions never create additional deliverables or credit debits automatically. These target rules do not imply the pending implementation is complete.
- Briefing submission is free. Budget acceptance must atomically create one project and one credit debit against its chosen month (the current month or any of the next 11), reject a month with an insufficient balance, and remain idempotent under retries and concurrent requests.
- Keep template drafts private to their owner and separate from projects and billing. Require explicit campaign selection or creation in briefing details.
- Completion requires evidence for the entire acceptance matrix with a deterministic baseline of exactly 10 clients and 25 projects — two for each of nine workspaces and seven for SABRE, whose structure is taken from the reference package — with realistic related data, real persistence, role isolation, and complete action flows.
- The user authorized a temporary local SABRE demonstration on 2026-09-23 and confirmed all existing clients are test data. Its active target is 50 SABRE projects, 10 clients and 68 total projects. Preserve this overlay and its ignored rollback checkpoint; do not reset it or weaken canonical acceptance assertions to reconcile the different counts. The canonical seed remains 10 clients / 25 projects. See `supabase/demo/sabre/README.md` for population, verification and guarded removal.
- Never run `supabase migration down` or `supabase db reset` against the local stack: on this CLI, `migration down` replays every migration from scratch and wiped the local database on 2026-09-26. Apply migrations with `supabase migration up --local` and correct an applied migration forward with a new one. A full reset is only `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss`, run with the user's explicit approval, followed by the SABRE `apply` in `supabase/demo/sabre/README.md`.
- Visual quality is judged by clarity, restrained styling, modern typography, consistent spacing, and usability rather than pixel matching every prototype screenshot. After functional verification, perform a complete audit of alignment, application logic, spacing, minimalism, accessibility, responsive behavior, and duplication. Do not infer correctness from a successful build alone.
