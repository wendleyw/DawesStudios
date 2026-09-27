# Compact project header preview

- Owner: Codex; bounded visual experiment requested by the user, implemented and verified.
- Request: project title alone between client navigation and notifications; full channel bar below.
- Enable: `/projects/:id?layout=compact-header`; remove the parameter to compare the default.
- Changed: `project-page.tsx`, `project-workspace.tsx`, `miro-workspace-bar.tsx`, `miro-view.tsx`,
  `projects.css`, `workspace/canvas-header.tsx`, projects README, design-system preview note,
  verification record and its two final header images.
- Decision: URL-only opt-in, no preference/data mutation; mobile wraps the title onto its own row.
- Verified: web gate, 127 files / 1,249 tests; Chromium at 320/390/768/1024/1280/1600 px;
  zero header Axe violations; round/channel selection, More/Escape focus and Details pass.
- Desktop: header 189 → 136 px; 53 px reclaimed. Agency and existing client views inspected.
- Evidence: `docs/verification/compact-project-header-2026-09-27.md`.
- Limit: Miro emitted third-party loading errors; external board availability was not verified.
- Shared `handoff.md` is owned by the concurrent recovery/Resend work and was not overwritten.
  Its owner should link this report when integrating that checkpoint.
- Unrelated recovery/Resend files and the preexisting `login.png` deletion are preserved.
- Next: user reviews the preview and chooses to adopt, adjust or remove it. No push/deploy.
