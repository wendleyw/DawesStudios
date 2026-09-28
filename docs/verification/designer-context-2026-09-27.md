# Designer project context — 2026-09-27

The designer workspace now puts the creative brief before secondary project information.
The change applies to project pages, using the existing shared components and authorized reads.

- The first tool is **Briefing** with a document icon when a briefing is linked. It opens that tab
  directly, including `?panel=details` links. **Project info** holds resources and metadata.
  Projects without a briefing keep **Project details** and their information view.
- The designer inspector never mounts `ProjectCover`, on either tab. Project-card covers and
  cover permissions are unchanged; agency/client keep Overview and their existing cover controls.
- The designer bar reads **Working files**, shows the assigned board name even for one board,
  and uses **Live board** beside submitted rounds. The agency's icon-only plus remains before
  the designer badge. Send/share/review actions and Miro links are unchanged.
- Internal comments use **This round**; client comments retain **This version**. The designer
  audience is **You and the studio**. Posting destinations still name project and round/board;
  independent drafts and idempotent writes are preserved.

## Executed verification

- `cd apps/web && npm run check`: types, ESLint, Prettier and **129 files / 1,278 tests** pass.
  Focused component run: **6 files / 85 tests** pass, including designer default/fallback,
  cover non-mount on both tabs, agency/client overview preservation and internal round posting.
- Isolated Chromium with real designer Jordan, agency and client logins, on Retail Partner
  Introduction: **1512×696, 1024×768, 390×844, 320×740**. All **40 geometry checks** and
  **19 scoped Axe scans** pass; zero page errors. Headers, close controls, composer and bar
  remain in the viewport without document overflow. Close/Escape returns focus to the tool.
- Designer direct-panel link opens Briefing; own board name and round controls are visible;
  agency controls, credits and project cover are absent. Send-to-studio dialog opened/cancelled.
  Agency/client briefing and comment scopes also checked. No application records were written.
- Initial harness assumptions about the visible toolbar count on phones and the submission
  dialog title were corrected before the successful run. The final full gate includes the
  corrected required toolbar children in its unit-test fixture.
- Relative documentation targets, checkpoint/report line limits and `git diff --check` pass.
- Working logs, script and geometry JSON: `outputs/designer-context-*` (ignored).
  External Miro requests were blocked in isolated checks; Miro sign-in, editing and posting were
  not tested. No schema, authorization, workflow status or data mutation changes. No deployment.

## Inspected final captures

- [Desktop briefing](screenshots/designer-context-2026-09-27-briefing-desktop.png)
- [Desktop round comments](screenshots/designer-context-2026-09-27-comments-desktop.png)
- [Mobile briefing](screenshots/designer-context-2026-09-27-briefing-mobile.png)
- [Mobile board bar](screenshots/designer-context-2026-09-27-bar-mobile.png)
