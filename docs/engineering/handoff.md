# Codex / Claude continuation checkpoint

Updated: 2026-09-27 EDT. Owner: **Claude Code** (active orchestrator session).

This file holds current state only and stays at or under 100 lines. When an entry is superseded,
move it to [history](history/handoff-2026-09-25.md) (or a newer history file). Read the
history only when a task needs earlier evidence.

## Ownership

- Claude Code owns implementation; Codex recorded the [no-R2 decision](handoffs/2026-09-27-production-without-r2.md).
- Several sessions share `main` in this tree; agree file ownership by session message first.
  Stage explicit paths only; give Playwright a private `--output`.
- To hand over: update this file, commit it, then start the other tool with the prompt in
  [agent orchestration](agent-orchestration.md#codex-and-claude-continuity).

## Done (2026-09-27)

Earlier entries (Miro merge, Miro bar, board due dates, account ring): [history](history/handoff-2026-09-26.md).
**Project covers** ([spec](../superpowers/specs/2026-09-27-project-cover-design.md)): agency upload,
sanitized by the media worker, "Visible to the client" toggle; board cards show cover or placeholder.
**Retire Versions, phase 1** ([spec](../superpowers/specs/2026-09-27-retire-versions-design.md),
`5d89e64..cddfa48`): only the Miro workspace renders; legacy UI and media routes deleted.
**Monthly credits** ([spec](../superpowers/specs/2026-09-27-monthly-credits-design.md),
`6fe2291..4f867c9`, migrations `202609270003`–`0006`): per-client monthly plans, extras, transfers,
lazy expiry; acceptance picks a month (current + 11); agency moves and settles a project's credits
once with a reason; month switcher on Credits. Reviewed; `monthly-credits.spec.ts` 5/5.

## In progress — Retire Versions, phase 5 acceptance (waiting for the user's reset approval)

Phases 1–4 done and reviewed ([plans](../superpowers/plans/)): phase 2 dropped the legacy schema
and data (`202609270007`) and 333 Storage objects, then `published-assets` (`0008`); phase 3 rebuilt
the seed (staging-verified, 10 / 25) and SABRE on boards, rounds, client versions and covers, and
backfilled the live overlay (50 covers, counts unchanged); phase 4 added the Drive link (`0009`,
`0010`); phase 5 rewrote the rules, docs and tests (`7afacc2`, `3bf2527`, `43e6b2c`, `411a245`).
The live overlay's rollback is superseded: `remove` refuses on it (legacy rows gone, manual boards);
the approved fresh reset + SABRE apply makes a new checkpoint. Canonical-count specs fail on the
overlay only (passed 7/7 on staging). Next: user approves → `local_stack.py reset
--confirm-local-data-loss`, verify canonical, SABRE apply, `remove --dry-run`, full e2e, record in
`docs/verification/`. Then the all-roles audit goal. (J10 staging: 68/72; only SMTP remains.)

## Accepted decisions

- **Production target (user update, 2026-09-27):** creative work lives in Miro; R2 is not required.
  Use official self-hosted Supabase with persistent filesystem Storage for remaining app uploads,
  plus `web`/`media` behind TLS and off-host backups. Keep the upstream Realtime hostname.
- **SABRE demonstration overlay stays active:** 10 clients, 68 projects, 50 of them SABRE. The
  canonical seed remains 10 clients / 25 projects. Use only the guarded removal in the
  [demo guide](../../supabase/demo/sabre/README.md).
- **Video lifecycle:** resume by choosing the same file again, one automatic retry plus a button,
  a 24-hour retention window, one Cancel in both phases, and approach A (no attempts table).
- **Themes:** System by default, kept per browser (`dawes-theme`); the canvas follows the theme;
  chrome stays monochrome except the Miro bar's channel row. With a panel open the project bar centres beside it (hidden < 800 px).
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
- Local Supabase `dawes-studios` on ports 55421–55424 (migrations through `202609270010`; rebuilt
  2026-09-26 after the incident in history); media on 55430. Never `db reset` / `migration down`.
- Staging rehearsal is **stopped** with its volumes kept (canonical dataset, 10 / 25). Resume it with
  `deploy/staging/scripts/stage.sh up && stage.sh app-up`. It is disposable.
- `main` has local commits only (not pushed); `feat/miro-workspace` is fully merged into it.

## Open gaps

- Real server items: filesystem Storage persistence, the TLS proxy, SMTP delivery, a restore
  drill, and rate limiting at the proxy. The existing MinIO staging rehearsal is historical.
- The notification feed shows only the latest 100 items, with no pagination (product decision).
- tus termination on Supabase is unverified (a cancelled partial upload relies on the 24-hour window);
  a missing idempotent output reads as "raw upload expired"; Escape mid-upload closes silently.
- Unknown URLs (now `/search` too) show "page unavailable" with HTTP 200, not 404 (pre-existing).
  The root `login.png` deletion in the working tree is someone else's; left for the user.
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
[production guide](../operations/production.md) on a real server (persistent Storage, TLS, SMTP, backups).

1. The user's hands-on look at the Miro workspace (boards, Send to studio, Share with client).
2. The user's look at client people and Miro mode (header switch, card button, asset strip copy).
3. The user's review of the overnight work: the competitor ads spec's delegated decisions, the
   [decision log](decisions-2026-09-24.md), and the studio name **Offline probe** (test data; the
   default is "Dawes Studio"). To preview Meta ads, set `META_AD_LIBRARY_ACCESS_TOKEN`.
