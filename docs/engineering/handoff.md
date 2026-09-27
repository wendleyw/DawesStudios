# Codex / Claude continuation checkpoint

Updated: 2026-09-26 EDT (night). Owner: **Claude Code**; the session has ended and no session holds the tree.

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

**Miro workspace** (branch `feat/miro-workspace`, **not merged**; `5ecabde..dc8c05d` plus this docs
commit, [spec](../superpowers/specs/2026-09-26-miro-workspace-design.md)): named design boards (one
designer each) replace Versions in Working files, and per-project client versions replace it in
Shared with client, per channel (`usesWorkspace`). Rounds, sharing, a rewritten
`review_publication` for project-level versions, and designer-to-designer privacy on
`internal_comments` on both read and write (migrations `202609260006`, `0008`, `0009` — no `0007`).
`npm run check` 121/1258 passes; `supabase test db` locally fails `access_and_workflows`
1-2,4,9,18,32,41,54 and `published_asset_attestation_invariant` 1 — wider than the previously
recorded 2,4,9,18,32,54, unconfirmed whether any is a new regression; `playground.spec`
focus-return and `workspace-actions`:14/`design-audit`:18 fail on `main` too (all SABRE-overlay).
**Incident:** `supabase migration down` wiped the local database on 2026-09-26 (now forbidden,
AGENTS.md/CLAUDE.md); rebuilt via `local_stack.py reset` + the SABRE `apply`; the prior checkpoint
is kept at `supabase/.local/sabre-demo/state.pre-incident-2026-09-26.json`. Earlier:
[history](history/handoff-2026-09-26.md).

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
  writes; prefill never crosses channels; the raw URL is never stored or framed. Miro is a view
  of the project page; assets reach it by copy and paste only.

## Environment (observed 2026-09-26)

- Next.js dev server on `http://localhost:3003`, detached, logging to `/tmp/dawes-next-dev.log`. If
  `globals.css` edits stop showing, clear `apps/web/.next/dev/cache` and restart it on the same port
  (last done 2026-09-26 ~17:30, pid 91871). Never start a competing server.
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609260009`, rebuilt
  2026-09-26 after the incident above); media on 55430. Do not reset or re-provision.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- `main` has local commits only; `feat/miro-workspace` is checked out and not merged.

## Open gaps

- Real server items: an R2 bucket (object tagging), the TLS proxy, SMTP delivery, a restore
  drill, and rate limiting at the proxy.
- The notification feed shows only the latest 100 items, with no pagination (product decision).
- `add_design` computes `sort_order` with an unlocked `count(*)`, so concurrent adds to one version
  can collide (found while planning bulk drop, which registers sequentially per deliverable).
- tus termination on Supabase is unverified (a cancelled partial upload relies on the 24-hour window);
  a missing idempotent output reads as "raw upload expired"; Escape mid-upload closes silently.
- Unknown URLs (now `/search` too) show "page unavailable" with HTTP 200, not 404 (pre-existing).
  The tracked root `login.png` was deleted in the working tree by someone else; left for the user.
- The browser suite is not in CI. Observation F-5 (an intermittent test flake) is still open.
  Two legacy local Playground boards without `project_id` are unreachable (local data only).
- Safari and Firefox not run; zoom pill and project bar centres differ by 4–6 px (parked); What's
  moving has no overdue cue; pgTAP does not call `mark_project_delivered` (a browser test does).
- Miro: Escape is inert inside the cross-origin embed; the embed signs in only if Miro allows
  third-party cookies (Open in Miro stays visible); copy needs a browser with image clipboard support.
- Client people: a person in one client cannot accept an invitation to a second, nor a removed one be
  re-invited (`accept_invitation`); the canvas version panel omits the reviewer's name (parked).

## Next actions

**Production setup (user-deferred on 2026-09-23):** follow the
[production guide](../operations/production.md) on a real server (R2, TLS proxy, SMTP, backups).

1. Run the full all-roles Playwright pass on `feat/miro-workspace`, then merge it on the user's
   explicit approval; the two wider pgTAP failures above need a look first.
2. The user's look at client people and Miro mode (header switch, card button, asset strip copy).
3. The user's review of the overnight work: the competitor ads spec's delegated decisions, the
   [decision log](decisions-2026-09-24.md), and the studio name **Offline probe** (test data; the
   default is "Dawes Studio"). To preview Meta ads, set `META_AD_LIBRARY_ACCESS_TOKEN`.
