# Page consistency, Deliverables and bulk brand uploads — 2026-09-28

Requested by the user on 2026-09-28. Checks below were run in this session against the local SABRE
funnel dataset (web :3003).

## Changes

1. **One page structure.** Studio pages (Overview, Team, Notifications, Settings) now use the same
   floating header cards and white title card as client pages (`StudioHeader`, `.card-workspace`,
   `.page-chrome`, `.card-heading`; the former `client-page-*` classes were renamed because they are
   no longer client-only). Team lists **Agency** first, then **Designers**, then **Invitations**,
   each in a card, with **Invite someone** in the title card. Settings tabs sit inside the title card.
2. **Help & support** removed from the sidebar.
3. **List sort** cycles ascending → descending → default order; Status steps through the statuses
   present and then returns to the default order.
4. **Delivered projects** show a **Deliverable** link beside Open in Miro on the client channel only
   (the client, and the agency's Shared with client view — not Working files), opening the project's
   Deliverables. Follow-up the same day: designers no longer see the Deliverables tab, page or
   Project details link.
5. **Brand Hub** puts every section's actions in the title card (`shared/header-actions.tsx`) with the
   tabs below, and search/filters in one `.hub-toolbar` row. **Files is now Deliverables**: delivery
   files only (working files and the All/Approved toggle retired), one card per project, and the
   delivery dialog holds the project's **Google Drive backup** link.
6. **Assets** accepts many files at once (drop or **Add files/Add images**) into the open folder;
   details are edited afterwards from the asset dialog (**Edit details**, agency).

## Checks executed

- `npm run check`: 133 files / 1,299 tests, types, lint and format PASS.
- Playwright (chromium), PASS: `deliverables`, `files-campaigns` (2), `brand-folders`,
  `brand-guidance` (retry/orphan), `brand-accessibility` (3), `client-pages-layout` (3),
  `miro-workspace`, `action-workflow`, `board-views` except the item below.
- Real browser drop of two PNGs into the "Test" folder created two assets named from their files in
  that folder; Edit details opened in the asset dialog. The two test assets and their Storage objects
  were then deleted.
- Title cards start at the same offset on studio and client pages (102 px at 1440 × 900); no
  horizontal overflow at 390 px on Home, Team or Brand Hub.

## Not passing / not run

- `board-views` "live SABRE board fits every view": canvas centering is off by 92 px on the live
  dataset. The check concerns the canvas placement from commit `fbb8189`; this task did not change
  the canvas.
- `action-notifications`: expects a designer "Submit round" action that the current live data does
  not hold. The handoff already lists specs that need other data.
- Other e2e suites were not run.

## Screenshots

![Team](screenshots/page-consistency-2026-09-28/team-desktop.png)
![Settings](screenshots/page-consistency-2026-09-28/settings-desktop.png)
![Deliverables](screenshots/page-consistency-2026-09-28/deliverables-desktop.png)
![Assets](screenshots/page-consistency-2026-09-28/assets-desktop.png)
![Delivered Miro bar](screenshots/page-consistency-2026-09-28/delivered-miro-bar.png)
![Home, phone](screenshots/page-consistency-2026-09-28/home-mobile.png)
![Deliverables, phone](screenshots/page-consistency-2026-09-28/deliverables-mobile.png)

## Follow-up: workflow order (same day)

User decision: designer → studio → **Approve round** or **Request changes** → share the approved
round → client decides → client feedback is sent back to designers from Working files.

- Migration `202609280009_studio_round_approval.sql` (applied with `supabase migration up --local`):
  request outcome `approved`, `approve_board_round`, `approve`/`share` capabilities, the
  `share_round` action, and sharing accepts approved rounds. `npm run db:types` regenerated.
- New pgTAP suite `round_approval.test.sql`: 23/23 PASS. `project_workflow` (52),
  `action_notifications` (56), `workflow_hardening` (29), `production_integrity` (37),
  `miro_workspace` (35) and `security_definer_coverage` (36) ran without failures.
- `npm run check`: 135 files / 1,308 tests PASS.
- Playwright PASS: `action-workflow` (two designers through delivery), `miro-workspace` (2),
  `action-notifications` (now also releases instructions first and covers the Share with client
  action and the Working files feedback destination).

![Studio review](screenshots/page-consistency-2026-09-28/studio-review-actions.png)
![Client feedback in Working files](screenshots/page-consistency-2026-09-28/feedback-actions.png)
