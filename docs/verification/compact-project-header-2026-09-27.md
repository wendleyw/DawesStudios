# Compact project header preview — 2026-09-27

The user requested a reversible visual experiment: use the space between client navigation and
notifications for the project title alone, with the full Working files / Shared with client bar
immediately below. Enable it with `?layout=compact-header` on any authorized project route.
Remove that parameter to restore the default layout; no preference or project data is written.

The title is one semantic `h1`, with truncation and a full-title tooltip. The bar retains Back,
board/round/version selection, channel, dates, Open in Miro, More and existing primary actions.
Role checks and data access are unchanged. At work-area widths up to 1100 px the title takes its
own row; controls wrap within the viewport. A missing client header retains the existing title.

## Executed checks

- `npm run check` in `apps/web`: types, lint, formatting and 127 files / 1,249 unit tests passed.
- Chromium, local agency session, Retail Partner Introduction: 1600, 1280, 1024, 768, 390 and
  320 px. One `h1`, no document overflow, controls below the title; at desktop sizes the title
  sits between navigation and account. Axe: zero violations within `.project-chrome` at all six.
- At 1600 px, chrome height fell from 189 to 136 px, reclaiming 53 px for the work area.
- Round selection, channel switching, More / Escape focus return and Details opening passed.
- The existing client browser session also rendered the preview with its client versions and
  no internal channel controls. Miro emitted third-party loading errors; this pass verifies the
  application header, not Miro authentication or external board availability.
- Final captures use the existing Editorial font preference to match the supplied reference:
  [desktop](screenshots/compact-project-header-2026-09-27-desktop.png),
  [mobile](screenshots/compact-project-header-2026-09-27-mobile.png).

## Review and removal

The preview is local and opt-in, pending the user's visual decision; no push or deployment.
Working screenshots, measurements and the one-off browser check live in ignored `outputs/`.
Implementation is limited to project chrome, its shared header slot, and accompanying docs.
Remove the preview parameter for immediate comparison, or revert its isolated commit to remove
the experiment entirely. The live SABRE demonstration was not reseeded or modified.
