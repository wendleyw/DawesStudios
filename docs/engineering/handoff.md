# Codex / Claude continuation checkpoint

Updated: 2026-09-23 22:45 EDT. Owner: **Claude Code** (session `dawesstudios-29`), active
orchestrator since 17:50 EDT.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running.
- Other interactive Claude sessions of the user's also work here. `dawesstudios-3b` owns the
  client logo feature. Every session stages explicit paths only; never run `git add -A`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done in this session

The details and evidence are in the
[verification record](../verification/production-hardening-2026-09-23.md).

- **Interrupted task:** brand-folder remote changes, plus consolidation of 618 files (`859e849..a5f610e`).
- **Workflow rules:** lean project agents, 30-line reports, this checkpoint, commit per task.
  E2e evidence goes to `outputs/` unless `WRITE_EVIDENCE=1`.
- **Production:** the [production guide](../operations/production.md) and a local
  [staging rehearsal](../../deploy/staging/README.md) with MinIO standing in for R2.
- **Audit fixes:** cascade indexes, dead CSS and private exports, styling moves, full CSP with
  HSTS, a streamed invitation cap, the Playground hook split, and jitless Zod (`712828e`).
- **Test harness:** credentials for a declared backend (`155f976`), and privileged cleanup in that
  backend's database (`a2e7bdc`).
- **Client logo** (from `dawesstudios-3b`: `47b47d1`, `3650c2a`, `c529671`, `8506306`): the
  agency sets a logo in Settings > Clients; it is raster only; the 48px mark appears only on the
  wide client board header.

## In progress

- **Video upload lifecycle:** the [plan](../superpowers/plans/2026-09-23-video-upload-lifecycle.md)
  (`4e56cdb`) is approved for native execution in a fresh session. No code yet.
- **Bulk image drop:** spec approved; [plan](../superpowers/plans/2026-09-23-bulk-image-drop.md)
  (7 tasks) awaits the user's plan review. **Playground albums:**
  [spec](../superpowers/specs/2026-09-23-playground-albums-design.md) awaits review. Order: video,
  then bulk drop, then albums (both touch `project-data.ts`).
- **Fixed today from user reports:** briefing acceptance used the UTC date and failed after 8 PM
  EDT, and the budget panel showed two primary actions (`0d310d5`, migration `202609230013`).
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
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609230013`);
  trusted media on 55430. Do not reset or re-provision.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (this session)

- `npm run check`: 609 tests / 53 files, clean after `712828e`. `npm run build`: exit 0.
- Local browser checks after the fixes: `intake-admin` 6 of 6. The owning session reported the
  two logo-affected specs passing 13 of 13.
- Local `npm run db:test`: 17 of 18 files pass. The canonical-count file fails under the SABRE
  overlay, as expected. The local data was verified intact after the staging runs.

## Open gaps

- Real server items: an R2 bucket (object tagging), the TLS proxy, SMTP delivery, a restore
  drill, and rate limiting at the proxy.
- The notification feed shows only the latest 100 items, with no pagination (product decision).
- `add_design` computes `sort_order` with an unlocked `count(*)`, so concurrent adds to one version
  can collide (found while planning bulk drop, which registers sequentially per deliverable).
- The browser suite is not in CI. Observation F-5 (an intermittent test flake) is still open.
  Two legacy local Playground boards without `project_id` are unreachable (local data only).

## Next actions

**Production setup (user-deferred on 2026-09-23 in favour of product work).** Follow the
[production guide](../operations/production.md) on a real server: an R2 bucket with a scoped token
and the incomplete-multipart lifecycle rule, the Supabase storage override, the TLS proxy with
per-IP limits, SMTP, the first agency account, backups plus a restore drill, then the release
checklist. The local rehearsal already proves the rest.


1. In a fresh session: implement the video lifecycle plan natively. Start it with:
   `claude "Read CLAUDE.md and docs/engineering/handoff.md, record yourself as the incoming
   orchestrator, then execute docs/superpowers/plans/2026-09-23-video-upload-lifecycle.md with
   superpowers:executing-plans: TDD per step, gate and a conventional commit per task, explicit
   paths only, and the next free migration number. Finish with one whole-branch review by the
   reviewer agent, then update this checkpoint."`
