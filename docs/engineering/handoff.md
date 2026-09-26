# Codex / Claude continuation checkpoint

Updated: 2026-09-26 EDT. Owner: **Claude Code**. Session `dawesstudios-71` finished Miro links;
`dawesstudios-29` (client people) is next, with a repo-wide analysis, refactor and test pass.

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-2026-09-25.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- Claude Code took over when the previous run hit its usage limit; Codex is not running.
- Several sessions share `main` in this tree; agree file ownership by session message first.
  Stage explicit paths only; give Playwright a private `--output`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done (2026-09-26)

**Miro frame links on versions** ([spec](../superpowers/specs/2026-09-26-miro-version-links-design.md),
[plan](../superpowers/plans/2026-09-26-miro-version-links.md), `87db789..67b5c03`): the agency links a
frame to a published version (client board) or an internal version (designer board); **View on Miro**
opens a full-screen panel (frame shared with Playground as `useFullscreenLayer`). Migration
`202609260001`; CSP `frame-src https://miro.com`. [Verification](../verification/miro-version-links-2026-09-26.md);
earlier: client people ([history](history/handoff-2026-09-26.md)), [2026-09-25](history/handoff-2026-09-25.md).

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
- **Client people:** one login each, managed only by the studio; everyone at a client has the same
  permissions; designers see neither requester nor reviewer.
- **Miro:** product → Miro only (no API, no sync); one link per version and channel; agency-only
  writes; prefill never crosses channels; the raw URL is never stored or framed.

## Environment (observed 2026-09-26)

- Next.js dev server on `http://localhost:3003`, detached, logging to `/tmp/dawes-next-dev.log`. If
  `globals.css` edits stop showing, clear `apps/web/.next/dev/cache` and restart it on the same port
  (last done 2026-09-26 ~02:10, pid 78562). Never start a competing server.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609260002`, plus Miro `202609260001`; local
  delivered projects show a 2026-09-25 `updated_at`); media on 55430. Do not reset or re-provision.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- Branch `main`, local commits only. Nothing has been pushed or deployed.

## Evidence (2026-09-26)

- Miro, at `67b5c03`: `npm run check` 1147 tests / 103 files; `miro_version_links` pgTAP 31/31;
  Miro + CSP browser specs 4/4; panel and card audit 1440/390 × both themes (`outputs/miro/`).
- Client people, at `517bbb0`: `supabase test db` 24 files / 593 tests with only the six known
  overlay assertions failing; eleven browser specs 41 of 41. Not re-run: `apps/media`, overlay-count suites.

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
- Miro: real-board embed unchecked (needs a user board); Escape is inert inside the cross-origin
  embed (Back to project stays visible); an open panel keeps its link until reopened.
- Client people: a person in one client cannot accept an invitation to a second, nor a removed one be
  re-invited (`accept_invitation`); the canvas version panel omits the reviewer's name (parked).

## Next actions

**Production setup (user-deferred on 2026-09-23).** Follow the
[production guide](../operations/production.md) on a real server: R2 bucket and lifecycle rule,
storage override, TLS proxy with per-IP limits, SMTP, first agency account, backups, restore drill.

1. The user's look at client people and the Miro links (publish dialog field, card button, panel);
   a real Miro board for the pending embed check. Then `dawesstudios-29`'s repo-wide refactor.
2. The user's review of the overnight work: the competitor ads spec's delegated decisions, the
   [decision log](decisions-2026-09-24.md), and the studio name **Offline probe** (test data; the
   default is "Dawes Studio"). To preview Meta ads, set `META_AD_LIBRARY_ACCESS_TOKEN`.
