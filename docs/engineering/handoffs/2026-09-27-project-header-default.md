# Default project header

- Owner: Codex; user approved the direction for project pages only.
- Completed: campaign/title/due badge is the default for agency, designer and client project URLs.
- Removed: preview flag/branches, preview naming and old two-row bar styles; old links still work.
- Preserved: viewer-specific deadlines, channel/board permissions, Miro and all existing actions.
- Changed: project page/workspace/header/bar/styles, their affected tests, feature/design docs,
  historical preview pointers and current verification images.
- Boundary: no changes to other page headers or the restored desktop board toolbar.
- Verified: web gate 127 files / 1,253 tests; three roles × five viewport sizes; 15 header Axe scans
  clean; More/Escape and Details for each role; agency round/channel selection; unaffected board.
- Missing-client/campaign data and all three roles' deadline behavior are covered by unit tests.
- Browser checks used ordinary project URLs. Final captures inspected; no shared-tab emulation.
- Evidence: `docs/verification/project-header-default-2026-09-27.md`.
- Limit: isolated checks blocked unchanged external Miro frames; no new Miro-service claim.
- Unrelated `login.png` deletion retained. Production/SABRE state and release gaps preserved.
- Shared checkpoint: concurrent sidebar/invitation task owns `handoff.md`; its owner should link
  this report and replace the now-historical opt-in decision with the approved projects-only rollout.
- Typography follow-up: title weight 700; size/spacing retained; design guidance updated.
- Current checks: Prettier, 81 CSS tests, both fonts at desktop/mobile sizes and native browser pass.
- Next: normal project use and user feedback. No push or deployment authorized.
