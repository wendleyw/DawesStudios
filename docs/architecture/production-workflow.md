# Production collaboration

The approved target is recorded in the [action-driven workflow design](../superpowers/specs/2026-09-27-action-driven-workflow-design.md)
and its [implementation plan](../superpowers/plans/2026-09-27-action-driven-workflow.md). That work
is planned: contextual action bars, public In progress on acceptance, independent board revision
tasks/closure and project Backlog are not implemented by the current workflow described below.

This describes the implemented Miro workflow as inspected on 2026-09-27 EDT. It is a code/schema
map, not a new claim that every journey was rerun. The application has one studio and isolated
client workspaces. Supabase owns authorization, workflow state, comments, credits and files.
Miro holds the creative work; the application records board/frame links, numbered rounds and
client versions. Canvas, List, Timeline, Kanban and Calendar are views of the same authorized
projects; moving a card does not change workflow status.

## Roles and entry points

| Role | Scope | Main entry points |
| --- | --- | --- |
| Agency | Studio clients, budgets, assignments, internal review, sharing and delivery | Home, each client's Briefings/Board/Reviews, Team, Credits, project details and Files |
| Designer | Assigned projects, own design boards, studio production instructions/brand direction and internal comments | Home, assigned projects, Working files, Reviews and Files |
| Client | Own client workspaces, briefing submission, shared versions, client comments and released delivery files | Overview, Briefings, Board, Reviews, Brand Hub/Files and Credits |

Agency uses **Team → Invite someone → Send invitation**; the client's People dialog also has
**Invite person**. The recipient confirms the email and uses **Accept invitation**, setting a
password when required. A client invitation is bound to its selected workspace. Merely creating
an Auth identity does not grant designer or client membership. See the
[Team feature](../../apps/web/features/team/README.md) and [email runbook](../operations/email.md).

## Main funnel: actions, state and notifications

“Activity” below means a persisted in-app event. “Action” means a current **Needs your action**
item, not an email or a workflow button. Its link opens the screen containing the actual action.

| Step | Who acts, where, and exact controls | Result | Notification or next action |
| --- | --- | --- | --- |
| Draft | Client or agency: Briefings → **New briefing** → Service → **Continue to details** → Details → **Review briefing**. **Save draft** remains available. | Saved briefing draft with explicit campaign, scope and requested outputs; no credit debit. | No review event until submission. |
| Submit | Client or agency: Review → **Send briefing**. | `draft → awaiting_review`; submission is free. | Agency activity **Briefing ready for review** and action **Review briefing**. |
| Quote | Agency: briefing detail → Project budget → **Confirm budget**. | `awaiting_review → budget_confirmed`; no project or debit yet. | Agency action becomes **Start project**. No separate budget-confirmed activity event. Client sees **Scope confirmed** and waits for the studio. |
| Start project | Agency: choose **Credit month**, then **Accept & create project**. | One atomic, idempotent project creation, deliverable creation and credit debit. Briefing becomes `accepted`; new project starts `planned`. | Eligible client activity **Your project is ready**; agency action **Prepare project**. |
| Assign and prepare | Agency: project **Project details → Manage project → Assign a designer**; then Working files → **Add a design board** (empty state) or **+** (**Add design board**), and **Add board** in the dialog. | Designer gains project access; board stores its name, Miro link, one designer and optional internal due date. The + registers an existing Miro board/link; it does not create a board in Miro. | Assignment sends designer activity **New project assignment**. Board creation gives its designer action **Submit round**; it has no separate creation activity event. Agency preparation action clears after a board or client publication exists. |
| Prepare production | Agency: Working files → **Project details → Production → Prepare production brief**. Edit or copy/rewrite the client scope; use **Save draft** or **Send to designer**. | Drafts stay agency-only; sending releases per-board instructions, quantities, references and internal deadline. Client request/credits stay unchanged. No project or round status transition. | Sending creates one designer activity **Production brief updated**. Unsent edits remain private. |
| Produce and submit | Designer: work in the Miro embed or **Open in Miro**; use **Send to studio**, optionally adding a note and frame link. | Creates numbered board round R1/R2/etc with `submitted` status; project becomes `internal_review` (**Studio review**). | Agency activity **Design ready for studio review** and action **Review round**. Nothing is published to the client. |
| Studio review | Agency: open the round in Working files. Use internal **Comments → Send message** for direction, or **Share with client** to publish it. | An internal comment is discussion, not a rejection transition. Sharing requires the agency to copy work into the client board in Miro and provide that board/frame link plus a note. | Studio internal comments notify the relevant designer(s); sharing follows the next step. There is currently no explicit return-to-designer action. |
| Client publication | Agency: **Share with client**, or **Shared with client → New version** (**New client version** in the empty state) to add a client version directly. | Creates V1/V2/etc for the whole project; project becomes `client_review` (**In review**). A linked source round becomes `reviewed` (**Shared**). | Eligible client activity **New designs ready for review** and action **Review version**. |
| Client decision | Client: open the latest pending version, use **Approve** or **Request changes**, then **Send review**. Changes require feedback. | Project becomes `approved` or `changes_requested`. Previous versions retain their decisions; a conflicting second decision is refused. | Agency activity **Client approved a design** / **Client requested changes**; action **Deliver project** / **Respond to feedback**. |
| Revision loop | Agency relays client feedback through internal Comments; designer updates their board and uses **Send to studio** again; agency shares the new round or uses **New version**. | New round and then new client version; client decides again. | Internal comment → designer activity; new round → agency activity/action; new version → client activity/action. See the current designer-action gap below. |
| Final delivery | Agency: **Brand Hub → Files**, select the approved project, **Delivery file**, then **Complete delivery**. | At least one real delivery file and approved project required. Delivery sets `delivered`; client file reads/downloads become available. | Eligible client activity **Your project has been delivered**. Agency delivery action clears. Client uses each file's **Download** icon. |

The credit month can be the current month or one of the next 11. Insufficient balance blocks
acceptance; another eligible month or an explicit allocation is needed. The client does not have
an **Accept budget** button: confirmation and acceptance belong to the agency in the current
implementation. A briefing already accepted links to its project rather than reopening scope.

Delivered projects refuse new round submission, new client versions and review decisions. Agency
can still correct a shared version's Miro link through **More → Edit Miro link**; this retains the
version, its review and comments and does not itself create a new version. Miro content is live:
a numbered application version is not a frozen snapshot of everything inside that external board.

## Persistent controls and supporting flows

- **Board / R1 / R2** selects the live working board or an internal round; the designer label is
  **Live board**. **V1 / V2** selects client versions. These controls navigate; they do not approve,
  submit or change status.
- **Project details** contains Overview/Briefing, timing, files and version history. Agency alone
  sees **Manage project**, assignment/removal, credit adjustments and internal/client Drive links;
  its header **Edit project details** action saves through **Save details**. The designer toolbar
  opens **Briefing** with only released studio instructions, with **Project info** as the other tab;
  it omits the original request, contracted quantities and cover. Agency can inspect the original
  **Client brief** separately. Production drafts and releases are scoped to the selected board.
- **Comments** replaces the older separate conversation/feedback controls. **All activity** and
  **This round** (internal) or **This version** (client) choose context; **Send message** posts,
  **Resolve** and **Reopen** track a comment.
  Resolving a comment neither approves a version nor completes a workflow action. Internal and
  client channels, including unsent drafts, remain separate.
- Agency internal project comments notify assigned designers; a round comment targets that board's
  designer. Designer internal comments notify agency. Client comments notify agency; agency client
  comments notify eligible client recipients and prior active client conversation authors.
- **More → Edit board** edits a board's name, Miro link, assigned designer and internal deadline.
  The deadline cannot exceed the project's date. Agency sees the selected board's designer name
  beside the + control. A designer never receives another designer's board.
- **Files → Working file** is available to agency and assigned designers for supporting source
  files; it is separate from the Miro creative workflow. Only agency adds a **Delivery file**.
  Uploading a final file alone does not release it to the client; **Complete delivery** does.
- **Credits → Request credits** lets a client request an allocation and notifies agency; its
  **Review credit request** action opens Credits. Agency uses **Review → Allocate credits** or
  **Decline request** with a reason. The client receives **Credits added to your workspace** or
  **Credit request updated**. This is a separate request, not a budget acceptance or payment flow.
- Agency project details offers **Move to another month** for unsettled charged work and
  **Settle final credits** once approved/delivered. Settlement notifies the client with
  **Final credits settled**; designers never receive billing data.

## Notification rules

The bell and `/notifications` combine two independent sections:

| Section | Meaning | Behavior |
| --- | --- | --- |
| **Needs your action** | Something the current role can act on now | Re-evaluated from authorized workflow state; 15-second poll and refresh on opening. Disappears when its condition is resolved/replaced or access is lost. Cannot be dismissed as read. |
| **Activity** | An event already occurred | Persists per recipient with read/unread state; 30-second poll. **Mark all read** or the per-event check only marks activity read. |

Agency actions: **Review briefing**, **Start project**, **Prepare project**, **Review round**,
**Respond to feedback**, **Deliver project**, **Review credit request**. Designer action:
**Submit round**. Client action: **Review version**. Details and exact conditions are maintained in
[action notifications](action-notifications.md).

Agency activity reaches active agency members except the actor. Client project notifications
reach the active briefing requester plus active client members who enabled **notify all**; if
there is no active requester, they reach all active client members. Client-wide credit-request
updates reach all active client members. Studio replies also reach prior active client authors in
that project's conversation. Notification routing does not narrow an otherwise authorized client's
ability to review. Removed accounts and people without the required scope cannot access the work.

Workflow events are currently **in-app only**. Resend SMTP is prepared for Supabase Auth invitations
and password recovery, and external delivery is still unconfigured. Configuring that SMTP alone
will not send round, review, comment or delivery notifications by email. Editing content in Miro
also does not automatically submit or publish it in this application.

## Verified gaps for the next refactor

1. **Revision handoff is incomplete.** Client changes create an agency response action, but no
   designer notification or revision action. Designer Home derives **Your turn** from a shared
   round plus the project's changes-requested status, while the bell's **Submit round** accepts
   only no round or a latest draft. Those two surfaces therefore disagree. There is no explicit
   agency return-to-designer transition; internal comments are the existing relay.
2. **Production start is not recorded.** New Miro projects begin **Planned**; assignment and board
   creation do not set **In progress**. The old function that did this was removed, so the current
   UI normally advances directly to **Studio review** on first submission. An explicit start rule
   or a simpler vocabulary is needed before presenting every enum as an active funnel stage.
3. **Briefing rejection/cancellation is absent.** The current statuses and actions cover draft,
   submission, quote confirmation and acceptance, without a decline/cancel path.
4. **Reminder and delivery channels need a deliberate policy.** The existing notification model
   is activity plus state-derived actions, without workflow email dispatch. The resolved/read
   rules must stay separate when adding any reminder or external delivery mechanism.

## Sources and verification scope

Primary implementation references: [briefing detail](../../apps/web/features/briefings/briefing-detail.tsx),
[Miro controls](../../apps/web/features/projects/miro-workspace-bar.tsx),
[project details](../../apps/web/features/projects/project-details.tsx),
[Files](../../apps/web/features/assets/assets-page.tsx),
[notification feed](../../apps/web/features/workspace/notification-feed.tsx), and the latest
[action view](../../supabase/migrations/202609270020_action_board_labels.sql).
The [intake map](../engineering/handoffs/2026-09-28-funnel-intake-map.md) and
[notification map](../engineering/handoffs/2026-09-28-funnel-notifications-map.md) record the bounded
read-only audit. Relevant current browser suites are `miro-workspace.spec.ts`,
`client-invitations.spec.ts`, `designer-invitation.spec.ts` and `action-notifications.spec.ts` under
`apps/web/tests/e2e`. Their presence is not a claim they ran during this documentation task.
