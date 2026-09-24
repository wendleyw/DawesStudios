# Codex / Claude continuation checkpoint

Updated: 2026-09-24 10:45 EDT. Owner: **Claude Code** (interactive session `ab0cd20e`). The
overnight orchestrator `a375ed7c`, which took over from `dawesstudios-29`, has finished.

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

`ab0cd20e` (10:45): the user found the client sections hard to read over the canvas line grid.
Briefings, Reviews, Files, Brand Hub and Credits (with briefing detail/editor and brand drafts)
now sit on the plain `--background` page surface; the grid stays on the four xyflow canvases.
`client-pages-layout.spec.ts` asserts it and failed on the old grid first.

Overnight, `a375ed7c` finished the video upload lifecycle, bulk image drop, Playground albums and
Competitor ads widget plans: see the [history](history/handoff-2026-09-24.md). Earlier
`dawesstudios-29` work is in the [older history](history/handoff-through-2026-09-23.md).

## In progress

- Nothing. The user's **complete system test** is done: 159 surfaces toured for three roles at two
  widths with none flagged, eleven findings fixed, the whole browser suite green apart from the five
  overlay-count scenarios. Record: [verification](../verification/system-test-2026-09-24.md). Every
  decision taken overnight on the user's behalf: [decision log](decisions-2026-09-24.md).
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

## Environment (observed 2026-09-24)

- Next.js dev server on `http://localhost:3003`, restarted at 04:25 after clearing
  `apps/web/.next/dev/cache`: Turbopack's disk cache had stopped picking up CSS changes (a restart
  alone did not help). It runs detached, logging to `/tmp/dawes-next-dev.log`. Do not start a
  competing server; if edits stop showing, clear that cache and restart it on the same port.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609240001`);
  trusted media on 55430. Do not reset or re-provision. The compose `media` container was rebuilt
  from the current tree at 2026-09-24 04:27 UTC, so it serves the video lifecycle routes.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (`a375ed7c`, 2026-09-24 05:00, after `7842df2`, unless noted)

- `ab0cd20e` at 10:45, after the background change: `npm run check` 863 tests / 75 files; the
  `client-pages-layout` browser spec 3 of 3 (both roles, every tested width, axe clean).
- `npm run check`: 863 tests / 75 files. `npm --prefix apps/media test`: 70 of 70.
- `supabase test db`: 21 files, 456 tests; only `access_and_workflows.test.sql` fails its known 6
  overlay assertions (2, 4, 9, 18, 32, 54).
- Browser, whole suite: 85 passed, 3 skipped (the `SYSTEM_TOUR` tours), 5 failed on the overlay's
  counts only (`canonical-workspaces`, `design-audit`, `workspace-actions`, both `workspace`).

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

1. The user's review of the overnight work: the competitor ads spec's delegated decisions, the
   [decision log](decisions-2026-09-24.md), and the studio name **Offline probe** (test data; the
   default is "Dawes Studio"). To preview Meta ads, set `META_AD_LIBRARY_ACCESS_TOKEN`.