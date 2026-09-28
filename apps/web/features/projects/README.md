# Projects

The project page lives at `/projects/:projectId` and is the **Miro workspace** for every role and
channel: `ProjectPage` (`project-page.tsx`) renders `ProjectWorkspace` (`project-workspace.tsx`)
and nothing else. Working files are named **design boards**, one designer each, and Shared with
client holds **client versions** numbered per project. The Miro frame is the design; nothing is
uploaded onto a board or a client version. See the
[workspace design](../../../../docs/superpowers/specs/2026-09-26-miro-workspace-design.md) and
[the retirement of Versions](../../../../docs/superpowers/specs/2026-09-27-retire-versions-design.md).

The channel is not a browser filter: an agency session switches between Working files and Shared
with client, a designer session is always internal, and a client session is always the client
channel, with Supabase policies rather than the interface deciding what each one may read.

## Page and chrome

Every project uses the compact header for agency, designer and client sessions, including direct
links and notification destinations. No layout query parameter or saved preference is required;
old `?layout=compact-header` links still open the same page. This direction was approved for
**project pages only** on 2026-09-27. Other client sections keep their existing headers.

The client logo, navigation and signed-in profile use `workspace/canvas-header.tsx`. Its centre
card is `ProjectTitle` (`project-header.tsx`): campaign above the project title, with a small due-date
badge alongside. It reuses the authorized `useCampaigns` read; absent campaign data does not invent
a label. A designer's badge uses their board's internal deadline, bounded by the project's date;
agency and client badges use the project date. An unset deadline reads **No due date**. The title
still renders if client identity data is unavailable. At work-area widths of 1100 px or less, its
card moves below navigation; the title and date wrap within the card as needed.

`MiroWorkspaceBar` (`miro-workspace-bar.tsx`, built on `MiroBarShell`/`MiroBarMenu` in
`miro-view.tsx`) is one full-width wrapping controls bar below the title. It contains Back
(`ProjectBackLink`), the channel (`ProjectChannelLead`: agency **Working files / Shared with
client**, designer **Working files** without a switch, no channel label for clients), board/round/version controls,
the agency's board due date, the primary action, **Open in Miro** for the shown link (`miroBoardUrl`,
`target="_blank"`; the embed can fail to sign in behind third-party-cookie restrictions), and
**More**. The project due date appears only in the title card.

More holds the project's credits (`credits/project-credits-chip.tsx`; designers never see it)
and, once set by the agency, the Drive link of the channel on screen: **Open internal Drive folder**
or **Open client Drive folder** (`shared/drive-icon.tsx`, `target="_blank" rel="noopener noreferrer"`).
These are read from `project_drive_links` under RLS, so designers get only the internal link and
clients only the client link. Escape closes More and restores focus to its trigger.

`miroBarTone` tints the controls bar for agency and designer sessions: amber with a hatch for
Working files, blue for the agency's Shared with client view. A client's bar stays plain. The bar
wraps on narrow screens, preserving all authorized actions. See the
[design system](../../../../docs/architecture/design-system.md) and the
[default-header verification](../../../../docs/verification/project-header-default-2026-09-27.md).

In Working files the bar shows a compact board picker (only with more than one board; sized to the
chosen name up to 200 px), a **Board / R1 / R2…** round toggle once the board has rounds, and the
round's status. Designers also see the board name when only one is assigned, and their base toggle
reads **Live board** to distinguish it from submitted rounds. In Shared with client a **V1, V2…**
toggle shows the client versions and the selected version's status. A client
with nothing shared yet retains Back and More without version controls. The board's own designer gets **Send to studio**
(`project-action-round.tsx`, `kind: "round"`, an optional note and frame link through the
idempotent `send_board_round`); the agency gets **Share with client** on a round
(`project-action-share.tsx`, `kind: "share"`) and, in Shared with client, **+ New version** (accessible name **New client version**).
Delivered projects offer none of these three actions, matching the server's terminal-state checks;
delivery also dismisses an open round/share dialog. Existing boards, versions and feedback remain
readable. A round marked **Shared** no longer offers to share it again. Project details resolves
service names from the briefing catalog instead of showing codes.

The agency's Working files bar identifies the selected board's **Designer** in a compact badge,
with the name in bold, including when only one board exists. The **+** and badge stay together
when the bar wraps. Switching boards updates that name;
rounds retain their board's owner. `useDesignBoards` joins only `display_name` through the board's
designer foreign key under the existing board/profile RLS. Clients receive no board rows and
designers still receive only their own. The badge is absent from Shared with client and designer
controls. Long names truncate visually with the full name available in the title and accessible
text; a missing profile name reads **Name unavailable**, never a private identifier.
See the [designer-badge verification](../../../../docs/verification/board-designer-2026-09-27.md).

Sharing a round and adding a version prefill the client board link from `useLatestSharedMiroLink` (the newest project-level client
version's link, read for the agency alone, so it works from Working files too); an action opened
before that read finished reads the link itself and remounts its field when it arrives. The **+** icon
immediately before the designer badge (**Add design board** in its tooltip and accessible name) opens **Add design board** to link an existing
Miro board and select its designer; it does not create a new board on Miro. The agency's **More**
menu holds **Edit board**
(`project-action-board.tsx`, `kind: "board"`: name, Miro link, one assigned designer and an optional
**Board due date**) and, on a shown client version, **Edit Miro link** (`project-action-miro.tsx`,
`kind: "miro"`). An empty board or channel shows an inline call to action (**Add a design board** /
**New client version**) to the agency and a plain waiting message to everyone else.

The agency may edit a client version's link after sharing, approval or delivery. Its version
identity, number, note and review/comment history remain intact; changing the link does not create
a new version or reopen approval. A shared version cannot have an empty link. Clients and designers
cannot change that link. This was explicitly confirmed by the user on 2026-09-27.

The embed (`MiroEmbed`, `miro-view.tsx`) runs from the bar to the bottom edge; the iframe is rebuilt
from the stored `boardId`/`widgetId` via `miroEmbedUrl` with `autoplay=true`, never from the pasted
URL, and `frameKey` reloads it when the board, round or version changes. Miro's own top bar is
cropped off: `.miro-view-crop` shifts the frame up by `--miro-top-bar` (64 px, Miro's current
layout; re-check it if Miro changes its bar). The sidebar folds while a link is shown
(`useFoldSidebarWhile`). `frame-src https://miro.com` is the one Content-Security-Policy exception
this feature requires (`apps/web/next.config.ts`). A client whose shown client version awaits their
decision (`canReviewShared`: the latest shared version, pending, project not delivered) gets
`MiroReviewBar` at the bottom, with the tool bar tucked behind its top edge as one compact,
centred stack. The 6 px overlap covers padding only, preserving complete buttons and keyboard
focus rings. On phones both bars remain centred, with 44 px touch controls and less reserved
space below the embed. **Request changes** and **Approve** open `project-action-review.tsx`
with that decision preselected.

`miro-workspace.ts` holds the pure rules: `boardRounds` (a board's rounds with a link, newest
first), `sharedVersions` (the project-level client versions, which have no board), `pickById`,
`canReviewShared` and `latestSharedLink`.

## Tools and panels

`project-tool-bar.tsx` is the floating bar (group **Project actions**) centred at the bottom:
Project details, Comments and Playground. For designers with a linked briefing, the first action is
**Briefing**, with a document icon, opening the same details panel. Comments replaces the separate
Conversation and Feedback buttons. Its **All activity** view contains the channel's project notes
and version comments; **This round** filters to the internal round, and **This version** to the client
version on screen. The designer audience reads **You and the studio**. The composer explicitly names its
destination: **Posting to <project title>** for project notes, or **Posting to <project title>
[Version N]** for a client version. Internal rounds retain **[Round N · board name]** so equal round
numbers on different boards stay distinguishable. Each history entry shows its scope.
Every tool is a `ProjectToolButton`: a click sends a streak of light once around its SVG outline,
and an active tool keeps a faint outline with a small comet orbiting it. The effect is decoration in
`projects.css` and stops under reduced motion; `aria-expanded` still carries the state. The bar
opens with the studio's animated mark (`shared/brand-mark.tsx`). While a side panel is open the bar
re-centres beside it; on work areas narrower than 800 px it hides until the panel closes.

Comments and Details open one floating inspector (`project-panel.tsx`) beside the
embed, which narrows to leave room for it. The panel heading and comment composer stay in place;
only the history or detail body scrolls. Under 800 px of work-area width, the inspector opens over
the project header to leave enough room for reading and composing. Close/Escape restores the
original tool. `project-page.tsx` owns the open panel
(`usePanelFocusReturn`, `use-panel-focus-return.ts`) above its early returns, because the
`useProjectDetail(projectId, channel)` read goes pending and unmounts the workspace on every channel
switch. Close/Escape returns focus to the control that opened the panel; `useFocusReturn` also
returns focus to the Playground button after the closing render commits. Pointer activation
explicitly focuses its trigger so Safari can restore focus too. The panel stays open
across channel switches, while its view resets to All activity and loads the new channel's draft.
The round/version filter follows selection, remounting only the thread to isolate pending writes;
without a selected version the effective view and composer return to project scope. Filters remain
mounted so switching them preserves keyboard focus. Client review decisions remain separate actions.
The Playground button opens the full Playground when nothing is on Miro yet, or
`PlaygroundAssetStrip` over the embed once a link is shown (see
[the Miro mode strip](../playground/README.md#miro-mode-strip)). The Playground and the side panels
do not stack. A file dropped anywhere on the page is swallowed, so the browser never navigates away.

`comment-panel.tsx` carries the two comment channels: `useProjectComments` reads
`internal_comments` or `client_comments`, the whole project's comments or one version's
comments (`versionId`), and labels internal authors as the signed-in person or "Studio team",
never a designer's identity. `comment-draft.ts` keeps an unsent comment and its retry attempt per viewer, project,
channel and version, so a retry after a remount replays the same idempotency key
(`nextCommentAttempt`) and switching versions cannot mix unsent comments. Successful writes clear only the submitted
body/attempt still present in that draft, preserving follow-up text entered while a request is pending.
`CanvasComment.versionId` retains the round/publication scope for labels; channel-specific queries
and RLS still govern what the viewer receives. These comments live in this application, not Miro.

Details (`project-details.tsx`) opens on **Overview** for agency and client sessions: notes and
metadata, a Resources section, cover and version history. Designers with a linked briefing open
on **Briefing**; **Project info** holds the secondary metadata, resources and round history. Their
sidebar never mounts the cover, including in Project info. Without a linked briefing, designers
open project information directly through **Project details**. Agency assignment, credit and Drive actions are grouped under
**Manage project**. When a briefing exists, **Briefing** opens its saved scope and attachments
inside the same inspector; **View full briefing** retains the dedicated page. `project-briefing.tsx`
reuses `useBriefings` (including the designer's assigned-briefing RPC), `useCampaigns`,
`BriefingSummary` in compact mode and read-only `BriefingAttachments`. It handles loading,
unavailable data and retry without requesting attachments for an unavailable briefing.
Details composes the existing edit, assignment and resource actions. Its project edit
retains the revision captured when the form opens. The Drive link control and mutation live in
`project-details-drive-link.tsx`; the credit move and settlement dialogs, including their per-dialog
retry keys and shortfall handling, live in `project-details-credits.tsx`. For the studio and the
client it also shows **Requested by** (`useBriefingRequester`) and a version history naming
who decided; designers see neither. Editing the project is a compare-and-set write on the
`updated_at` the form opened on; a lost race raises "changed while you were editing".

**Credits.** Details shows the studio and the client **Credits: N · <Month>**, the project's charge
in its credit month (`projects.credit_month`), and, once settled, **Settled** ("3 more charged to
September 2026", "2 refunded to …" or "No change") with the **Reason** the client reads. Designers
see none of it, and `useProjectCredits` does not query for them. The charge is read the way
`settle_project_credits` reads it (`projectCreditCharge`): debits and refunds in the credit month
plus any final adjustment. The agency also gets:

- **Move to another month** (while unsettled and charged): a dialog listing the other open months
  with their available credits (`useCreditMonthSummaries` from `credits/credit-data.ts`) that
  says where the credits go and blocks a month that cannot take them. When the project's month has
  already ended its credits expired, so the dialog explains they are not returned and requires
  **Charge the full N credits to <Month>** before `move_project_month` runs with
  `p_charge_full`. One idempotency key per dialog (`move:<project>:<attempt>`); switching the
  target after an ambiguous response cannot silently move the project twice.
- **Settle final credits** (approved or delivered, once): the final total and a required reason,
  with a preview of the extra charge (current month) or refund (always the current month). When the
  current month is short, `settle_project_credits` raises `insufficient_month_credits`;
  `settleProjectCredits` turns its detail into a `MonthShortfallError`, and the dialog names the
  shortfall and adds a **Charge month** select for a retry with the same key.

Both writes refresh `credit-account`, `credit-ledger` and the project's keys through
`useInvalidateProjectCredits`.

**Cover.** Agency/client Details includes a Cover block after Resources (`project-cover.tsx`):
one sanitized PNG per project,
set by the agency and optionally shown to the client. `useProjectCover` reads
`public.project_covers` and signs the path from the private `project-covers` bucket (300-second
URLs, renewed every 240 seconds), keyed under `project-detail` so every project write refreshes it.
It leans on that table's RLS rather than branching on role: a client with no readable row resolves
to `null` and the block renders nothing. The agency alone gets Set/Replace (PNG/JPEG/WebP), the
**Visible to the client** switch and Remove (with a confirm dialog). The designer sidebar does not
render this block; covers on project cards and existing cover read permissions are unchanged. `prepareProjectCover`/`clearProjectCover` (`media-client.ts`) call
`apps/media`'s `POST /covers/prepare`/`POST /covers/clear`; a Replace sends the row's current
visibility forward, and toggling it goes through `set_project_cover_visibility`
(`setProjectCoverVisibility`).

**Drive links.** Nothing from design/internal may reach the client and nothing client-side may
reach the designer, so a project keeps two separate Drive links in `project_drive_links`, one per
channel, rather than the one link every role once shared. Details shows the agency two controls
(`DriveLinkControl`, `project-details-drive-link.tsx`), each an Add/Edit button and dialog:
**Internal Drive link** ("Visible to the studio and the assigned designer") and **Client Drive link** ("Visible to
the studio and the client"). A client or designer never sees either control. The dialog validates
with `drive-link.ts`'s `parseDriveUrl` (`https://drive.google.com/...` only, blank clears it) before
calling `setProjectDriveLink`/`set_project_drive_link(p_project_id, p_channel, p_url)` — the
database repeats the same host check and is the authority. The link is only a link; nothing syncs
with Google Drive. Each channel's link also shows as an icon link in the Miro bar's More menu
(above), scoped to the channel on screen, and the client link alone shows beside the project's file
group in [Files](../assets/README.md). Details waits for the link read before offering Add/Edit and
shows a retry action if that read fails, so an unavailable link is not mistaken for an unset one.

**Board due dates.** A board's internal due date (`design_boards.due_date`) lets the agency ask its
designer to deliver before the date the client sees. `create_design_board`/`update_design_board`
reject one after the project's own due date (the dialog checks first; the field's `max` is the
project's date). The designer works to `designerDueDate` (`workspace-data.ts`), the earlier of the
two, in the bar, in Details and in every project list; the agency sees **Board due …** on the
controls bar.

## Data access

`version-row.ts` colocates the project version display helpers and grouping key used by project data and canonical browser checks.

`project-data.ts` owns every Supabase read and write for the feature, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires.
`useProjectDetail` reads the project, its deliverables, its versions on the viewer's channel
(`design_versions` or `published_versions`, with `publication_reviews` and the channel's Miro links)
and returns `{ project, deliverables, versions, reviews }`; `toCanvasVersions` maps both tables to
one `CanvasVersion` shape. `useDesignBoards` reads the boards the viewer may see (RLS limits a
designer to their own) and polls every 30 s, so a board reassigned away from a designer drops out of
their workspace without a reload; a **Send to studio** already in flight then shows "This board is
no longer assigned to you." and refreshes the boards. `useProjectAssignments` feeds Details and the
board dialog. `projectQueryKeys` lists the keys every project write invalidates, including
`project-drive-links`; `useInvalidateComments` refreshes only `comments`.

`useProjectDriveLinks(projectId)` reads both channels' rows from `project_drive_links` at once
(`{ internal, client }`) rather than one query per channel; RLS, not this hook, is what keeps a
designer to `internal` and a client to `client` — a missing row resolves to `null` rather than a
role check here. `setProjectDriveLink(database, { projectId, channel, url })` calls
`set_project_drive_link(p_project_id, p_channel, p_url)`, agency only; `projects.drive_url` no
longer exists (dropped in favor of this table), so `useProjectDetail`'s `select("*")` project row,
`workspace-data.ts`'s `Project` type and `assets/asset-data.ts`'s explicit column list all carry no
Drive column anymore. A `client`-channel save in `project-details.tsx` also calls
`assets/asset-data.ts`'s `useInvalidateAssets()` alongside `useInvalidateProject()`: Files
(`assets-page.tsx`) shows the same icon beside a project's file group from its own `assets` query
(client channel only), and that call is non-widening because `assets-page.tsx`'s own writes already
invalidate the same key (rule 5, [data-access.md](../../../../docs/architecture/data-access.md)). An
`internal`-channel save skips that call, since Files never reads the internal link.

Miro links are kept per channel in their own tables under their own RLS:
`publication_miro_links` (client) and `design_version_miro_links` (internal). `readMiroLinks` takes
the channel explicitly, so the client board and the internal board never mix. Only the agency
writes either table, through `set_publication_miro_link` / `set_version_miro_link` /
`clear_publication_miro_link` / `clear_version_miro_link` (`setMiroLink` / `clearMiroLink`); the
RPCs parse and validate the URL, and `miro-links.ts`'s `parseMiroBoardUrl` only lets a dialog refuse
an obviously bad link first. A shared client version is nothing but its link, so its field is
required and clearing it is refused by the dialog and the database. The workspace writes are
`createDesignBoard`, `updateDesignBoard`, `sendBoardRound`, `shareMiroVersion` and
`reviewPublication`; comments go through `postComment` / `resolveComment`. Credits are read by
`useProjectCredits` (the ledger rows and the settlement, whose granted columns it names:
`settled_by` and the idempotency key are not selectable) and written by `moveProjectMonth` and
`settleProjectCredits`.

The author columns (`created_by` on `design_versions`, `updated_by` on `design_version_miro_links`)
are not selectable by any API role, so `useProjectDetail` names its columns
(`internalVersionColumns`); a `select("*")` there is refused. No board name, round or client version
ever names a designer to anyone but the agency and that designer; designer privacy is enforced by
RLS, described in [the backend contract](../../../../docs/architecture/backend.md).
`project-events.ts` subscribes to the Postgres changes each role may see (comments, versions,
reviews and design boards) and polls while the socket is down.

`ProjectActionDialog` (`project-action-dialog.tsx`) is a dispatcher with one component per
`ProjectAction` kind (`board`, `round`, `share`, `miro`, `review`); `project-action-shell.tsx` holds
the shared `Modal` shell, error paragraph and Cancel/submit footer, and the `useProjectActionClose`
(closing is refused while a save is pending) and `useCloseOnSuccess` hooks.

`media-client.ts` talks to the media service for covers and delivery files. Its legacy publication
and video helpers have no caller left and are removed with their media routes in the next phase.

Feature styles are local to `projects.css`; shared controls, shell and modal styling stay in
`app/globals.css`.

## Verification

Unit suites: `npx vitest run features/projects` from `apps/web` (dispatcher, workspace, bar,
channel lead, comment draft and attempt, data-access argument shapes, Miro rules, cover and
`useProjectCover`). They use stubbed Supabase clients and prove argument shape, not authorization.
Role isolation and end-to-end flows are proved by the orchestrator's database and browser suites in
[the acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).

`npx playwright test tests/e2e/miro-workspace.spec.ts` verifies the workspace round trip on a
disposable SABRE acceptance project: the agency adds a design board for designer A beside designer
B's, designer A sends round 1, the agency shares it, the client requests changes, the agency adds V2
directly and the client approves. The agency then uploads a final file through the media flow and
completes delivery. The client cannot read the staged file before delivery, and afterward downloads
bytes matching the stored final. Reloads verify the delivered state and absence of repeated
delivery, review and designer-send controls. A second test proves, through designer B's own session,
that designer B receives only their own board and none of designer A's rounds, comments or name.
The [2026-09-27 action audit](../../../../docs/verification/extension-role-actions-2026-09-27.md)
records current browser coverage and the confirmed agency link-editing rule. The round-trip test
edits V2's link after delivery, verifies both agency/client reloads and unchanged version/review
rows, and checks that client/designer RPC writes are denied.

The Cover block's browser pass is recorded in
[the verification record](../../../../docs/verification/project-cover-2026-09-27.md).

### Action notification links

Notifications can open a project with `channel`, `board`, `round`, `version`, and `panel` hints.
The page resets its local selection when the URL changes, including another notification for the
same project. It resolves identifiers only against authorized query results; a client remains on
the client channel and a designer on Working files regardless of URL hints. `panel` accepts only
`details` or `comments`. An unavailable target falls back to the current authorized workspace.
