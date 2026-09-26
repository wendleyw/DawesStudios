# Codex / Claude continuation checkpoint

Updated: 2026-09-25 20:45 EDT. Owner: **Claude Code** (the interactive session that ran the themes
and the welcome dashboards plans). The overnight orchestrator `a375ed7c` has finished.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-2026-09-25.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- Claude Code took over when the previous run hit its usage limit; Codex is not running.
- Other sessions also work here (two were idle on 2026-09-25). Stage explicit paths only; give
  Playwright a private `--output`, since runs clear `test-results/`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done (2026-09-25)

**Welcome dashboards** ([spec](../superpowers/specs/2026-09-25-role-overview-dashboards-design.md),
[plan](../superpowers/plans/2026-09-25-role-overview-dashboards.md), `50b2bd4..143c6f3`): clients land
on a new **Overview** (`/clients/:clientId/overview`, first client-navigation link) with credits,
active projects, reviews waiting, an in-flight strip and three columns; the studio sees it as "What
<client> sees"; a designer's `/home` shows assigned work, no credits; every `/home` greets the viewer;
`projects.delivered_at` (`202609250001`) dates deliveries. Reviewed task by task (reports
`handoffs/2026-09-25-overview-*`), then an Opus review and one fix wave; record:
[verification](../verification/role-overview-dashboards-2026-09-25.md). Earlier: themes and Credits
rows ([history](history/handoff-2026-09-25.md)), then [2026-09-24](history/handoff-2026-09-24.md).

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
- **Themes:** System by default, kept per browser (`dawes-theme`); the canvas follows the theme;
  chrome stays monochrome. With a panel open the project bar centres beside it (hidden < 800 px).
- **Dashboards:** clients land on their Overview; the client Overview reads only client-visible data
  for every viewer; designers see assigned work and no credits; relative days follow the studio zone.

## Environment (observed 2026-09-24; server still up on 2026-09-25)

- Next.js dev server on `http://localhost:3003`, detached, logging to `/tmp/dawes-next-dev.log`.
  Turbopack's disk cache has missed `globals.css` edits before: if edits stop showing, clear
  `apps/web/.next/dev/cache` and restart it on the same port. Never start a competing server.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609250001`; local
  delivered projects show a 2026-09-25 `updated_at`); media on 55430. Do not reset or re-provision.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (this session, 2026-09-25)

- At `143c6f3`: `npm run check` 1048 tests / 93 files; `supabase test db` 22 files / 459 tests with
  only the six known overlay assertions failing; nine browser specs (overview, theme, navigation,
  client pages, workflow, console, project, playground, board) 46 of 46.
- Dashboards visual audit: 4 views × 2 themes × 1440/900/390, no overflow (captures in `outputs/`).
- Not re-run this session: `apps/media` tests and the overlay-count suites (`workspace-actions`,
  `design-audit`, `canonical-workspaces`, `workspace`); see [history](history/handoff-2026-09-24.md).

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
- Themes and dashboards: Safari and Firefox not run; the zoom pill's and project bar's vertical
  centres differ by 4–6 px (parked, cosmetic). What's moving has no overdue cue (the product has
  no overdue concept); pgTAP does not call `mark_project_delivered` (a browser test does).

## Next actions

**Production setup (user-deferred on 2026-09-23 in favour of product work).** Follow the
[production guide](../operations/production.md) on a real server: an R2 bucket with a scoped token
and the incomplete-multipart lifecycle rule, the Supabase storage override, the TLS proxy with
per-IP limits, SMTP, the first agency account, backups plus a restore drill, then the release
checklist. The local rehearsal already proves the rest.

1. The user's look at the dashboards: a client's Overview, the studio's "What <client> sees" and a
   designer's `/home`.
2. The user's review of the overnight work: the competitor ads spec's delegated decisions, the
   [decision log](decisions-2026-09-24.md), and the studio name **Offline probe** (test data; the
   default is "Dawes Studio"). To preview Meta ads, set `META_AD_LIBRARY_ACCESS_TOKEN`.
