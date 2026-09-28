# Workflow notification map
- Updated: 2026-09-27 EDT · Agent: Codex reviewer · Model: GPT-6 Sol
- State: verified (static code and read-only local schema); no workflow test executed
- Objective: map agency/designer/client activity and pending actions; owned path: this report only.
## Changes
- Added this report; no app, database, or Git changes. No interface changes.
## Activity event matrix
- Source: `public.notifications` persists per-user events and `read_at` (`202609200001_foundation.sql:186`, `202609230002_removed_member_guards.sql:31`); agency helper sends to every active agency member except actor, client helper excludes actor and sends project events to active requester + `notify_all` members, falling back to all active members if no active requester; client-wide events reach all (`202609250003_client_notification_routing.sql:7`).
- Agency: briefing submitted → “Briefing ready for review”; credit request created → “Credit allocation requested” (`202609200002_workflows.sql:24`, `202609220003_request_credits_idempotency.sql:31`). No event on budget confirmation.
- Agency: board round sent → “Design ready for studio review”; client decides → “Client approved a design” / “Client requested changes”; designer/client comments → “New internal message” / “New client message” (`202609260013_miro_workspace_polish.sql:7`, `202609270007_retire_versions_schema.sql:200,283`).
- Designer: newly assigned → “New project assignment”; agency internal project comment → “New studio message” to assignees, or only that round's board designer (`202609230001_active_team_membership.sql:77`, `202609270007_retire_versions_schema.sql:229`). Client review has no direct designer event.
- Client: briefing accepted → “Your project is ready”; share → “New designs ready for review”; delivery → “Your project has been delivered”; settlement → “Final credits settled” (`202609270006_monthly_credits_single_count.sql:29,77`, `202609270007_retire_versions_schema.sql:325`, `202609250001_project_delivered_at.sql:12`).
- Client: credit fulfillment/rejection → “Credits added to your workspace” / “Credit request updated”; agency client comment → “New message from Studio,” also to prior active client conversation authors beyond requester/opt-ins (`202609270003_monthly_credits.sql:654`, `202609200004_requests_and_attachments.sql:30`, `202609250003_client_notification_routing.sql:7`).
- Activity UI: latest 100 rows, 30-second poll; unread exact total across all rows; “Mark all read” or per-row mark; arrow links to `/projects/:id` or `/clients/:id/board`, marking read on click (`workspace-data.ts:212-313`, `notification-feed.tsx:39-125`). Read status never clears pending work.
## Pending action matrix
- Source: live invoker/barrier view, stable `kind:entity_id`, no acknowledgement table; 15-second poll, exact count, pages of 100 (`202609270020_action_board_labels.sql:4`, `workspace-data.ts:228-245`). Labels and links are `action-notifications.tsx:12-53`.
- Agency `review_briefing` — awaiting review/no project → budget confirmed or project created; “Review briefing” → `/clients/:client/briefings/:briefing`.
- Agency `start_project` — budget confirmed/no project → acceptance creates project; “Start project” → same briefing route.
- Agency `review_credit_request` — pending request → fulfilled/rejected; “Review credit request” → `/clients/:client/credits#credit-requests`.
- Agency `prepare_project` — undelivered project without board or publication → board created, publication shared, or delivery; “Prepare project” → `/projects/:project?channel=internal&panel=details`.
- Agency `review_round` — latest board round submitted/undelivered → source shared as reviewed, newer round, or delivery; retained even if submitting designer leaves; “Review round” → `/projects/:project?channel=internal&board=:board&round=:round`.
- Agency `respond_feedback` — latest publication changes requested/undelivered → newer publication or delivery; “Respond to feedback” → `/projects/:project?channel=client&version=:publication&panel=comments`.
- Agency `deliver_project` — latest publication approved and project approved → delivery or newer publication; “Deliver project” → `/clients/:client/brand/files?project=:project`.
- Assigned designer `submit_round` — own board, undelivered, no round or latest draft → submitted round, reassignment, or delivery; “Submit round” → `/projects/:project?channel=internal&board=:board`.
- Eligible client `review_version` — latest publication pending/undelivered → review, newer publication, delivery, or lost eligibility; “Review version” → `/projects/:project?channel=client&version=:publication`. Eligibility is active requester + `notify_all`, or all active members when requester absent (`202609270018_action_notifications.sql:7-37`). No billing action for clients.
## Checks actually run
- `rg`/`sed` on scoped current code/migrations; `docker exec ... psql` read-only `pg_get_viewdef` and `pg_get_functiondef` confirmed live view, recipient helpers, security options, and migrations 018–020 applied. No user rows read; no tests run for this analysis.
## Risks and next action
- Verified gap: client changes request creates the agency action and project status, but no designer draft or event; designer Home calls reviewed round + changed project “Your turn,” while `submit_round` action excludes reviewed rounds (`overview-model.ts:188`, `review-data.ts:80`, `202609270007_retire_versions_schema.sql:311`, `202609270020_action_board_labels.sql:73`). Parent should decide whether to add an explicit return-to-designer transition or align the two queues.
- Workflow notifications are in-app only in these paths; `docs/operations/email.md` scopes Resend SMTP to Supabase Auth invitations/recovery. External SMTP delivery remains unverified. Ownership: report complete; no active writer.
