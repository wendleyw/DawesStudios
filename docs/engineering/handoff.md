# Codex / Claude continuation checkpoint

Updated: 2026-09-24 01:40 EDT. Owner: **Claude Code** (fresh session `a375ed7c`), active
orchestrator since 23:55 EDT; it took over from `dawesstudios-29` to execute the approved plans.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running.
- Other interactive Claude sessions of the user's also work here (`dawesstudios-52` committed the
  deliverable frames, `317c7bc`). Every session stages explicit paths only; never run `git add -A`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done today

`a375ed7c`: the **video upload lifecycle** plan, all nine tasks (`fdb9a2f..7f3d3f0`, migration
`202609230014`): cancel in both phases, resume, one automatic retry plus **Try processing again**,
and the 24-hour sweep. Whole-branch review: no Critical or Important findings. Record:
[verification](../verification/video-upload-lifecycle-2026-09-23.md). Then **bulk image drop**, all
seven tasks (`422178d..0a274a1`): "shared" is the version's `reviewed` status (the plan's
published-number rule misjudged 7 of 101 local deliverables). Review: one Critical and one Important,
both fixed with tests. Record: [verification](../verification/bulk-image-drop-2026-09-23.md).

`dawesstudios-29` ([record](../verification/production-hardening-2026-09-23.md)): consolidated 618 files into commits; workflow rules and lean agents; production guide and local
staging rehearsal; audit fixes (indexes, dead CSS, styling moves, CSP and HSTS, invitation cap,
Playground split, jitless Zod); test harness for declared backends; the client logo feature from
`dawesstudios-3b`; and the briefing acceptance date and single budget action (`0d310d5`).

## In progress

- **Playground albums:** the [plan](../superpowers/plans/2026-09-23-playground-albums.md) (6 tasks)
  executes next, inline in `a375ed7c` on `main` (ledger in the git-ignored
  `.superpowers/sdd/2026-09-23-playground-albums/`). Then the user's requested complete test of
  logic, UX, UI and every action for all roles, with a screenshot of every screen.
- **Fixed today from user reports:** briefing acceptance on the studio's local date and one budget
  action (`0d310d5`, migration `202609230013`).
- **J10 on staging:** 68 of 72 scenarios pass on the canonical dataset; only SMTP remains.

## Accepted decisions

- **Production target:** the official self-hosted Supabase Docker distribution, with Cloudflare R2
  as its S3 Storage backend, plus the hardened `web` and `media` containers behind a TLS proxy.
  R2 stays inside Supabase Storage configuration. Keep the upstream Realtime hostname.
- **SABRE demonstration overlay stays active:** 10 clients, 68 projects, 50 of them SABRE. The
  canonical seed remains 10 clients / 25 projects. Use only the guarded removal in the
  [demo guide](../../supabase/demo/sabre/README.md).
- **Video lifecycle:** resume by choosing the same file again, one automatic retry plus a button,
  a 24-hour retention window, one Cancel in both phases, and approach A (no attempts table).

## Environment (observed 2026-09-23)

- Next.js dev server on `http://localhost:3003`, restarted at 18:40 because its watcher had
  stalled. It runs detached, logging to `/tmp/dawes-next-dev.log`. Do not start a competing server.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609230014`);
  trusted media on 55430. Do not reset or re-provision. The compose `media` container was rebuilt
  from the current tree at 2026-09-24 04:27 UTC, so it serves the video lifecycle routes.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (`a375ed7c`, after `7f3d3f0`)

- `npm run check`: 652 tests / 55 files (the tree included the other session's edits).
  `npm --prefix apps/media test`: 70 of 70.
- `npm run db:test`: 19 of 20 files pass. `access_and_workflows.test.sql` fails its known 6
  assertions under the SABRE overlay, as expected.
- Browser: `video-designs.spec.ts` 6 of 6; the seven dialog-affected specs 23 of 23. The whole
  suite was not run.

## Open gaps

- Real server items: an R2 bucket (object tagging), the TLS proxy, SMTP delivery, a restore
  drill, and rate limiting at the proxy.
- The notification feed shows only the latest 100 items, with no pagination (product decision).
- `add_design` computes `sort_order` with an unlocked `count(*)`, so concurrent adds to one version
  can collide (found while planning bulk drop, which registers sequentially per deliverable).
- tus termination on Supabase is unverified; a cancelled partial upload relies on the 24-hour
  window (R2: a one-day incomplete-multipart rule). Deferred minors from the video review: a
  missing idempotent output reads as "raw upload expired"; Escape mid-upload closes silently.
- The browser suite is not in CI. Observation F-5 (an intermittent test flake) is still open.
  Two legacy local Playground boards without `project_id` are unreachable (local data only).

## Next actions

**Production setup (user-deferred on 2026-09-23 in favour of product work).** Follow the
[production guide](../operations/production.md) on a real server: an R2 bucket with a scoped token
and the incomplete-multipart lifecycle rule, the Supabase storage override, the TLS proxy with
per-IP limits, SMTP, the first agency account, backups plus a restore drill, then the release
checklist. The local rehearsal already proves the rest.

1. Continue the ordered run in `a375ed7c`: the bulk image drop plan, then
   `docs/superpowers/plans/2026-09-23-playground-albums.md`, each with superpowers:executing-plans,
   one whole-branch review and a checkpoint update. If this session ends first, a fresh session
   resumes from the plan's ledger and `git log` (completed tasks have `Task N: complete` lines).