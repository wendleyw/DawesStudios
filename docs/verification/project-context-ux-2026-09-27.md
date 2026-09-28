# Project context UX — 2026-09-27

## Implemented

- Comment composers name the project: **Posting to Retail Partner Introduction**, or
  **Posting to Retail Partner Introduction [Version 2]**. Internal scope retains the round and
  board name. Channel isolation, draft keys and write destinations are unchanged.
- Project details groups overview, resources, cover and history; agency management is collapsed.
  Its **Briefing** tab reads the existing authorized scope and attachments inside the inspector.
  The full briefing page remains accessible. The standalone editor and budget flow are unchanged.
- Side panels align headings and spacing. History/details scroll inside the panel, with composer
  and Close visible. Below 800 px of work-area width, the project chrome becomes hidden and
  unfocusable while the panel occupies the available height; Close/Escape returns to its tool.
- Playground album chips and Open full Playground share a heading row. Images use the full row
  below. Copy shows a centered, pointer-transparent instruction to paste into Miro, with no image
  preview or focus capture. Success dismisses after six seconds or Close; failures offer Download.
  Attempt identifiers reject stale completions, including repeated clicks on the same image.
- The full Playground inspector keeps its heading/Close visible while its form scrolls.

## Executed checks

- Web gate: types, lint, formatting and **129 files / 1,269 unit tests** pass. New cases cover the
  inline briefing's scope/loading/retry/unavailable states, copy focus/message dismissal and
  stale repeated-copy results. Existing draft, role/action and Playground recovery suites pass.
- Following the final mobile CSS adjustment: Prettier and **81 CSS boundary/theme tests** pass.
- Isolated Chromium sessions: agency/client SABRE Retail Partner Introduction; designer's
  authorized Acme / Blog Design / Infographic. Overview, Briefing and Comments pass at 1512×696,
  1440×600, 390×844 and 320×740: **36 panel geometry checks**, no document overflow, visible Close
  and composer, role-appropriate controls. Briefing direction stays one readable column.
- Desktop/mobile for all three roles: full-width image row, **six real image/png clipboard
  writes**, centered message without a duplicate image, Close and focus return. **30 scoped Axe
  scans** across side panels, strips and copy messages report zero violations.
- A denied Clipboard API offered a real file download. Full Playground's item editor Close works
  after scrolling at desktop/mobile sizes. A temporary unsaved note was discarded through the UI.
- Light/Editorial and dark/Geist captures inspected; dark-mode success message auto-dismissed.
- No project, comment, billing or file content was saved. Standard Playground access may ensure
  its private board via the existing RPC. External Miro requests were blocked in isolated checks:
  actual pasting or access to the external board is not claimed. The screenshot's access-denied
  state belongs to Miro sharing, and this UI task does not change it.

## Final captures

- [Overview, desktop](screenshots/project-context-2026-09-27-overview-desktop.png)
- [Briefing, desktop](screenshots/project-context-2026-09-27-briefing-desktop.png)
- [Comments, mobile](screenshots/project-context-2026-09-27-comments-mobile.png)
- [Copy instruction, desktop](screenshots/project-context-2026-09-27-copy-desktop.png)
- [Copy instruction, mobile](screenshots/project-context-2026-09-27-copy-mobile.png)
- [Playground inspector, mobile](screenshots/project-context-2026-09-27-playground-inspector-mobile.png)

Working captures and scripts remain in ignored `outputs/`. No push or deployment.
