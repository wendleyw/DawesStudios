# Superseded handoff entries — 2026-09-28

Moved from `docs/engineering/handoff.md` when the page-consistency task was checkpointed.
Relative links below were written for `docs/engineering/` and point one level up from here.

## Previous task (Claude, 2026-09-28) — SABRE funnel test + layout fixes

- Local data: SABRE only, 20 funnel projects F01–F20 (two designers, public Miro test boards),
  402 credits; backups `supabase/.backups/20260928-before-funnel-reset` and `...-before-sabre-only`.
- 20 scenarios / 263 UI actions passed via Playwright MCP; [record](../../verification/funnel-test-2026-09-28.md).
  Ignored harness `outputs/funnel-harness` (serve with `python3 outputs/funnel-server.py`), report
  `outputs/funnel-report/index.html`. One scenario per MCP call (30-minute idle limit).
- UI: centered dock over cropped Miro (no zoom/scrollbars); bar state matches status (S03 run), no swipe-back on canvas, board kept across channel switch, CEO demo D01 9/9 chapters, Review R#, role-aware Backlog/empty copy, pinned
  dialog actions, scroll-row navigation/tabs, solid client sticky header with scroll-padding,
  overview/briefing/brand/files grid and spacing fixes, canvas fit floor 75%.
- `npm run check` PASS (1,293 tests). Updated stale e2e assertions (miro-workspace, project-feedback,
  client-navigation). Client-switcher, overview-notes and sabre-development specs need other data.
- The dev server does not hot-reload `globals.css`: restart with `outputs/funnel-harness/restart-web.sh`.
- Status walkthrough (S02): 16/16 checkpoints; Miro bar standardized (board · designer, Live/R#,
  no repeated state, designers see only their live board). [Record](../../verification/status-walkthrough-2026-09-28.md).

## Latest UI change

- Client Overview now shows the client's logo, the signed-in viewer's greeting and studio-local
  weekday/date. The old Overview/agency-preview text is removed.
- The logo appears in either the welcome card or the upper menu. Navigation, history and keyboard
  activate a460ms move/scale; direct visits and reduced motion use immediate placement.
- `ClientIdentityProvider` retains only departing geometry; guards handle Strict Mode and cached
  route effects. Client/designer permissions, figures and the SABRE1/6 dataset are unchanged.
- [UI verification](../../verification/overview-client-identity-2026-09-28.md) records final checks,
  desktop/mobile captures and animation coverage. No active workers or database migration.

