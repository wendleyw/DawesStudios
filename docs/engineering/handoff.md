# Codex / Claude continuation checkpoint

Updated: 2026-09-23 18:15 EDT. Owner: **Claude Code** (session `dawesstudios-29`), active
orchestrator since 17:50 EDT.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running.
- Two other interactive Claude sessions of the user's ran in this repository this evening. One of
  them (`dawesstudios-3b`) delivered the client logo feature below and coordinated through
  cross-session messages. Every session stages explicit paths only; never run `git add -A`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Current objective

The user asked for four things: finish the interrupted task, refactor with the system agents,
make the documentation production-ready, and make the development workflow cheaper.

1. **Done:** the interrupted brand-folder remote-change task. Covered by
   `brand-assets.test.tsx` and the browser spec `brand-folders.spec.ts`.
2. **Done:** 618 pending files consolidated into 13 conventional commits (`859e849..a5f610e`).
3. **Done:** the development-efficiency rules (`e806188`). Project agents live in `.claude/agents/`
   and load at the next session start.
4. **Done:** the [production guide](../operations/production.md) (`6abe07f`, `0608eb6`).
5. **In progress:** verified audit findings. The database cascade indexes are done (`9750473`).
   Three implementers are working on the rest: web mechanical cleanup (dead CSS, styling
   boundary, unused exports), the `playground-board.tsx` split with a shared upload vocabulary,
   and security headers (full CSP, HSTS, `poweredByHeader`, a streamed size cap on invitations).
   Reports go to `handoffs/2026-09-23-{web-mechanical-cleanup,playground-board-split,security-headers}.md`.

## Integrated from another session

- **Client logo** (`47b47d1`, `3650c2a`, by `dawesstudios-3b`). The agency sets a client logo in
  Settings > Clients, and it appears in the board header through `ClientMark` (rendered only as
  `<img>`). Migration `202609230010` adds `clients.logo_path` and makes the brand storage delete
  policy protect referenced logos. Migration `202609230012` limits logos to raster types (png,
  jpg, jpeg, webp) after a security flag on SVG. That session reported `client_logo.test.sql`
  passing 8/8 and `npm run check` passing 594/594.

## Accepted decisions

- **Production target:** the official self-hosted Supabase Docker distribution, with Cloudflare R2
  as its S3 Storage backend, plus the hardened `web` and `media` containers behind a TLS proxy.
  R2 stays inside Supabase Storage configuration; the application has no R2 client.
- **Development efficiency:** lean agents on the cheapest adequate model, reports of 30 lines or
  fewer, this checkpoint kept short, and a commit per integrated task. The browser suite writes
  screenshots to the ignored `outputs/`; set `EVIDENCE_SCREENSHOTS=1` for committed evidence.
- **SABRE demonstration overlay stays active:** 10 clients, 68 projects, 50 of them SABRE. The
  canonical seed remains 10 clients / 25 projects. Use only the guarded removal in the
  [demo guide](../../supabase/demo/sabre/README.md).
- **Brand Hub Templates UI is retired.** Old URLs redirect to Assets; drafts remain editable.

## Environment (observed 2026-09-23)

- Next.js dev server on `http://localhost:3003`, detached and file-logged. Do not start a
  competing server. Next 16 builds into `.next/`, separate from dev output in `.next/dev`.
- Local Supabase project `dawes-studios` on ports 55421–55424 (migrations through
  `202609230012`); trusted media on 55430. Do not reset or re-provision.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (checks run in this session)

- `npm run check`: 594 tests / 51 files, clean (17:50). `npm run build`: exit 0 (18:04).
- `brand-folders.spec.ts`: 1 passed in Chromium against the local stack (18:06).
- `npm run db:test`: 17 of 18 files pass. `access_and_workflows.test.sql` fails 6 of 55
  assertions, all canonical-count checks (exactly 25 projects, SABRE's seven), because the SABRE
  overlay is active. This is expected per the demo guide.
- Audits: `npm audit` found 0 advisories for web and media; gitleaks found no leaks in 155
  commits; the database review found no critical or high issues, and the migrations are safe on
  a fresh database.

## Open gaps

- The J10 final release audit is unverified; see the [acceptance matrix](../architecture/acceptance-matrix.md).
- Video attempts still lack recovery, cancellation and staging cleanup ([plan](../architecture/implementation-plan.md)).
- The browser suite is not in CI. Observation F-5 (an intermittent test flake) is still open.
- Two legacy local Playground boards without `project_id` are unreachable. This affects local
  data only.

## Next actions

1. Integrate the three implementer reports. Run the gate and a browser check (CSP needs the
   board, project video, Playground and brand specs), then commit each task.
2. Run the J10 release audit on a staging installation with the production topology.
