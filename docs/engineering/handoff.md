# Codex / Claude continuation checkpoint

Updated: 2026-09-23 18:55 EDT. Owner: **Claude Code** (session `dawesstudios-29`), active
orchestrator since 17:50 EDT.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running.
- Other interactive Claude sessions of the user's also ran here this evening. `dawesstudios-3b`
  owns the client logo feature and has open regressions from it (below). Every session stages
  explicit paths only; never run `git add -A`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Completed in this session

All four parts of the user's request are done. The evidence is in the
[verification record](../verification/production-hardening-2026-09-23.md).

1. **Interrupted task:** brand-folder remote changes (unit tests plus `brand-folders.spec.ts`).
2. **Consolidation:** 618 pending files in 13 conventional commits (`859e849..a5f610e`).
3. **Workflow:** lean project agents, 30-line reports, this short checkpoint, commit per task
   (`e806188`). E2e evidence goes to the ignored `outputs/` unless `WRITE_EVIDENCE=1` (`3b8f890`).
4. **Production:** [production guide](../operations/production.md) (`6abe07f`, `0608eb6`).
5. **Audit fixes:** cascade indexes (`9750473`); dead CSS and private exports (`80cfe7e`);
   styling-boundary moves (`e338dd6`); full CSP, HSTS, no `X-Powered-By`, streamed invitation
   cap (`ea4ca8f`); Playground hook split with a shared upload vocabulary (`4516409`).

## Integrated from another session

- **Client logo** (`47b47d1`, `3650c2a`, `c529671`, by `dawesstudios-3b`). The agency sets a logo
  in Settings > Clients, and it appears in the board and project header as `<img>`. Migrations
  `202609230010` (`clients.logo_path`, protected from deletion) and `202609230012` (raster only).

## Accepted decisions

- **Production target:** the official self-hosted Supabase Docker distribution, with Cloudflare R2
  as its S3 Storage backend, plus the hardened `web` and `media` containers behind a TLS proxy.
  R2 stays inside Supabase Storage configuration; the application has no R2 client.
- **Development efficiency:** see the root instructions and
  [efficient delegation](agent-orchestration.md#efficient-delegation). Project agents in
  `.claude/agents/` load at session start, so start a new session to use them by name.
- **SABRE demonstration overlay stays active:** 10 clients, 68 projects, 50 of them SABRE. The
  canonical seed remains 10 clients / 25 projects. Use only the guarded removal in the
  [demo guide](../../supabase/demo/sabre/README.md).
- **Brand Hub Templates UI is retired.** Old URLs redirect to Assets; drafts remain editable.

## Environment (observed 2026-09-23)

- Next.js dev server on `http://localhost:3003`, detached and file-logged. Do not start a
  competing server. Next 16 builds into `.next/`, separate from dev output in `.next/dev`.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609230012`);
  trusted media on 55430. Do not reset or re-provision.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (checks run in this session, on `4516409`)

- `npm run check`: 607 tests / 52 files, clean. `npm run build`: exit 0.
- Browser, 44 scenarios: 37 passed, 3 failed, 4 skipped after a serial failure. `intake-admin`
  passes 6 of 6 after its fix. Both remaining failures trace to `c529671` (below).
  `content-security-policy.spec.ts` passes with no violations for three roles.
- `npm run db:test`: 17 of 18 files pass. `access_and_workflows` fails 6 of 55 canonical-count
  assertions because the SABRE overlay is active, which is expected.
- Audits: 0 npm advisories; gitleaks clean across 155 commits; no critical or high database issue.

## Open gaps

- **Logo regressions (owner `dawesstudios-3b`, notified):** the 48px header mark truncates
  "SABRE" at 768px (`board-views.spec.ts:343`) and shrinks the feedback list below half the
  panel (`project-feedback.spec.ts:205`). Measurements are in the verification record.
- The J10 final release audit is unverified; it needs a staging installation with the
  production topology.
- Video attempts still lack recovery, cancellation and staging cleanup ([plan](../architecture/implementation-plan.md)).
- The notification feed shows only the latest 100 items, with no pagination. This needs a
  product decision.
- The browser suite is not in CI. Observation F-5 (an intermittent test flake) is still open.
  Two legacy local Playground boards without `project_id` are unreachable (local data only).

## Next actions

1. Confirm the logo owner's fix with `npm --prefix apps/web run test:e2e -- board-views project-feedback`.
2. Start a fresh session so the project agents load. Then stand up staging, run the production
   checklist and the J10 audit.
3. Implement video attempt recovery and cancellation.
