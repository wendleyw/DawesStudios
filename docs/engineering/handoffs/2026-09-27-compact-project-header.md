# Compact project header preview

- Owner: Codex; bounded visual experiment requested by the user, implemented and verified.
- Request: project title alone between client navigation and notifications; full channel bar below.
- Enable: `/projects/:id?layout=compact-header`; remove the parameter to compare the default.
- Changed: `project-page.tsx`, `project-workspace.tsx`, `miro-workspace-bar.tsx`, `miro-view.tsx`,
  `projects.css`, `workspace/canvas-header.tsx`, projects README, design-system preview note,
  verification record and its two final header images.
- Decision: URL-only opt-in, no preference/data mutation; mobile wraps the title onto its own row.
- Follow-up implemented: campaign above the title via existing `useCampaigns`; due badge beside
  the title, using the existing role-specific deadline, without repetition in the lower bar.
- Verified: web gate, 127 files / 1,249 tests; Chromium at 320/390/768/1024/1280/1600 px;
  zero header Axe violations; round/channel selection, More/Escape focus and Details pass.
- Desktop: header 189 → 136 px; 53 px reclaimed. Agency and existing client views inspected.
- Follow-up: the shared Chrome tab had a fixed 1600 × 1000 test viewport. Opened a fresh preview
  with no emulation; native 1512 × 696, no overflow, account/bar/bottom tools entirely visible.
  No CSS change needed; keep future viewport matrices in isolated test browsers.
- Evidence: `docs/verification/compact-project-header-2026-09-27.md`.
- Limit: Miro emitted third-party loading errors; external board availability was not verified.
- Recovery/Resend owner released the shared checkpoint after `a7b35e5`; the UI integration
  now updates it while preserving that task's objective, evidence and production gaps.
- Unrelated recovery/Resend files and the preexisting `login.png` deletion are preserved.
- Next: user reviews the preview and chooses to adopt, adjust or remove it. No push/deploy.
