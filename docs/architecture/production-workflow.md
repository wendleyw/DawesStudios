# Production collaboration

The action-driven Miro workflow is implemented locally. The [design](../superpowers/specs/2026-09-27-action-driven-workflow-design.md)
and [plan](../superpowers/plans/2026-09-27-action-driven-workflow.md) record the accepted decisions.
Supabase owns permissions, workflow state, credits, comments and final files. Miro holds the
creative work; copying/composing a presentation into the client board remains manual.

## Public phases and internal work

Acceptance creates one **In progress** project and one credit debit atomically. Public phases are
**In progress → In review → Changes requested → In progress**, followed by another review cycle,
then **Approved → Delivered**. Historical Planned is retained for compatibility; new accepted
projects do not start there. **Studio review** belongs only to internal board work. A designer's
submission never overwrites a pending client review, changes request or approval.

Each board has one current, assignment-scoped work request. Its outcomes are `open`, `submitted`,
`shared`, or `closed`. R1/R2 are internal board rounds; V1/V2/V3 are client iterations of the same
project, never extra deliverables or credit debits. Agency sharing can cite multiple source rounds;
the private source association is never returned to a client or designer.

**Active / Backlog** is a separate activity setting in **Edit project details**. Backlog keeps the
phase, dates, credit charge and all versions, suppresses pending actions, and blocks advancement
in the backend. Resume restores eligible work without repeating activity notifications. Delivered
projects cannot enter Backlog. Board views default to Active and offer Backlog and All projects.
The action bar reads "Project in backlog": the agency sees where work resumes (Edit project
details); clients and designers see "Paused by the studio".

## Actions from briefing to delivery

| Actor and location | Button | Result and next obligation |
| --- | --- | --- |
| Client/agency, Briefings | Send briefing | Free submission; agency gets Review briefing. |
| Agency, briefing | Confirm budget | Confirms scope; agency gets Start project. |
| Agency, briefing | Accept & create project | In progress, one project/debit; agency prepares boards. |
| Agency, project details | Assign a designer / Add board | Registers the internal Miro link and board owner; does not release instructions. |
| Agency, Working files | Send to designer | Opens the production brief editor; explicit send releases private instructions and creates the designer's task. Save draft stays private. |
| Designer, own Working files | Send to studio | Consumes the current open request once, creates R1/R2, and notifies agency for Studio review. |
| Agency, submitted board (live view) | Review R1/R2 | Opens the submitted round, where the studio review actions below appear. |
| Agency, submitted round | Request changes | Releases new internal instructions to the selected board; a new designer task replaces the submitted one. |
| Agency, submitted round | Approve round | Records the studio's approval (`approve_board_round`, request outcome `approved`), tells the designer, and asks the studio to share it (**Share with client** action). The public phase is unchanged. |
| Agency, approved round (round or live view) | Share with client / Share R2 with client | Opens publication preparation. Confirmation records the client Miro link/note as V1/V2 and notifies eligible clients. Request changes stays available. |
| Client, latest pending V | Request changes / Approve | Required feedback for changes; records one decision and notifies agency. |
| Agency, client feedback, Working files | Send to designer(s) | The board reads "Client requested changes". Chooses continuing boards and explicit closures, reviews the handoff, then commits all decisions atomically. Public phase returns to In progress. In Shared with client the bar only offers **Continue in Working files**. |
| Agency, ⋯ menu | Share a version directly | For changes the studio makes itself, without a designer round. The database also accepts a still-submitted round cited here, marking it shared. |
| Agency, approved V | Prepare delivery | Opens the project's Files page. |
| Agency, Files | Delivery file / Complete delivery | Uploads real final bytes, then completes delivery only with the latest V approved and at least one final file. |

There is one contextual action bar, centered over the bottom of the Miro board, with no duplicate
send/share in the Miro header and no Mark ready or Ready for client. A board reads Waiting for
production instructions → Designer working → Studio review → Approved by the studio → Waiting for the
client → Approved by the client / Client requested changes. Shared with client shows status only
(and Prepare delivery once approved); while a version waits for the client there is no primary
button. A
disabled/waiting state explains whether work awaits the studio, fresh instructions, a resumed
project or a reactivated board. Its state never contradicts the project status: once the agency
sends a client's changes to the designers it reads "The studio is working on your changes" for the
client and "Changes sent to designers" for the agency, and a delivered project reads "Delivered".

The credit month can be the current month or any of the next 11. Insufficient balance prevents
acceptance. Budget acceptance belongs to the agency; the client does not receive a billing action.

## Two designers, revisions and reassignment

The agency writes separate instructions for each board. **Continue working** creates fresh work;
**No further work needed** closes that direction, removes its task/submission control and retains
its authorized history. An omitted board stays unchanged. A feedback handoff must contain at
least one continuing board with valid instructions; empty or close-only sends cannot clear the
agency's feedback obligation. A standalone closure is available separately.

The agency can also handle feedback itself and publish the next client version without a designer
handoff. Original client feedback stays in the client channel. Designers see only released studio
instructions, their own current-assignment boards/rounds, and authorized internal comments.

Reactivation keeps history and requires a fresh release before submission. Reassignment closes
outgoing work, increments the assignment generation and clears current production drafts/releases.
The agency retains prior requests/history; the new designer does not inherit old-generation rounds
or instructions. A removed or outgoing designer loses access to the reassigned board.

## Versions, concurrency and files

Publication confirmation captures the expected latest version ID and review revision when opened.
If a client decides or another agency member publishes meanwhile, the stale confirmation fails
without overwriting that decision. Explicit confirmation is required to replace pending/approved
versions. Retries with the same action key and payload create no duplicate request, round, version
or activity; changed payloads cannot reuse the key.

Business conflicts return `PT409` (HTTP 409). Do not use `40001` for stale forms: the local
PostgREST 14 transaction runner retries serialization failures automatically. Real concurrent HTTP
tests cover this boundary in addition to SQL assertions.

Only agency can share. A client can decide only the latest pending V. Internal submission after
approval leaves the public approval intact; sharing a replacement V starts a new client review.
Delivery checks that latest review under the project lock; repeating completed delivery is safe.
Final file upload alone does not release the delivery. Clients access released files in Files.

Agency **More → Edit Miro link** remains available after publication, approval and delivery. It
changes the link without changing the version, comments or decision. Miro content is live; the
application's immutable version metadata is not a frozen copy of external board content.

## Comments and notifications

**Comments → All activity / This round / This version** is discussion, separate from workflow
buttons. Resolving a comment does not approve a version or finish a task. Internal/client messages
and drafts stay separate. Internal round comments target that board's designer; agency project
comments target assigned designers. Client messages notify agency; studio replies reach eligible
clients and prior active client conversation authors.

The bell has **Needs your action** (current, state-derived tasks) and **Activity** (persisted,
read/unread events). Marking activity read cannot resolve work. Current requests drive designer
Home, internal Reviews and the action feed; no surface infers designer work from public status.
See [action notifications](action-notifications.md) for predicates and recipient rules.

Workflow notifications are in-app. Resend is selected for Supabase Auth SMTP invitations and
password recovery; configuring it does not add workflow email dispatch. External Miro access,
SMTP/DNS/TLS, recovery and hosted CI remain separate release gates.
