# Codex / Claude continuation checkpoint

Updated: 2026-09-23 (EDT). Owner: **Claude Code**, active orchestrator since 2026-09-23 17:50 EDT.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running. No other writer was observed.
- To hand over: update this file (owner, objective, evidence, next action), commit it, then start
  the other tool with the prompt in [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Current objective

The user asked for four things: finish the interrupted task, refactor with the system agents,
make the documentation production-ready, and make the development workflow cheaper.

1. **Done:** the interrupted brand-folder remote-change task. Folders deleted by another viewer
   reset the filter, remote moves update the picker without overriding the user's choice, and a
   removed destination is never submitted. Covered by `brand-assets.test.tsx`.
2. **Done:** 618 pending files consolidated into 13 conventional commits (`859e849..a5f610e`).
3. **Done:** the development-efficiency rules. This file, `.claude/agents/`, the 30-line report
   template, and the rules in `AGENTS.md` / `CLAUDE.md`.
4. **In progress:** the production guide and configuration. See the decisions below.
5. **In progress:** verified findings from three read-only audits (security/production, web
   structure, database migrations). Fix them, then run the gate and commit per task.

## Accepted decisions

- **Production target:** the official self-hosted Supabase Docker distribution, with Cloudflare R2
  as its S3 Storage backend, plus the hardened `web` and `media` containers from `compose.yaml`
  behind a TLS reverse proxy. R2 stays inside Supabase Storage configuration, so RLS-scoped storage
  and signed URLs are unchanged. The application gets no R2 client. The user delegated this choice
  on 2026-09-23. See [production](../operations/production.md).
- **Development efficiency:** use lean project agents on the cheapest adequate model, keep reports
  at or under 30 lines, keep this checkpoint short, and commit every integrated task. See the
  root instructions and [agent orchestration](agent-orchestration.md#efficient-delegation).
- **SABRE demonstration overlay stays active:** 10 clients, 68 projects, 50 of them SABRE. The
  canonical seed remains 10 clients / 25 projects. Keep the ignored rollback checkpoints under
  `supabase/.local/`. Use only the guarded removal in the
  [demo guide](../../supabase/demo/sabre/README.md).
- **Brand Hub Templates UI is retired.** Old URLs redirect to Assets. Saved templates and
  owner-private drafts remain in the database, and the direct draft editors still work.

## Environment (observed 2026-09-23)

- Next.js dev server: `http://localhost:3003`, detached and file-logged. Do not start a
  competing server. Next 16 builds into `.next/`, separate from dev output in `.next/dev`.
- Local Supabase project `dawes-studios` on ports 55421–55424; trusted media on 55430.
  Do not reset or re-provision it.
- Branch `main`. The commits above are local; nothing has been pushed or deployed.

## Evidence

Checks run in this session:
- `npm run check`: 594 tests / 51 files; typecheck, lint and format clean (17:50 EDT).
- All 13 commits passed the gitleaks, lint-staged and commitlint hooks.

Historical evidence (not re-run in this session) lives in `docs/verification/*-2026-09-23.md`,
for example [client polish and brand folders](../verification/client-polish-and-brand-folders-2026-09-23.md).

## Open gaps

- J10 final release audit is unverified. The acceptance matrix rows B07, B08, C01, C09, C12,
  I01 and I06 carry owner notes. See the [acceptance matrix](../architecture/acceptance-matrix.md).
- Video upload attempts still lack recovery, cancellation and staging cleanup.
  See the [implementation plan](../architecture/implementation-plan.md).
- The browser suite is not in CI, because it needs a provisioned Supabase stack.
- Observation F-5 (an intermittent read-after-write test flake) is still open.

## Next actions

1. Finish `docs/operations/production.md` and align the operations runbook and README with it.
2. Fix the verified audit findings. Gate and commit each task.
3. Run the J10 release audit against a staging installation that uses the production topology.
