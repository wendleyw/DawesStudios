# Compact project header preview — 2026-09-27

Historical experiment record. The user subsequently approved this layout for all project pages
only. It is now the default without a query parameter; see the
[rollout verification](project-header-default-2026-09-27.md). The opt-in/removal instructions below
describe the earlier experiment, not current application behavior.

The user requested a reversible visual experiment: use the space between client navigation and
notifications for the project title alone, with the full Working files / Shared with client bar
immediately below, then requested the campaign above the title and a due-date badge beside it.
Enable it with `?layout=compact-header` on any authorized project route.
Remove that parameter to restore the default layout; no preference or project data is written.

The title is one semantic `h1`, with truncation and a full-title tooltip. The campaign comes from
the existing authorized campaign hook; the badge uses the viewer's existing due date. The bar
retains Back, board/round/version selection, channel, the agency's board due date, Open in Miro,
More and existing primary actions. The project due date is not duplicated in that lower bar.
Role checks and data access are unchanged. At work-area widths up to 1100 px the title takes its
own row; controls wrap within the viewport. A missing client header retains the existing title.

## Executed checks

- `npm run check` in `apps/web`: types, lint, formatting and 127 files / 1,249 unit tests passed.
- Chromium, local agency session, Retail Partner Introduction: 1600, 1280, 1024, 768, 390 and
  320 px. One `h1`, no document overflow, controls below the title; at desktop sizes the title
  sits between navigation and account. Axe: zero violations within `.project-chrome` at all six.
- At 1600 px, chrome height fell from 189 to 136 px, reclaiming 53 px for the work area.
- Round selection, channel switching, More / Escape focus return and Details opening passed.
- Repeated the web gate and six-width browser check after adding campaign/date metadata:
  1,249 tests pass; Fresh Start sits above the title, the badge sits beside it on desktop,
  the project due label occurs once in the chrome, and all six header Axe checks pass.
- The existing client browser session also rendered the preview with its client versions and
  no internal channel controls. Miro emitted third-party loading errors; this pass verifies the
  application header, not Miro authentication or external board availability.
- Final captures use the existing Editorial font preference to match the supplied reference:
  [desktop](screenshots/compact-project-header-2026-09-27-desktop.png),
  [mobile](screenshots/compact-project-header-2026-09-27-mobile.png).

## Review and removal

### Native-window follow-up

The user reported a clipped right edge and missing bottom tools after the interactive browser
check. That check had set the shared Chrome tab's viewport to 1600 × 1000, larger than the user's
window. A fresh preview tab was opened without viewport emulation (`page.viewportSize() === null`).
Its layout and visual viewport both measured 1512 × 696; document scroll width was exactly 1512.
The account card and project bar ended at x=1496, and the bottom tool bar ended at y=680: all four
measured control groups were fully inside the visible viewport. The preview and Miro rendered
in that native tab. No application CSS change was needed for this report.

Keep viewport matrices in isolated test browsers. Do not leave a fixed emulated viewport in a
shared user tab; use its natural size for the final interactive review. The current-session
capture is in ignored `outputs/compact-header-native-window.png`.

### Preview decision

The preview is local and opt-in, pending the user's visual decision; no push or deployment.
Working screenshots, measurements and the one-off browser check live in ignored `outputs/`.
Implementation is limited to project chrome, its shared header slot, and accompanying docs.
Remove the preview parameter for immediate comparison, or revert its isolated commit to remove
the experiment entirely. The live SABRE demonstration was not reseeded or modified.
