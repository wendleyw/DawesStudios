# Playwright extension and role-action audit

Date: 2026-09-27. Owner: Codex. Scope: the user's requested Chrome extension setup and a fresh
agency/designer/client action pass. This record separates executable browser checks, interactive
extension checks, source findings and remaining acceptance gaps. It does not approve production.

## Connection and practical result

The personal Playwright MCP server was already configured with Chrome extension mode. This
conversation did not expose its tools natively, so a temporary standard MCP SDK stdio client
started the configured server with its existing personal token. No token was committed.
The first attachment timed out and the user saw `Failed to connect to MCP relay: WebSocket error`.
A fresh connection succeeded; tab navigation, snapshots and real UI actions then worked through
`@playwright/mcp` 0.0.82 in the user's Chrome. The initial error's underlying cause was not proven.

The extension adds interactive access to the actual Chrome session and visible UI feedback.
Keep the existing CLI suite for reproducibility, isolation, upload/download verification and
regressions. The audit found two concrete bridge limits:

- Native file upload failed with `DOM.setFileInputFiles: Not allowed`, also reported
  [upstream](https://github.com/microsoft/playwright-mcp/issues/1481). Standard Playwright uploaded
  the same fixture successfully through the application's UI and media worker.
- Clicking the client's released final-file download did not produce an MCP Playwright download
  event within 30 seconds. A separate standard Playwright client downloaded it successfully and
  compared all 18,693 bytes with authenticated Storage reads. SHA-256:
  `48c8f3110ce8322e4c61a5bcedebd8e1e238e499e3245cb13c90589b39991749`.

These bridge failures are recorded, not counted as successful MCP file operations. The normal
browser tests cover those actions. See the [browser guide](../engineering/browser-testing.md)
for connection recovery, dataset boundaries and separate artifact directories.

## Action coverage by role

The following maps action families to tests actually run in this pass. Tests include authorized
writes and role refusals where stated; this is not a claim that every possible input, browser,
external service or permutation was exercised. Spec paths are under `apps/web/tests/e2e/`.

| Action family | Agency | Designer | Client | Executed browser evidence |
|---|---|---|---|---|
| Sign-in, account name/password, sign-out and old-password rejection | Own account | Own account | Own account | `settings-actions`; `intake-admin` recovery/invitation flows |
| Navigation, account links, theme, fonts, help, notifications | Studio/client routes | Assigned routes; restricted admin | Own workspace; restricted admin | `workspace`, `client-navigation`, `overview`, `theme`, `notifications-popover`, extension |
| Client, studio and service settings; logo; campaigns | Create/edit settings; upload/remove logo | Administrative writes denied | Settings UI denied; cross-client campaign write denied | `intake-admin`, `settings-actions` |
| Studio team and client people | Invite/change role/remove/revoke | Scoped access | Membership/notification choices; invite acceptance | `team-management`, `client-team`, `client-invitations` |
| Briefings, campaign choice, submission, quote and acceptance | Intake and budget workflow | Restricted intake | Own briefing and review of budget | `briefing-modal`, `intake-admin` |
| Monthly credits, requests, allocations and project settlement | Plans/adjustments/fulfillment/month moves/final settlement | No billing data or controls | Scoped balances/requests | `monthly-credits`, `project-credits` |
| Boards, views, filters, periods, search and project opening | Client/workspace controls | Assigned projects | Own projects | `board-views`, `canonical-workspaces`, `workspace-actions`, `sabre-demo` |
| Project title/notes/dates, assignments and stale edits | Edit/reassign/revoke | Allowed assigned data; denied admin writes | Client-safe details; denied admin writes | `workspace-actions`, `project-feedback` |
| Miro boards/rounds/version sharing | Create/edit board, share R1, create V2 | Own board and send round; other designer isolated | Shared version only; request changes and approve | `miro-workspace`, `miro-version-links`, extension |
| Internal/client conversation, feedback and drafts | Both channels | Own internal channel | Client channel only | `project-feedback`, `workspace-actions`, `miro-workspace`, extension |
| Project Drive links and covers | Set/remove scoped links and cover visibility | Internal link/cover scope | Client link and released covers only | `project-drive-link`, `project-cover`, extension |
| Working files, project/status filters and downloads | Upload/read working files | Assigned working-file upload/read | Denied internal rows and storage | New `files-actions`; `files-campaigns` |
| Final upload, completion and download | Real media upload; complete once | Send absent after delivery | Staged file hidden; released bytes download; no repeat review | Expanded `miro-workspace`; extension completion plus standard Playwright upload/download |
| Brand guidance, products, folders, links, assets, exports and private templates | Authorized edits/uploads/organization | Scoped reads/private work | Brand reads/downloads/private drafts; canonical edits denied | `brand-guidance`, `brand-folders`, `brand-accessibility`, `brand-canvas-final`, `client-pages-layout` |
| Playground and competitor widget | Board items; add/edit/remove competitor/widget | Private brainstorms; competitor reads | Private brainstorms; competitor hidden | `playground`, expanded `competitor-ads` |
| Responsive layout, accessibility, errors and security headers | Agency samples | Designer samples | Client samples | `design-audit`, `system-tour`, `console-errors`, `content-security-policy` |

Campaign Settings has create/edit controls and no delete action. The source inventory's apparent
campaign-delete gap therefore is not a failed existing UI action. Own-workspace campaign RLS
currently permits client membership writes; the new negative test correctly targets a different
client's campaign. The broader source inventory is a search aid, not execution evidence.

## Interactive extension journey

One disposable SABRE project was assigned to both designers. Through Chrome UI actions:

1. Agency created separate A/B boards, rejected an invalid Drive URL, saved both Drive channels,
   and edited B's name, link and internal deadline. Reloads confirmed persistence.
2. Designer A saw only A's board/internal link, posted an internal conversation and sent R1.
   Designer B saw B's board with no A round or private conversation.
3. Agency shared R1 as V1; the Shared badge appeared and the repeated share action disappeared.
4. Client saw only client content/link/Drive, posted a conversation and requested changes.
   Agency published V2 with a different board link; V1 retained its original link.
5. Client approved V2. After a standard Playwright upload, agency completed delivery through MCP.
   Database verification read `delivered`, two versions and one final file, with zero client
   internal boards and zero designer-B reads of A's rounds. Normal Playwright verified final bytes.

The test tab was signed out and closed; unrelated Chrome tabs remained untouched. Guarded fixture
cleanup removed the temporary project, files and associated records without a reset.

## Changes and visual verification

- Corrected Help & support: it still described the retired design/comment-pin flow. It now points
  to Conversation, version/round Feedback and Miro. The sitemap's unsaved-state wording is aligned.
- Added five settings cases: real name/password change for each role, logo persistence/removal,
  and campaign editing with cross-client denial.
- Added a working-file lifecycle case with actual bytes, reloads, project/status filters and
  client row/storage denial. Expanded competitor edits and project title/notes persistence.
- Extended the Miro journey through real final upload, staged-file denial, delivery, client
  download bytes and terminal-state control checks. Agency edits the published V2 link after
  delivery; both roles reload it, existing version/review rows stay intact, and client/designer
  link writes are denied by the backend.

The source gate and regression suite passed after integration. The Help modal was inspected
visually through the extension at 1600×1000 and 390×844: readable text, consistent spacing,
reachable close/Done controls and no horizontal overflow. Final captures:
[desktop](screenshots/extension-2026-09-27/help-desktop.png),
[mobile](screenshots/extension-2026-09-27/help-mobile.png).

The explicitly enabled system tour visited 57 agency, 45 designer and 45 client surfaces: **147**
in total, across desktop/mobile. It recorded zero global overflow, uncaught page exceptions or
serious/critical axe violations. All 40 failed requests were external Miro requests; placeholder
boards do not prove real Miro content loads. A screen tour is not counted as durable mutation proof.

## Executed checks and corrections

| Check | Result |
|---|---|
| Final `npm run check` in `apps/web` | PASS: type generation/check, ESLint, Prettier, 124 Vitest files / 1,206 tests |
| Distinct Chromium browser cases | 113 have passing executions across the runs/reruns below; not one clean full invocation |
| Canonical database suite | PASS: 26 pgTAP files / 1,052 assertions |
| Canonical seed after browser runs | PASS: exact 10 clients / 25 projects; credit reconciliation, role scopes, 110 real downloads |
| Final SABRE authenticated HTTP checks | PASS: 42/42 |
| Final live state after cleanup | 10 clients / 68 projects / 50 SABRE; zero Acceptance clients/projects/users and orphan Drive links |

The original 107 browser cases were rerun: 100 against the live overlay (including three explicit
system tours) and seven against canonical staging. Six new cases bring the distinct total to 113.
Failures were investigated and rerun rather than omitted:

- Concurrent runs against different databases accidentally shared Playwright's default artifact
  directory. This caused trace `ENOENT` failures in two overlay cases and one canonical case.
  Separate output directories and focused reruns passed. The guide now documents this requirement.
- New project-Notes and account-alert assertions initially selected ambiguous/unintended elements;
  they now use dialog/form scope and accessible textbox roles. The canonical workspace suite
  passed 3/3, and the final account/settings suite passed 5/5 for all roles.
- A focused navigation/competitor/files/settings run passed 10/11 before that account selector fix.
  The expanded Miro delivery/privacy run separately passed 2/2. After the user's link-editing
  clarification, the strengthened journey passed 2/2 again with the same two cases.
- An intermediate source gate caught Help-copy formatting; it was corrected before the final pass.
- Background Chrome tab actionability stalled one board edit; foregrounding the test tab resolved
  it, and a subsequent read confirmed saved board/deadline values.

Working logs are intentionally ignored under `outputs/extension-audit-2026-09-27/`: the JSON
reporters, `settings-all-roles.log`, `delivery-regression.log`, `canonical-pgtap.log`,
`final-source-gate.log`, seed reports, `sabre-http-final.log`, `final-local-counts.log`,
`fixture-verification.json`, `final-download.json`, `link-edit-regression.log` and the redacted MCP record. Tour reports are
under `outputs/system-tour/`. Portable conclusions and final screenshots are committed here.

## Confirmed contract and limits

The audit found that broad "immutable client version" wording conflicted with the existing agency
link editor and `set_publication_miro_link`. The user explicitly confirmed on 2026-09-27 that the
agency should be able to edit the link after sharing. The resulting rule preserves the version's
identity, number and note while allowing agency link edits, including after approval or delivery,
without creating a new version or resetting review/comment history. Current backend behavior
already supports this; the strengthened browser regression verifies it. Current migrations refuse
removing a client version's required link. AGENTS.md and CLAUDE.md were synchronized, along with
the backend, permissions, design-system and project guides. No migration was necessary. A live
Miro board's content is external and remains mutable independently of its stored URL.

No migration/reset/rollback, push or deployment occurred in this task. The local SABRE overlay and
its protected ignored rollback checkpoint remain. Canonical staging used the existing application
image for functionally unchanged routes; the Help copy was verified on the local updated app.
Staging was stopped afterward with containers and volumes retained. Firefox/WebKit, native
Codex exposure of MCP tools, real external Miro contents and production operational acceptance
(J10, TLS, SMTP, persistent Storage/restore and proxy rate limiting) remain outside this pass.
