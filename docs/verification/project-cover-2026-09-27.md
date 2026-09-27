# Project cover — browser round trip, visual check (Task 3)

Date: 2026-09-27. Owner: Claude Opus 5.5 (Task 3). Runtime: existing Next.js dev server at
`http://localhost:3003`, local Supabase stack and the `dawes-studios-app-media-1` media container;
none was started, stopped or reset.

## Delivered behavior verified

A throwaway Playwright script (deleted before commit, not part of the suite) signed in as the
agency, created a disposable `createProductionFixture` project, and opened its **Project details**
panel:

- With no cover set, the block shows **No cover set yet.** and a **Set cover** control; no
  visibility switch or **Remove** is rendered.
- Choosing a PNG (`apps/web/tests/fixtures/campaign-preview.png`) through the hidden file input
  calls `POST /covers/prepare` and the preview renders the signed cover within 15 s.
- The **Visible to the client** switch starts unchecked (the RPC's own `false` default on a first
  upload) and toggling it calls `set_project_cover_visibility`, checking immediately.
- **Remove** opens a confirm dialog (**Remove this cover?**); accepting calls `POST /covers/clear`
  and the block returns to **No cover set yet.**

Screenshot: `outputs/cover-t3.png` (cover set, preview visible, switch checked, Replace/Remove
shown).

## Checks executed

- `cd apps/web && npm run check` — typecheck, eslint, prettier and the full unit suite (125 files /
  1300 tests) pass.
- The manual browser pass above, through `cleanupTestProject` after the cover was cleared through
  the UI's own Remove flow. A first, failed run of the same script (a `getByRole("button", { name:
  "Remove" })` locator collision with the assignment panel's own Remove button, fixed before the
  recorded run) left one orphaned `project_covers` row and object behind, because
  `cleanupTestProject` does not yet cascade-delete `project_covers` (its `session_replication_role
  =replica` delete bypasses the table's `on delete cascade` trigger — see Task 6). Removed by hand
  for this session (`storage.from("project-covers").remove([...])` plus the orphaned row): zero
  `project_covers` rows, zero `project-covers` objects and zero `Acceptance %` projects remain.

Not covered here: role isolation for a designer/client session (asserted at the unit level in
`project-cover.test.tsx`, not re-verified against real RLS in a browser) and the media service's own
`POST /covers/prepare`/`POST /covers/clear` contract, already covered by `apps/media`'s own
`server.test.js` per `apps/media/README.md`.
