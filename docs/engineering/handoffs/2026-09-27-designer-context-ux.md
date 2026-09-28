# Designer context UX handoff

- Owner: Codex orchestrator; implemented and verified locally.
- Scope: project inspector, comment scopes and Miro bar for designers.
- Source: project-details, project-tool-bar, project-workspace, project-header,
  miro-workspace-bar, comment-panel, projects.css and colocated regression tests.
- Decision: linked designer projects open Briefing first; Project info is secondary.
- Designer sidebar never mounts the agency cover. Project-card covers stay unchanged.
- Designer bar: Working files, assigned board name, Live board and existing rounds/actions.
- Internal comments: This round; designer audience: You and the studio.
- Client comments retain This version; all named destinations/drafts/writes preserved.
- Agency/client Overview and the agency plus/designer grouping preserved.
- Executed gate: npm run check passes types, lint, format,129files/1278tests.
- Focused run:6files/85tests pass.
- Chromium:3real roles×4sizes,40geometry checks,19Axe scans,0page errors pass.
- Designer direct-panel link and Send-to-studio open/cancel checked; no record writes.
- Docs: projects README, design system, checkpoint and verification updated.
- Production workflow map reviewed; final labels match the other thread's documentation.
- [Verification and captures](../../verification/designer-context-2026-09-27.md).
- Limits: external Miro blocked in isolated checks; no external editing/sign-in verification.
- No schema/data/status/permission changes, push or deployment.
- Next: user reviews the local designer UI; workflow gaps remain in the production workflow map.
- Unrelated login.png deletion preserved.
