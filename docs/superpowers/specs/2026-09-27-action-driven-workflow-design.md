# Action-driven project workflow

Status: implemented locally on 2026-09-28. Baseline: `cb9f767` (private production briefs).
[Verification and remaining release evidence](../../verification/action-driven-workflow-2026-09-28.md).
The user requested this plan after reviewing the button flow, independent designer directions and
Backlog. [Implementation plan](../plans/2026-09-27-action-driven-workflow.md).
The [production workflow map](../../architecture/production-workflow.md) describes current code;
this document preserves the accepted behavior and engineering decisions.

## Accepted product decisions

1. Agency acceptance creates the project directly in **In progress**, with the existing single,
   atomic credit debit. Briefing submission remains free.
2. Clients never receive internal board states or see **Studio review**. Internal production and
   review appear as **In progress**, unless a later public review/approval already governs the project.
3. V1/V2/V3 are review iterations of the same project, not additional deliverables or credit debits.
   Internal R1/R2 numbering is independent and belongs to each board.
4. Every workflow action has an explicit, contextual button using the client's bottom review-bar
   pattern. Opening a form, changing tabs, editing in Miro and saving a draft do not advance state.
5. Do not add **Mark ready** or **Ready for client**. *(Amended 2026-09-28 by user decision: the studio now records **Approve round** on a submitted round before **Share with client**, and client feedback is sent back to designers from Working files. See [production-workflow.md](../../architecture/production-workflow.md).)*
6. Boards have independent instructions, designers and work obligations. One designer's action
   cannot overwrite another board's state or a pending client review.
7. The agency curates instructions before sending revisions. Designers receive only released
   directions for their own boards, never the original client request or raw client feedback.
8. A handoff can continue one direction and explicitly end another using **Continue working** and
   **No further work needed**. An omitted board is unchanged. Preserve history and allow reactivation.
9. **Project activity: Active / Backlog** belongs in **Edit project details**, agency-only, and is
   separate from workflow status. Pause/resume preserves stages, versions, credits and dates.
10. Agency publication alone creates a client version. Miro composition/copying remains manual;
    final files are released separately through **Complete delivery**.

## State boundaries

| Record or projection | Meaning | Source of truth |
| --- | --- | --- |
| Project phase | In progress, In review, Changes requested, Approved, Delivered | `projects.status`; public lifecycle only |
| Project activity | Active or Backlog | Separate persisted project activity; never another phase |
| Board activity | Active or Closed | Separate board activity; Closed means no further work on this direction |
| Board work | Awaiting instructions, In progress, Changes requested, Studio review, Shared | Current board work request and its submitted/shared round |
| Client decision | Pending, changes requested or approved for a particular V number | Existing `publication_reviews`; older decisions remain historical |

Retain legacy enum values until a deliberate compatibility migration can remove them. Stop writing
`internal_review` to projects, reconcile existing rows, and enforce that internal review can only be
represented in internal records. A display-only label replacement is insufficient: direct REST,
nested reads, RPCs, Realtime payloads, filters and counts must respect the public state boundary.
`planned` is not the starting state of an accepted briefing; investigate standalone legacy projects
before changing their records. Public status choices never include **Studio review**.

### Recommended persistence contract

- Add project activity and board activity with server-owned transitions. Use expected workflow
  revisions to reject stale actions; retain the current `updated_at` guard for metadata editors.
- Introduce board work requests, colocated with production briefs in the database domain. Each
  request records a board, recipient/assignment generation, sequence, kind (initial/revision/reactivation),
  released instruction revision/snapshot, and outcome (`open`, `submitted`, `shared`, `closed`). A submission references
  its request and round. Requests, unlike the current released brief, preserve prior instructions.
- Enforce one current request per board. The request is the authority for the current obligation;
  board labels, Home, Reviews and action notifications derive from it. Do not also store a competing
  mutable board-phase enum or infer a designer's task from `projects.status`.
- Existing `design_versions` remain round history. Their legacy submitted/reviewed fields must be
  maintained transactionally where required by surviving consumers, then removed from current-task
  decisions. Do not treat **Shared** as client approval.
- Preserve `production_brief_drafts` and `production_briefs`. A release and its work request are
  created/updated in the same transaction. Saving a draft creates neither a work request nor an event.
  Updating an open request's instructions creates a new immutable revision and supersedes the prior
  request explicitly; it never silently changes what a designer's already-open submission refers to.
- Keep the association between client feedback and internal handoffs private. A persisted handoff
  receipt identifies the reviewed publication and board decisions; designer-readable requests must
  not expose client comments, requester identity, other designers or private publication metadata.
- Evolve private publication sources to associate one client version with multiple included rounds.
  Preserve existing source rows. A retained round may be referenced by a later client version without
  closing a newer work request or changing its old history. Only explicitly included current
  submitted requests are completed as Shared; all other boards remain unchanged.

## Contextual action bars

Reuse the existing bottom review-bar visual pattern: named current context on the left, contextual
actions on the right. Move primary send/share actions out of the Miro header rather than duplicate
them. The header retains board/version navigation, designer identification and secondary editing.
There is one action bar per visible workspace, not a second bar over the existing client controls.

| Actor and surface | Context | Visible actions | Confirmation effect |
| --- | --- | --- | --- |
| Agency, briefing | Submitted / budget confirmed | Confirm budget; then Accept & create project | Existing quote flow; acceptance creates In progress project/debit once |
| Agency, Working files | Board missing | Add design board | Opens/saves board setup; no publication or production release |
| Agency, Working files | Instructions not released | Send to designer | Opens production editor; confirmed send releases instructions and opens work |
| Designer, own Working files | Current work request open | Send to studio | Confirms note/frame and creates the next board round for that request |
| Agency, Working files | Current round in Studio review | Request changes / Share with client | Opens curated revision instructions or the client-publication preparation |
| Agency, Shared with client | New presentation | Share with client / Share new version | Confirms client board/frame and note; creates the next V number |
| Client, latest pending version | In review | Request changes / Approve | Existing review dialog; Send review commits the decision |
| Agency, Shared with client | Latest version requested changes | Send to designers / Share new version | Curated multi-board handoff, or publication when agency has prepared the update |
| Agency, Shared with client | Latest version approved | Prepare delivery | Navigates to Files; does not mark delivery |
| Agency, Files | Approved project and final files | Delivery file / Complete delivery | Upload prepares files; confirmed completion releases them |
| Any authorized viewer | Waiting on another role | Waiting message and unavailable advance controls | No fabricated action or status transition |
| Any authorized viewer | Backlog | Project in backlog and disabled advance controls | Agency resumes only through Edit project details |
| Assigned designer | Closed board | No further work needed and retained history | No send action; other own active boards remain actionable |

**Share with client** from Working files opens the same publication preparation used by Shared with
client, preselecting the source round. It does not publish automatically or use the internal Miro
link as a client default. Confirming **Share with client** is the single publishing command.
There is no approval/ready transition between internal review and publication. Selecting multiple
source rounds is attribution and task completion, not an additional approval stage. The agency
chooses the material in the presentation; unrelated active boards do not automatically block it.

The publication form retains the instruction to copy/compose the work in the client Miro board
first, and requires its link. The application does not claim to freeze external Miro content or
verify Miro access permissions. Editing an existing version's link retains the accepted behavior:
same version and decision, no automatic new version, and no implicit reopening of approval.

All buttons follow the same interaction contract: show current context, collect required data,
confirm once, keep input on failure, disable duplicate submission, then refresh authorized state.
Reviewing an old version or round does not enable actions that belong to the current obligation.

## Transition and notification contract

All notifications in this scope are in-app. Activity is historical; Needs your action is derived
from current obligations. Preserve existing recipient/access rules and actor exclusion.

| Confirmed action | Internal effect | Public effect | Next obligation / event |
| --- | --- | --- | --- |
| Accept & create project | None yet | Create In progress | Agency prepares production; eligible clients receive project-start event |
| Initial Send to designer | Released request becomes open/In progress | Preserve In progress | Target designer produces; one release event per recipient |
| Send to studio | Current request becomes submitted/Studio review | No public phase change | Agency reviews that round; submitting designer waits |
| Internal Request changes → Send to designer | Supersede reviewed request; open revision request/Changes requested | No public phase change | Only selected designer receives revision task/event |
| Share with client | Included submitted requests become Shared | Latest V becomes pending; project In review | Eligible clients review; one publication event per recipient |
| Client Request changes → Send review | No automatic designer reassignment or instruction release | V and project Changes requested | Agency receives Respond to feedback and event |
| Agency feedback handoff → Send to designer(s) | Open selected revision requests; explicitly close chosen boards; persist handoff receipt | Changes requested → In progress, only for that still-current feedback | Selected designers adjust; closed directions receive closure event; agency handoff obligation clears |
| Client Approve → Send review | Preserve board/request history | V and project Approved | Agency prepares delivery; approval event |
| Complete delivery | End project-level advance actions | Delivered; release final files | Client receives delivery event and can download |
| Save project activity as Backlog | Suspend all project obligations without closing them | Show Backlog over preserved public phase | Notify authorized participants once; suppress active action counts |
| Save project activity as Active | Resume obligations from current authorization and preserved state | Show preserved public phase | Notify authorized participants once; current tasks return |
| Explicitly close a board | Close its current work request and suppress its review/production obligations | No public phase change | Its designer receives No further work needed; agency retains history |
| Reactivate a board | Reopen activity, then require a fresh instruction release | No public phase change | Agency prepares/sends; no resurrection of obsolete tasks or decisions |

Publishing a new version is also valid when the agency handles the changes itself. It resolves the
old feedback obligation by superseding that publication, without forcing a designer handoff. A
version awaiting review or already approved requires an explicit replacement confirmation before
publishing another; atomically validate both the expected latest publication ID and its decision/
review revision. If a client decision changes while that confirmation is open, reject publication,
preserve the draft and require a fresh confirmation against the new state. Internal work alone never supersedes
review/approval. Delivery requires approval of the latest publication, not an older approved V.

### Two designers and choosing one direction

The handoff form identifies each board and its responsible designer. For each included board the
agency chooses **Continue working** (with its own instructions) or **No further work needed**.
Boards omitted from the request are unchanged; closing cannot be the default for unselected rows.
The confirmation names who receives instructions and which boards will close. All selected changes
commit atomically; an invalid/reassigned/stale board rolls back the complete handoff and all events.

A send requires at least one continued board receiving valid instructions. Empty and close-only
handoffs cannot clear the client-feedback obligation or set In progress. Standalone board closure
uses its explicit agency command without resolving feedback. If the agency handles the update
itself, publication of the next V resolves the old feedback obligation without any designer event.

Continuing A and closing B creates A's revision obligation, closes B's pending work/review, and
notifies each only of their own outcome. B keeps authorized access to its existing history, without
Send to studio. Closing a direction neither removes the person from Team nor changes other boards.
The application blocks workflow submissions; it cannot revoke external Miro permissions by itself.
Clients see the project phase only, without designer identity or selection decisions.

Reassignment is also atomic: close the outgoing designer's current request with a reassignment
reason, bind future work to the new assignment generation, and require a fresh agency release.
The new assignee does not automatically inherit old tasks or released instructions. Retained request
snapshots and rounds from earlier assignments stay agency-readable; designers read only records
released to their current assignment generation. The agency may explicitly include previous work
as references in the new instructions. The outgoing designer loses access to that reassigned board,
while any other authorized boards are unaffected. Direct REST, RPC and Realtime must enforce this
history boundary, including legacy rounds whose original recipient needs backfill reconciliation.

### Backlog

Agency-only **Project activity: Active / Backlog** lives in the existing edit form and is committed
with **Save details**. Saving metadata plus activity is one guarded operation. Delivered projects
cannot enter Backlog. Keep Backlog discoverable through an activity filter; default active work
queues/counts exclude it without deleting history or silently claiming tasks completed.

Pause blocks server-side production release, submission, revision/closure/reactivation handoffs,
publication, client decisions and final delivery. Viewing history, comments, already released files,
metadata edits and private drafts remain available. Pause does not freeze live Miro edits. Existing
activity events/read state remain intact. Resume re-evaluates tasks and membership; it does not
replay earlier send events. No automatic deadline movement, credit refund or credit-month change.
Existing explicit agency billing adjustments remain separate from workflow advancement.

## Authorization, concurrency and compatibility

- Every mutation rechecks active membership, project/board access, activity, latest request/version
  and expected revision on the server. UI capability flags are presentation, not authorization.
- Establish one lock order across touched RPCs before implementing the batch operation: request
  idempotency key, project, boards in stable UUID order, then request/round/review rows. Audit existing
  board-first routines, including production-brief release and submission, for deadlocks.
- Reusing a request key with the same normalized payload returns the committed result without new
  events. Changed payload with that key fails. Authorization must be rechecked even on replay.
  A same-result replay after pause may return its prior receipt; it cannot perform new work.
- New request IDs/revisions prevent a designer's stale submission from satisfying a newer brief.
  Serial project/review guards resolve pause-vs-send, close-vs-submit, handoff-vs-reassignment,
  publication-vs-client-decision and publication-vs-delivery without partial effects.
- Extend the existing released-content RLS boundary. Clients receive no internal requests, board
  closure details, source maps or workflow capability rows for internal boards. Designers receive
  only their current authorized boards/releases and no private feedback source references.
- Preserve `visible_projects()` description masking, original briefing/attachment denial, narrow
  column grants, delivery-file release guards and private comment/draft channels.
- Old RPC signatures and direct column writes cannot bypass new checks. Either adapt compatible
  endpoints to the guarded command or revoke obsolete ones after callers are migrated. SQL grants,
  PostgREST nested reads and Realtime payloads are part of the security tests.

## Migration and existing data

User priority update, 2026-09-27: existing clients are disposable test data and will be deleted and
rebuilt later. Prioritize fresh, complete functional journeys. Limit legacy reconciliation to what
the forward schema requires; do not build compatibility layers or reconstruct ambiguous historical
requests solely to preserve demo states. No client deletion or database reset is authorized now.
The historical-inventory guidance below is secondary to this update; role isolation, billing
invariants, non-destructive migration and self-contained acceptance tests remain required.

Use forward migrations after the currently applied `202609280002`, applied with
`supabase migration up --local`. Do not edit applied migrations,
reset stacks, destroy fixtures or alter canonical assertions. Inventory phase/review/round conflicts
before writing backfill SQL; preserve the report and reconcile ambiguous rows explicitly.

Set new activity fields Active by default. New acceptance explicitly writes In progress. Normalize
existing accepted Planned projects, and derive the correct public phase for legacy internal-review
projects from their latest publication/decision, preserving Delivered and valid approval. Never
blindly set every legacy internal-review project to In progress when a pending V exists.

Create compatibility request records from actual released instructions/rounds where available.
Do not invent instructions, copy original client scope, fabricate a past handoff, or send backfill
notifications. A submitted legacy round may have a request without historical instruction content;
label that provenance internally. A board without instructions or a historical round waits for the
agency. Legacy client changes without a recorded handoff remain the agency's responsibility.
Retain IDs, numbering, comments, ledger entries and all source associations. Snapshot counts and
integrity before/after; preserve live 10 clients / 68 projects / 50 SABRE and canonical 10 / 25.

Roll out in this order: expand with additive storage/contracts; adapt readers, RPC callers and forms;
then enforce/reconcile with one coordinated forward cutover. Introduce no restrictive guard while
the current application still depends on the superseded call. At enforcement, update or revoke all
old entry points and add final constraints in the same migration sequence. Refresh schema/types
and run direct old/new-endpoint probes before calling the cutover complete. Cached stale forms
receive a recoverable conflict, never an unguarded compatibility path. This is local integration;
production deployment remains outside the authorization for this task.

## Completion evidence

Implementation is complete only when one- and two-designer paths persist across reloads, every
button's positive/negative cases pass at the server, Home and notifications agree with the action
bar, client isolation is verified through direct API/Realtime tests, and desktop/mobile/keyboard
checks pass. The [implementation plan](../plans/2026-09-27-action-driven-workflow.md) defines the
work packages and acceptance cases. This planning document is not evidence of working runtime
transitions, external Miro configuration, workflow email delivery or production readiness.
