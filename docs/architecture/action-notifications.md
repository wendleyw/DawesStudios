# Action notifications

Current predicates follow the [action-driven workflow](production-workflow.md).

`public.action_notifications` is an authenticated, read-only view of work that can be acted on
now. It has no table, scheduler, acknowledgement flag, or retry state. `public.notifications`
continues to hold historical events and `read_at`; reading an event does not clear an action.
The view runs with `security_invoker` and `security_barrier`, so its source table grants and RLS
policies apply to every caller. Anonymous users have no view grant.

Each row has `id` (a stable `kind:entity_uuid` text key), `kind` (text), `client_id` (UUID),
`project_id` (nullable UUID), `entity_id` (UUID), `board_id` (nullable UUID), `subject` (text), and
`created_at` (timestamptz). A query can sort by `created_at` and `id`; the view itself promises no
order. The identity is stable while that particular action remains pending. A replacement round or
publication gets its own identity, and the old one disappears. Internal board actions include
the board name in their subject so two boards on one project are distinguishable; only the
agency and authorized designer receive those labels.

| Kind | Actor | Current condition | Entity |
| --- | --- | --- | --- |
| `review_briefing` | Agency | Awaiting review, with no project | Briefing |
| `start_project` | Agency | Budget confirmed, with no project | Briefing |
| `review_credit_request` | Agency | Pending credit request | Credit request |
| `prepare_project` | Agency | Project not delivered, with no design board or client publication | Project |
| `prepare_board` | Agency | Active board has no current request and has an active assigned designer | Board |
| `review_round` | Agency | Active board has a current submitted request | Round |
| `respond_feedback` | Agency | Latest client publication has changes requested and no recorded agency handoff | Publication |
| `deliver_project` | Agency | Latest client publication is approved and project status is approved | Publication |
| `submit_round` | Assigned designer | Own active board has an open initial request in the current assignment generation | Board |
| `revise_board` | Assigned designer | Own active board has an open revision/reactivation request in the current assignment generation | Board |
| `review_version` | Client | Latest client publication awaits review; project not delivered; recipient rule below | Publication |

All project actions require Active activity and a non-delivered project. Closed directions and
requests from earlier assignment generations are excluded. Backlog/resume does not create new
historical events. A client decision alone creates no designer task.

`private.can_receive_project_action(project_id)` applies the same recipient rule as
`private.notify_client` for client project notifications. The active briefing requester receives
the action, as do active members with `notify_all`. If that requester is absent or no longer an
active client member, every active member of that client receives it. The helper accepts only a
project ID and returns whether the current actor is eligible; it never returns the requester or
another member's identity. It is callable only by authenticated users and is used alongside the
view's invoker RLS. A removed actor, a former assignee, another designer, and another client's
member receive no corresponding action. The studio retains its submitted-round review action
even after the submitting designer leaves, since the studio can still share that work. Clients receive no billing acceptance action.

Consumers should treat an action as a link to the current workflow, then query again after a
state change. Publishing a newer client version, submitting a newer board round, reassigning or
removing a designer, approving feedback, and delivering a project can remove or replace rows
without touching notification history. This view does not authorize a write: existing RPC and
RLS guards remain the authority for every action.

The web feed polls pending work every 15 seconds and rechecks on opening. It pages by 100 with
an exact total and Previous/Next controls, so older unresolved work remains reachable. Links select
the authorized briefing, board/round or publication, the filtered Files delivery page, or the credit-request section. The bell reports
unread activity and pending work separately; a read action never marks workflow work complete.
