# Handoff history — 2026-09-28 page consistency

Moved from `handoff.md` when newer tasks superseded it.

## Previous task (Claude, 2026-09-28) — page consistency, Deliverables, bulk brand uploads

- Studio pages share the client pages' floating header/title cards; Team orders Agency first; Help &
  support removed; List sort returns to default; delivered Miro bar links to Deliverable.
- Brand Hub actions live in the title card; Files renamed **Deliverables** (delivery files only, Drive
  backup in the delivery dialog; working files retired); Assets takes bulk drops, Edit details after.
- `npm run check` PASS (1,299 tests); affected Playwright specs PASS except live-data `board-views`
  canvas centering and `action-notifications`. [Record](../verification/page-consistency-2026-09-28.md).
- Workflow order (same day): **Approve round** between Send to studio and Share with client
  (migration 009, applied forward); client feedback answered from Working files; direct share in ⋯.
  pgTAP `round_approval` 23/23; workflow Playwright specs PASS.
- A stale Turbopack cache served old `globals.css` after a `git stash`; fix: stop the server, delete
  `apps/web/.next/dev`, restart.

- Earlier 2026-09-28 entries (funnel test, Overview identity):
  [history](history/handoff-2026-09-28-funnel-and-overview.md).

## Earlier task (Claude, 2026-09-28) — sign-in intro

- After a sign-in the workspace opens behind a one-time full-screen intro (`workspace/sign-in-intro.tsx`,
  `public/brand/intro.webm`, black mark on white): holds until auth/profile load, fades, skippable,
  never with reduced motion; reloads/navigation skip it. `npm run check` PASS (1,314 tests); browser
  check on :3003 (agency sign-in → intro → Overview; reload shows no intro). Uncommitted: `D login.png`
  remains preexisting and unrelated.

- Page consistency / Deliverables / Approve round entry: [history](history/handoff-2026-09-28-page-consistency.md).
