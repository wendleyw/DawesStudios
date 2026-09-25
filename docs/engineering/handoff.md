# Codex / Claude continuation checkpoint

Updated: 2026-09-24 17:25 EDT. Owner: **Claude Code** (interactive session `ab0cd20e`). The
overnight orchestrator `a375ed7c`, which took over from `dawesstudios-29`, has finished.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running.
- Other sessions also work here (at 17:20 one had uncommitted board edits and `zz-board-measure`).
  Stage explicit paths only; give Playwright a private `--output`, since runs clear `test-results/`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done today

`ab0cd20e`, one commit per approved request: client sections on the plain page background, the
grid kept for canvases (`0cec368`); sidebar Search, ⌘K and `/search` removed as duplicates of the
board's search, acceptance D03 retired by amendment, one-box search focus ring (`a4e5c02`);
Timeline lanes outside the window point to their work (`f30a39f`); List sorts by column title,
with a phone "Sort by" menu (`5ca4f71`); Files opens as campaign folders (`924fac9`); the design
viewer's feedback column runs full height, no General tab (`e130c95`); even card meta (`092e918`); project credits in the title card; animated sidebar mark (`310efb3`); single-line briefing and review list rows; wide briefing modal (`c63c27a`); boards open as List when no view is saved, with the header gap measured; an 18px canvas campaign title; the client header shows the client's logo alone at 48px on every client page (32px on phones and short windows), `6ced8dd` reverted for the studio logo. Sonnet
workers built the last three (reports: `handoffs/2026-09-24-*`); `.claude/agents/` did not load
here, so general-purpose workers followed `implementer.md`.

Overnight work (`a375ed7c`) and the complete system test are in the
[history](history/handoff-2026-09-24.md); earlier work in the [older history](history/handoff-through-2026-09-23.md).

## In progress

- Nothing. Version-wide feedback now opens in the version's panel on the board; Review version
  shows in the viewer's feedback column, that panel and the version card (one `reviewFor` rule).
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

- Next.js dev server on `http://localhost:3003`, restarted again at 21:40 (and 11:12) after clearing
  `apps/web/.next/dev/cache`: Turbopack's disk cache stopped picking up `globals.css` edits twice
  today (a `touch` fixed the first, not the second). It runs detached, logging to `/tmp/dawes-next-dev.log`. Do not start a
  competing server; if edits stop showing, clear that cache and restart it on the same port.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609240001`);
  trusted media on 55430. Do not reset or re-provision. The compose `media` container was rebuilt
  from the current tree at 2026-09-24 04:27 UTC, so it serves the video lifecycle routes.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (`a375ed7c`, 2026-09-24 05:00, after `7842df2`, unless noted)

- `ab0cd20e` at 11:20 and again at 11:58: `npm run check` 927 tests / 78 files, no lint warnings;
  browser: `client-pages-layout production-workflow client-navigation console-errors board-views
  files-campaigns` 23 of 23; `project-feedback production-workflow video-designs video-loading
  playground` 23 of 23; `workspace-actions design-audit` fail only on the overlay's counts.
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
- Unknown URLs (now `/search` too) show "page unavailable" with HTTP 200, not 404 (pre-existing).
  The tracked root `login.png` was deleted in the working tree by someone else; left for the user.
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