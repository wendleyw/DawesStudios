# Unified project comments — 2026-09-27

Status: implemented and locally verified. No deployment or database migration.

## Result

The project toolbar now has one **Comments** tool instead of Conversation and Feedback.
Both previous tools read the same channel's comments; Feedback filtered them by round/version.
The replacement exposes that distinction inside one panel:

- **All activity** shows project and round/version comments in the current channel. New messages
  here belong to the project.
- **This version** appears when a round or client version is on screen and reads/writes only that
  scope. It follows the selected version; returning to the board uses project scope.
- The composer names its destination. History labels distinguish Project, Version N, and
  Round N with the board name.
- Drafts and retry keys remain separate by viewer, project, channel and round/version. Switching
  channels keeps the panel open, resets All activity and loads only that channel's draft.
- A delayed success clears only the submitted body/attempt; a different follow-up draft survives.
  Editing back to identical trimmed submitted text is treated as the same draft.
- Formal review notes, Approve and Request changes remain separate. Backend comment permissions
  are unchanged. These are application comments; there is no Miro-native comment synchronization.

## Checks executed

- Full source gate: type generation/TypeScript, ESLint, Prettier and **126 Vitest files / 1,224
  tests passed**. Final selector edits also passed typecheck, targeted lint and format:check.
- Production web/media container images built successfully and ran healthy in filesystem staging.
- **16 relevant Chromium cases passed**: 15 in the combined run, followed by the corrected design
  audit case. Coverage includes scoped comment persistence, exact publication/round IDs, drafts,
  agency/client/designer isolation, version switching, resolution controls, Miro review and final
  delivery, workspace actions and canonical navigation.
- Canonical navigation: **10 clients / 25 projects, 13 authenticated actors, 79 project visits**,
  with no captured page errors. Canonical count assertions were preserved.
- Design audit: **42 surfaces at widths 390, 768, 1000, 1024 and 1600**, no document overflow or
  axe violations in application UI. Independent client-panel captures at 1600×1000 and 390×844
  also passed; the mobile posting destination, textarea and Send action are reachable by scrolling.
- Visual inspection covered toolbar duplication, selected scope, history labels, posting destination,
  desktop spacing and mobile scrolling. Close/Escape and focus return passed browser checks.
- Canonical HTTP verifier passed all role scopes, credit reconciliation and **110 real downloads**.
- Final live SQL: **10 clients / 68 projects / 50 SABRE; zero Acceptance projects**. The authorized
  demo overlay remains intact. Staging retains its existing 10/25 dataset.

Initial local browser execution had three canonical-count failures because the live SABRE overlay
contains 50 SABRE projects, plus a Comments heading selector that also matched “No comments yet.”
The selector now uses an exact name; canonical tests ran against isolated 10/25 staging. The first
staging design audit expected an obsolete help sentence; its expectation was updated and rerun.
These failed attempts are not counted as passing evidence.

The in-app browser runtime listed no available browser. Verification used ordinary Playwright
Chromium. A standalone capture script initially used the wrong browser context constructor and
was corrected. Final axe checks exclude the external Miro iframe, matching the project audit;
external board content and real Miro account permissions are not verified by this evidence.

## Final screenshots

- [One Comments tool](unified-comments-2026-09-27/toolbar.png).
- [All activity and project destination](unified-comments-2026-09-27/desktop-all.png).
- [Selected version and version destination](unified-comments-2026-09-27/desktop-version.png).
- [Mobile version filter](unified-comments-2026-09-27/mobile-version.png).
- [Mobile composer after scrolling](unified-comments-2026-09-27/mobile-composer.png).

The large work area uses fixture Miro links; these captures verify application controls, not the
external board rendering. Working logs and extra audit captures remain ignored under `outputs/`.

Delegated reports: [browser tests](../engineering/handoffs/2026-09-27-unified-comments-browser.md)
and [independent review](../engineering/handoffs/2026-09-27-unified-comments-review.md).
Outstanding production work remains in the
[preproduction record](preproduction-hardening-2026-09-27.md#remaining-release-work).
