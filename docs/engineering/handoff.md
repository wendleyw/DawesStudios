# Codex / Claude continuation checkpoint

Updated: 2026-09-25 10:05 EDT. Owner: **Claude Code** (the interactive session that ran the light
and dark themes plan). The overnight orchestrator `a375ed7c` has finished.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-through-2026-09-23.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- The user asked Claude Code to take over after the previous run hit its usage limit. Codex was
  the previous owner and is not running.
- Other sessions also work here (three were idle on 2026-09-25). Stage explicit paths only; give
  Playwright a private `--output`, since runs clear `test-results/`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done (2026-09-25)

The user's **light and dark themes** request, from an approved
[spec](../superpowers/specs/2026-09-24-themes-and-canvas-design.md) and
[plan](../superpowers/plans/2026-09-24-themes-and-canvas.md), commits `47b50a7..8bdedd6`:
**Theme: System / Light / Dark** in the sidebar, applied before the first paint by a head script
that also follows other tabs; every colour a `light-dark()` pair, guarded by
`features/shared/theme-colors.test.ts` (literal gate plus WCAG AA pairs); every canvas a dot grid
with one horizontal zoom pill; Project details, Conversation and Playground in a bar at the bottom
of the project canvas; the Playground rises from the bottom. Sonnet workers built each task
(reports: `handoffs/2026-09-25-themes-*`), each reviewed; an Opus whole-branch review led to one
fix wave. Record: [verification](../verification/themes-and-canvas-2026-09-25.md).

The 2026-09-24 daytime session (`ab0cd20e`), the overnight work (`a375ed7c`) and the complete
system test are in the [history](history/handoff-2026-09-24.md); earlier work in the
[older history](history/handoff-through-2026-09-23.md).

## In progress

- Nothing. **J10 on staging:** 68 of 72 scenarios pass on the canonical dataset; only SMTP remains.

## Accepted decisions

- **Production target:** the official self-hosted Supabase Docker distribution, with Cloudflare R2
  as its S3 Storage backend, plus the hardened `web` and `media` containers behind a TLS proxy.
  R2 stays inside Supabase Storage configuration. Keep the upstream Realtime hostname.
- **SABRE demonstration overlay stays active:** 10 clients, 68 projects, 50 of them SABRE. The
  canonical seed remains 10 clients / 25 projects. Use only the guarded removal in the
  [demo guide](../../supabase/demo/sabre/README.md).
- **Video lifecycle:** resume by choosing the same file again, one automatic retry plus a button,
  a 24-hour retention window, one Cancel in both phases, and approach A (no attempts table).
- **Themes:** System by default, the choice kept per browser (`dawes-theme`), no account sync; the
  canvas follows the theme; chrome stays monochrome; client logos sit on a light plate in dark
  mode. With a side panel open the project bar centres beside it and hides below an 800 px canvas.

## Environment (observed 2026-09-24; server still up on 2026-09-25)

- Next.js dev server on `http://localhost:3003`, detached, logging to `/tmp/dawes-next-dev.log`.
  Turbopack's disk cache has missed `globals.css` edits before: if edits stop showing, clear
  `apps/web/.next/dev/cache` and restart it on the same port. Never start a competing server.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609240001`);
  trusted media on 55430. Do not reset or re-provision. The compose `media` container was rebuilt
  from the current tree at 2026-09-24 04:27 UTC, so it serves the video lifecycle routes.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (this session, 2026-09-25)

- At `8bdedd6`: `npm run check` 1013 tests / 86 files, clean; ten browser specs (theme,
  playground, project, board, workflow, console, video, canvas, creation, navigation) 49 of 49.
- Two-theme visual audit, 12 views at 1440/900/390, no defects (captures in ignored `outputs/`).
- Not re-run this session: `supabase test db`, `apps/media` tests and the overlay-count suites;
  their last results are in the [history](history/handoff-2026-09-24.md).

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
- Themes: Safari and Firefox not run (the CSS pipeline compiles a `light-dark()` fallback); the
  zoom pill's and project bar's vertical centres differ by 4–6 px (parked, cosmetic).

## Next actions

**Production setup (user-deferred on 2026-09-23 in favour of product work).** Follow the
[production guide](../operations/production.md) on a real server: an R2 bucket with a scoped token
and the incomplete-multipart lifecycle rule, the Supabase storage override, the TLS proxy with
per-IP limits, SMTP, the first agency account, backups plus a restore drill, then the release
checklist. The local rehearsal already proves the rest.

1. The user's review of the overnight work: the competitor ads spec's delegated decisions, the
   [decision log](decisions-2026-09-24.md), and the studio name **Offline probe** (test data; the
   default is "Dawes Studio"). To preview Meta ads, set `META_AD_LIBRARY_ACCESS_TOKEN`.