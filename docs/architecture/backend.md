# Backend architecture

Creative Canvas uses Docker-managed Supabase Auth, PostgreSQL, PostgREST, Storage and Realtime. Application authorization is enforced through SQL grants, row-level security and transaction functions; choosing a UI perspective never grants a role.

## Local environment

The isolated CLI project is `dawes-studios`: API `http://127.0.0.1:55421`, PostgreSQL `55422`, Studio `55423`, local email inbox `55424`. Unrelated Docker projects must not be changed. The app origin is `http://localhost:3003`.

- Start: `python3 supabase/scripts/local_stack.py start` from the repository root.
- Reset the isolated database and Storage fixtures: `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss` after stopping mutation suites.
- Verify database behavior: `supabase test db`.
- Generate types: `supabase gen types typescript --local > supabase/database.types.ts`.
- Provision local Auth fixtures after a reset: `python3 supabase/scripts/provision_local_auth.py`.
- Credentials live only in ignored `supabase/.env.local`; never copy service credentials into browser environment variables.
- One stack serves every working tree. `supabase/.env.local` is ignored, so a git worktree starts without one, and provisioning reads `DEMO_PASSWORD` from the tree it was invoked from. Provisioning a stack whose fixture accounts already carry passwords this tree cannot read is refused rather than rotating them, because rotating locks every other tree out of the shared stack with `invalid_credentials`. Copy `supabase/.env.local` into the new tree, or reset the stack to provision it from scratch.

The CLI environment is for local development and production simulation. Deployment requires a separate production Supabase installation, HTTPS, configured email delivery, backup/restore verification, monitoring and production secrets. No hosted production deployment is implied by local tests.

See the [operations runbook](../operations/README.md) for repeatable lifecycle commands, final acceptance, backup/restore and the tested deployment boundary.

## Data and trust boundaries

`profiles.role` is a protected database value (`agency`, `client`, `designer`). Auth signup metadata cannot choose a role. New accounts start without client membership. Invitations attach an authenticated, email-confirmed account to an administrator-chosen role/client; invitation tokens are stored as hashes. Profiles expose only the caller's own record to non-agency users. Team removal preserves that historical row and sets `removed_at`; `private.current_role()` then returns no role. The authenticated caller cannot write removal markers. `removal_completed_at` is written by the server after a successful Auth ban, leaving partial removals retryable. See [Team](../../apps/web/features/team/README.md).

Client invitation return flows (`202609270013`–`202609270016`) preserve active memberships when a client
accepts another client workspace. Removed clients can accept a new client invitation only after
email/token validation; stale memberships are deleted before clearing the removal markers. The
agency-only delivery route unblocks Auth sign-in for that return flow, while RLS continues denying
all application data until acceptance. Removed staff retain their existing early denial. Existing
passwords are preserved, and token setup is validated before a new account sets a password. See
[invitation delivery](../../apps/web/features/settings/README.md#invitation-delivery).


`clients → campaigns → briefings → projects → deliverables` captures what was ordered, and `projects → design_boards → design_versions` (rounds) captures production. `project_assignments`, `design_boards`, `design_versions`, `internal_comments` and `project_assets` are unreadable to clients. Designers see assigned projects and brand data; they cannot read credit data or client conversations.

Designers cannot read the original client request, its attachments or contracted deliverables.
`get_assigned_briefings(p_client_id=null)` is a compatibility endpoint returning no rows.
`production_brief_drafts` is agency-only; `production_briefs` holds explicitly released content
and uses the selected design board's visibility boundary. The studio may copy/rewrite the client
scope in its editor, then deliberately send it. Unsaved or saved draft changes do not replace the
released instructions. Assignment revocation removes board/production access on subsequent reads.

`save_production_brief(p_board_id,p_content,p_expected_revision,p_publish,p_request_id)` returns
the new integer revision. It locks the board/project, refuses stale editors and delivered projects,
validates content, dimensions, quantities and HTTPS references, and stores idempotent private save
records. Sending updates the internal board deadline and notifies only that board's designer;
client scope, credits and project/round statuses are untouched. Drafts and releases have no direct
authenticated writes. The production editor supplies named reference links; original client
attachments are not automatically copied or granted to the designer.

Authenticated project list/detail reads use `visible_projects()`, which checks current access
and masks client-derived descriptions for designers. Direct/nested `projects.description` reads
are revoked; other authorized columns remain selectable. Agency updates still return only `id`.
The original client request and description remain stored unchanged.

`published_versions` is the separate client projection: a **client version** is project-level and
numbered per project. Its row, including identity, number and release note, is immutable. Its Miro
link lives in `publication_miro_links` and the agency may change that link after publication,
approval or delivery without creating a version or resetting reviews/comments. The user confirmed
this behavior on 2026-09-27; it matches the existing agency-only setter. A shared version cannot
lose its required link. Each client version gets an independent UUID and client version number;
source IDs, creator IDs and internal notes are absent. The source round mapping is in the unexposed
`private` schema (`private.publication_round_sources`; historical `private.publication_sources` is retained). Only agency users may share (`share_workflow_version`).
Uploaded production artwork, the `published_designs` snapshot and the publication asset copy were
retired by `202609270007` (see below).

Miro frame links sit beside versions without touching either projection. `publication_miro_links` (keyed by `published_versions.id`) is the client board and reads under `private.can_client_channel`; `design_version_miro_links` (keyed by `design_versions.id`) is the internal board and reads under `private.can_produce`, so a client never receives an internal link and a designer never receives a client link. Both store only the parsed `board_id` and optional `widget_id`, never the pasted URL. Only the agency writes, through `set_`/`clear_publication_miro_link` and `set_`/`clear_version_miro_link`, which parse the URL in `private.parse_miro_board_url` (HTTPS `miro.com/app/board/...` with an optional numeric `moveToWidget`; anything else raises `22023`). The tables are not in the Realtime publication; links refresh on the next project read. The web app's Content-Security-Policy allows `frame-src https://miro.com` for the embed and nothing else.

The Miro workspace (migrations `202609260006`, `202609260008`, `202609260009`, `202609260010`, `202609260011` — there is no `0007`) replaces per-deliverable versions with named internal design boards and project-level client versions for a project that uses it. `public.design_boards` (`project_id`, `name` unique per project, `designer_id`, its own `board_id`/`widget_id`) belongs to exactly one assigned designer; a `design_versions` row with a `board_id` is a **round** (since `202609270007` every row has one). A `published_versions` row is a **client version**, numbered per project (`published_versions_project_number`). Reads follow `private.can_see_board` (agency, or the board's own designer) and `private.can_see_version` (the round's board visibility; true when no version is given); `internal_comments` on a round additionally hide another designer's comments and `author_id` through `private.can_read_internal_comment`, enforced on write by the `internal_comments_privacy` trigger, not only on read — this is the one privacy gap `202609260006` closes that plain RLS on `internal_comments` did not already cover. The Miro frame itself is a round's content.

The current guarded contract is defined by migrations `202609280003` onward. `save_production_brief`
creates assignment-scoped work requests on release; drafts remain private. `send_board_round_for_request`
requires the current open request and expected board revision, and never changes the public project phase.
`handoff_board_work` atomically continues selected boards with curated instructions and closes explicit
alternative directions. `share_workflow_version` accepts source round IDs plus the expected latest V and
review revision, records private many-to-many provenance and makes only included current submissions Shared.
Reusing source material does not rewrite historical source associations. Clients receive only public V metadata.
`get_project_workflow` returns authorized current work and capabilities; designers receive no client review.

`projects.activity` (Active/Backlog) is separate from public phase. `save_project_details_with_activity`
atomically saves metadata/activity with expected project timestamps and revision. Backlog suppresses tasks
and blocks advancement. Board closure/reassignment ends old requests; assignment generations prevent a new
assignee inheriting historical rounds or instructions. The agency keeps authorized history.

Old `send_board_round`/`share_miro_version` and the inner legacy production-brief function have no PUBLIC,
anonymous or authenticated execution grant. Current writes serialize on the project before board locks,
carry payload-checked idempotency receipts, and use `PT409` for stale forms (not retryable SQLSTATE `40001`).
Column grants still hide authors on internal version/link reads. See [production workflow](production-workflow.md)
and the [API contract](../engineering/handoffs/2026-09-27-workflow-api-contract.md).

`202609270007_retire_versions_schema.sql` retires the legacy per-deliverable Versions model. It deletes the legacy rows (every `design_versions` / `published_versions` row with a deliverable, their comments, Miro links, reviews, publication sources, share requests, attestations and audit events; notifications carry no version id and stay) and aborts if any client, project, briefing, deliverable, campaign, credit, cover, board, round, client version, project asset, delivery file, playground or brand row count changes. It drops the tables `designs` and `published_designs`, the columns `deliverable_id` on both version tables, `design_id`/`pin_x`/`pin_y`/`pin_t` on both comment tables and `private.sanitized_assets.source_design_id`, the one-parent check (`design_versions.board_id` is now `not null`), the trigger `designs_no_round_uploads`, the storage policy `published_storage_read`, and the RPCs `add_design`, `create_design_version`, `submit_design_version`, `publish_version`, `private.public_design_content`, `discard_prepared_assets`, `register_sanitized_video`, `find_sanitized_video_by_source` and `list_stale_video_uploads`. It recreates `post_comment` without design and pin arguments, `review_publication` without the deliverable branch, `share_miro_version`, `clear_publication_miro_link` (every client version keeps its link), `private.can_see_version`, `versions_read`, `internal_storage_delete`, and `register_sanitized_asset` / `discard_sanitized_asset` / `list_stale_sanitized_assets` without design references. The comment RLS, the `internal_comments_privacy` trigger and the `202609260011` author-column privileges are unchanged. The `published-assets` bucket still holds objects, so it stays until the Storage cleanup runs; `private.retired_version_objects` lists the Storage paths the deleted rows referenced for that cleanup. `supabase/tests/database/retire_versions.test.sql` covers the dropped schema and the remaining workflow RPCs.

`share_workflow_version` accepts a caller UUID idempotency key and rejects stale latest-version/review
revisions. Identical completed decisions do not duplicate events. Review, sharing, file registration and
delivery serialize through the project lock. Delivery requires the latest approved V and real final files;
a completed-delivery retry is safe. Agency can still correct the published Miro link after delivery.

`internal_comments` and `client_comments` are separate tables. Client comments expose only the label `Studio` or the client's display name, never agency/designer author UUIDs. Since `202609270007` neither table carries a design or pin coordinate; each comment belongs to a project and, optionally, a round (`internal_comments.version_id`) or a client version (`client_comments.publication_id`). A general message may omit that version reference.

Credits are held per client per calendar month (docs/superpowers/specs/2026-09-27-monthly-credits-design.md; migrations `202609270003_monthly_credits.sql` through `202609270006_monthly_credits_single_count.sql`). `credit_months` (`client_id`, `month` — a UTC month's first day — `balance`, `status`) is created on demand and granted its `credit_plans` allowance once per month by `private.ensure_credit_month`, the first write or read that touches it; a later plan change never rewrites a month that already received one. Only the current month and the next 11 accept a debit, an extra or an incoming transfer (`private.assert_open_month`, errcode `22023`); a month past its end is swept to zero and marked `expired` idempotently, the next time a write or read touches that client (`private.expire_credit_months`). `credit_accounts.balance` is kept in sync as the current month's balance for callers that still read it. The immutable `credit_ledger` carries `month` and, beside `project_debit`/`project_refund`, `allocation` and `adjustment`, the kinds `plan_allowance`, `extra`, `transfer_out`, `transfer_in`, `final_adjustment` and `expiry`; `balance_after` is that month's balance after the entry.

Budget confirmation precedes acceptance. `accept_briefing(p_briefing_id, p_month=null)` debits the chosen month — the due date's month by default, never earlier than the current month and clamped to the last writable one — locks the briefing and the client's credit rows, validates that month's balance, creates the project (with its `credit_month`) and all deliverables, and writes one debit in one transaction. The created project's `start_date` is the workspace's local calendar day (`workspace_settings.timezone`), clamped down to `due_date` when the due date has already passed, rather than the column's UTC `current_date` default — see `supabase/migrations/202609230013_studio_local_acceptance_dates.sql`. Retrying an accepted briefing returns the existing project. `move_project_month(p_project_id, p_to_month, p_idempotency_key, p_charge_full=false)` refunds the project's still-open origin month and debits the new one in one transaction; an already-expired origin is not refunded, so the agency must pass `p_charge_full=true` to move it anyway. `settle_project_credits(p_project_id, p_final_credits, p_reason, p_idempotency_key, p_charge_month=null)` settles a project once, at `approved` or `delivered`: extra cost debits `p_charge_month` (the current month by default) and raises `insufficient_month_credits` with the shortfall in `DETAIL` when that month is short; a refund always credits the current month, never the project's own month, which may have expired. `credit_month_summary(p_client_id, p_month)` (agency, and that client for their own) returns one month's available/allowance/extras/used/transferred/expiring/expired figures, projecting an unclaimed plan allowance without writing it; a month past the next 11 raises `22023`, and a past month reads as expired with nothing available. Adjustment idempotency keys cannot be reused with different payloads. Every monthly-credit write takes its idempotency key's advisory lock before the client's credit-row lock — the same order `adjust_credits` and `request_credits` already followed — so two concurrent calls sharing one key cannot both miss it and race Postgres' own unique-violation error instead of the friendly conflict message — see `supabase/migrations/202609260003_briefing_limits_and_credit_lock.sql`. No payment gateway is simulated as a real charge.

Brand sections, assets and templates are scoped to a client; only agency users edit shared brand data. Personal `template_drafts` are accessible only to their owner and never create a project or debit. Notifications are recipient-only and are constructed separately for agency, client and designer recipients.

`brand_asset_folders` adds one-level, client-scoped organization for approved assets. Agency members
create/rename/delete folders and move `brand_assets.folder_id`; clients and assigned designers read
through `private.can_access_client`. Names are case-insensitively unique per client. A composite
(folder_id, client_id) foreign key prevents cross-client placement; deleting a folder sets only
folder_id to null and preserves all stored bytes. Templates UI is retired, but its persisted data
and private direct draft editor remain. Migration: `202609230009_brand_asset_folders.sql`.


The seven Storage buckets are private: `internal-assets`, `published-assets`, `brand-assets`, `delivery-files`, `briefing-files`, `playground-assets` and `project-covers`. Production, brand and briefing paths use scoped UUIDs and random UUID filenames. Playground instead uses `<board UUID>/<item UUID>/<safe filename>`; its role-scoped path and policies are described below. Metadata constraints preserve the matching parent scope. Internal assets permit production access only. `published-assets` has no browser policy left: it only awaits the Storage cleanup of the retired publication copies. Delivery reads require a matching delivery record. Published and delivery objects have no authenticated insert or update policy. Only the trusted media worker may upload regenerated bytes and attest to them; their bytes cannot be silently replaced by a browser caller. New final-file registration requires an approved project. Final delivery requires approval of every deliverable and at least one real delivery file; repeated delivery returns without duplicate events.

## Playground and board preferences

`playground_boards` has one accessible board per project/role. Migration `202609230007` preserves legacy workspace-only rows and files but blocks their authenticated access and any new null-project rows. `get_playground_board` derives the role from the authenticated profile and verifies current client/project access. Agency, client and designer boards are separate even when their scope is identical. `playground_items` contains notes, file references, geometry and revisions; it does not enter production designs, publication or billing. Authenticated table access is read-only, with mutations through scope-checked RPCs. See the [Playground feature](../../apps/web/features/playground/README.md) and [feature contract](playground-and-board-widgets.md).

Save retries retain the item UUID, attachment path and expected revision. An exact completed insert/update retry returns the committed item; stale writes return `PT409` without replacing newer content. Saves and deletions lock the board and item. Deletion retains a tombstone, and repeating its original revision/path returns the same file path for retryable Storage removal. File kind/path/MIME cannot be replaced by an item update. Boards allow 500 active items and supported image/document uploads up to 25 MiB each.

Playground Storage checks both the board's role/scope and attachment ownership. New uploads belong to their uploader; a committed file is available to authorized collaborators of that role board. There is no authenticated overwrite policy. `get_playground_cleanup` returns up to 100 pending tombstone files or the caller's unclaimed uploads older than 24 hours. Opening/refetching a board attempts their removal; the Storage delete predicate locks and rechecks the item so cleanup cannot remove a newly attached live file. Cleanup failures remain visible and retryable. Signed image previews last 600 seconds, download URLs 60 seconds, and an open board polls every 60 seconds. Playground is not part of the Realtime publication.

`board_preferences` stores nullable `active_view` under `(user_id, client_id)`, constrained to Canvas, List, Timeline, Kanban or Calendar identifiers. Missing/null preferences use the responsive default. `save_board_view` derives the user ID from the session; RLS requires ownership and current client access. Migration `202609230008` preserves legacy `visible_widgets` data and `save_board_widgets` compatibility; neither writer overwrites the other's field. Even agency users cannot read or change another viewer's choice. See the [board feature](../../apps/web/features/board/README.md).

## Competitor ads

`competitors` holds the competitors a client's studio team follows (name, website, Facebook Page ID,
Google advertiser ID and TikTok advertiser name, each checked by a constraint; names unique per client
ignoring case), and `client_board_widgets` records which widgets the agency placed on a client's board
(`kind` is `competitor_ads`). Row-level security admits reads through `private.can_follow_competitors`:
the agency, or a designer that `private.can_access_client` admits; never a client. Only the agency
inserts, updates or deletes, with insert and update granted column by column. A `before insert` trigger
holds the client row and refuses a thirteenth competitor, and passes any other caller straight to
row-level security. Migration `202609240001`; tests in `competitor_ads.test.sql`. See the
[competitors feature](../../apps/web/features/competitors/README.md).

## Frontend table contract

Use generated `supabase/database.types.ts` as the authoritative TypeScript interface. Read tables through the caller's Supabase session. Authentication is `signInWithPassword`, followed by `useProfile` reading the caller's identity fields and `removed_at`. A removed membership is refused by the UI and by backend role helpers. Queries need no service key.

Primary lists: `clients`, `campaigns`, `briefings`, `projects`, `deliverables`, `design_versions`, `published_versions`, `publication_reviews`, `internal_comments`, `client_comments`, `credit_accounts`, `credit_ledger`, `credit_months`, `credit_plans`, `project_settlements`, `brand_sections`, `brand_assets`, `brand_asset_folders`, `brand_templates`, `template_drafts`, `project_assets`, `delivery_files`, `notifications`, `invitations`, `playground_boards`, `playground_items`, `board_preferences`, `competitors`, `client_board_widgets`, `publication_miro_links`, `design_version_miro_links`, `design_boards`.

Public project phases: `in_progress`, `client_review`, `changes_requested`, `approved`, `delivered`; `planned` is retained for historical/manual records. New acceptance starts `in_progress`; `internal_review` is prohibited on projects and remains a board-review concept. Project activity is independently `active`/`backlog`. Briefing status: `draft`, `awaiting_review`, `budget_confirmed`, `accepted`.

## Mutation RPC contract

All arguments use the `p_` prefix. Functions return a UUID unless another return type is shown.

| Function | Arguments |
| --- | --- |
| `save_briefing` | `p_client_id`, `p_service_type`, `p_title=''`, `p_campaign_id=null`, `p_overview=''`, `p_goals=''`, `p_direction={}`, `p_deliverables=[]`, `p_due_date=null`, `p_estimated_credits=1`, `p_briefing_id=null`, `p_expected_updated_at=null`, `p_requested_by=null` (one of the client's active people, chosen by the studio; ignored for a client person, who is always the requester of what they file; with exactly one person the studio's missing choice means that person) |
| `save_briefing_revision` (JSON) | Same arguments as `save_briefing`; atomically returns `{id,updated_at}` for editor saves |
| `submit_briefing` (void) | `p_briefing_id` |
| `confirm_briefing_budget` (void) | `p_briefing_id`, `p_credits`, `p_note=''` (required when different from estimate) |
| `visible_projects` (project rows) | No arguments; authorized project rows, description empty for designers |
| `save_production_brief` (integer revision) | `p_board_id`, `p_content`, `p_expected_revision`, `p_publish`, `p_request_id`; agency only, per-board instructions |
| `accept_briefing` | `p_briefing_id`, `p_month=null` (the due-date month, clamped to the writable window, when omitted) |
| `adjust_credits` | `p_client_id`, `p_amount`, `p_description`, `p_idempotency_key`; applies to the current month |
| `set_credit_plan` (void) | `p_client_id`, `p_monthly_credits`, `p_starts_on` (the current month or later) |
| `add_month_extra` | `p_client_id`, `p_month`, `p_amount` (>0), `p_reason`, `p_idempotency_key` |
| `transfer_month_credits` | `p_client_id`, `p_from_month`, `p_to_month`, `p_amount` (>0), `p_reason`, `p_idempotency_key` |
| `move_project_month` | `p_project_id`, `p_to_month`, `p_idempotency_key`, `p_charge_full=false` (required to move a project whose origin month already expired) |
| `settle_project_credits` (row) | `p_project_id`, `p_final_credits`, `p_reason`, `p_idempotency_key`, `p_charge_month=null` (the current month when omitted) |
| `credit_month_summary` (row) | `p_client_id`, `p_month`; agency and that client; later than the next 11 months raises `22023`, past months read as expired |
| `create_client` | `p_name`, `p_slug`, `p_industry=''`, `p_initial_credits=0` |
| `assign_designer` (void) | `p_project_id`, `p_designer_id` |
| `revoke_design_assignment` (void) | `p_project_id`, `p_designer_id` |
| `review_publication` (void) | `p_publication_id`, `p_decision` (`approved`/`changes_requested`), `p_feedback=''`; records the deciding person in `reviewed_by`; only the latest client version of the project can be reviewed, and the decision sets the project's status |
| `create_design_board` | `p_project_id`, `p_name`, `p_url`, `p_designer_id` (must already be assigned) |
| `update_design_board` (void) | `p_board_id`, `p_name`, `p_url`, `p_designer_id` |
| `send_board_round_for_request` | Board/current request IDs, expected board revision, note/frame URL, idempotency key |
| `share_workflow_version` | Project, client URL/note, source round IDs, expected latest V/review revision, replacement confirmation, request key |
| `set_briefing_requester` (void) | `p_briefing_id`, `p_requested_by`; studio only; one of the briefing's client's active people; any status |
| `client_team` (rows of `user_id`, `display_name`, `email`) | `p_client_id`; the client's active client-role people, returned to the studio and that client's own people only |
| `set_client_notifications` (void) | `p_client_id`, `p_all`; the caller's own choice at one of their clients |
| `remove_client_member` (boolean) | `p_client_id`, `p_profile_id`; studio only; `true` when the account was deactivated and `/api/clients/{clientId}/members/{profileId}/remove` must block sign-in |
| `add_delivery_file` | `p_project_id`, `p_name`, `p_storage_path`, `p_mime_type`, `p_file_size` |
| `mark_project_delivered` (void) | `p_project_id` |
| `set_project_drive_link` (void) | `p_project_id`, `p_channel` (`internal`/`client`), `p_url`; agency only; unknown channel refused; `https://drive.google.com/...` only, an empty/blank value clears that channel's link |
| `post_comment` | `p_project_id`, `p_channel` (`internal`/`client`), `p_body`, `p_version_id=null`, `p_idempotency_key=null` |
| `resolve_comment` (void) | `p_comment_id`, `p_channel`, `p_resolved=true` |
| `create_invitation` (JSON) | `p_email`, `p_role`, `p_client_id=null`; returns `{id,token,existing_user_id,existing_removed}` to the agency caller |
| `accept_invitation` (void) | `p_token` |
| `invitation_requires_password` (boolean) | `p_token`; validates caller, confirmed email, pending token and completed removal before returning whether the caller still needs a password; no hash is exposed |
| `revoke_invitation` (void) | `p_invitation_id` |
| `update_workspace_settings` (timestamptz revision) | `p_studio_name`, `p_timezone` (valid IANA name), `p_expected_updated_at=null` (the revision the form was read on; a mismatch is `PT409`) |
| `save_service_preset` (integer revision) | `p_service_type`, `p_min_credits`, `p_max_credits`, `p_due_days`, `p_expected_revision=null` (the revision the editor opened on; a mismatch is `PT409`) |
| `get_playground_board` | `p_client_id`, `p_project_id`; resolves or creates the caller's project/role board; omitted/null project is rejected |
| `save_playground_item` (JSON) | `p_board_id`, `p_item`, `p_expected_revision=null`; null inserts, existing items require the loaded revision |
| `delete_playground_item` (nullable text path) | `p_board_id`, `p_item_id`, `p_expected_revision`, `p_asset_path=null`; tombstones the item before Storage cleanup |
| `get_playground_cleanup` (rows of `path`) | `p_board_id`; authorized pending deletions and caller-owned expired staging |
| `save_board_view` (text) | `p_client_id`, `p_active_view`; `canvas`, `list`, `timeline`, `kanban`, `calendar`, or null to restore the responsive default |
| `save_board_widgets` (legacy text array) | `p_client_id`, `p_visible_widgets`; only `timeline` and `kanban`, including an empty choice |

Deliverable payloads: `{name,format,width?,height?,quantity:1,scope:'original'|'adaptation'}`. In the client comment channel `p_version_id` means the **client version** (`published_versions`) UUID; in the internal channel it means the round UUID. Never submit internal IDs to the client channel.

Safe direct writes: own profile `display_name/avatar_url`; agency client descriptive fields; client/agency campaign creation/edit; agency project title/description/dates/board position; assigned designer/agency design content; agency shared brand data; personal template drafts; production project assets; own notification `read_at`. Security-sensitive transitions always use RPCs.

Existing draft edits require the revision loaded with the text. A mismatch returns HTTP 409 (`PT409`) without replacing newer content. The editor uses the atomic revision-returning RPC to avoid a write/read race. The same guard now covers every settings editor: `clients` and `campaigns` carry an `updated_at` maintained by a `before update` trigger and are written with `.eq("updated_at", <revision>)`, while `update_workspace_settings` and `save_service_preset` take the revision their form was opened on. Each expected revision is optional so a caller with no open form (fixtures, restore paths) still writes; every editor in the product supplies one. Project updates have an automatic `updated_at` trigger for optimistic filters, trimmed nonempty titles, valid date order and bounded numeric canvas positions. Workspace settings and immutable preset history are persisted; preset changes affect future estimates, leaving accepted quotes untouched. The `other` preset retains null estimate/timing until an agency quote exists. Invitations have serialized per-actor/hour and pending-workspace limits and reject expired, reused, wrong-email and existing-member role changes.

## Sources

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and security-definer search paths](https://supabase.com/docs/guides/database/functions)
- [Local development and seed ordering](https://supabase.com/docs/guides/local-development/seeding-your-database)

## Briefing attachments and credit requests

A `before insert or update` trigger on `public.briefings`, applied at every status so a draft cannot outgrow what a submission could ever reach, caps `requested_deliverables` at 50 entries, `direction` at 65536 bytes, `title` at 200 characters and `overview`/`goals`/`budget_note` at 10,000 characters each, and — under a per-client advisory lock, checked only on insert — refuses a 101st draft for one client with a plain-English message. See `supabase/migrations/202609260003_briefing_limits_and_credit_lock.sql`.

`briefing_attachments` records real files in the private `briefing-files` bucket. Save the draft first, upload to `<briefing-uuid>/<random-uuid>.<extension>`, then call `add_briefing_attachment(p_briefing_id,p_name,p_storage_path,p_mime_type,p_file_size)`. Allowed types are PNG, JPEG, WebP and PDF, up to 50 MiB. A `before insert` trigger, under a per-briefing advisory lock, refuses a 21st attachment for one briefing (same migration). Draft access is required for upload/removal. Submission preserves read access for that client and agency. Designers cannot read original briefing attachments; the studio supplies production references separately. To remove a draft attachment call `remove_briefing_attachment(p_attachment_id)`, then remove its returned path from Storage. An unregistered file can also be removed while the briefing remains a draft.

`credit_requests` lets a client request 25, 50 or 100 credits through `request_credits(p_client_id,p_amount,p_note='')`. This never grants credits or charges a card. Agency users resolve the request through `fulfill_credit_request(p_request_id,p_note='')` or `reject_credit_request(p_request_id,p_note)`. Fulfillment adds an `extra` to the current month and is idempotent, returning the original ledger UUID on retries. Rejected requests cannot be fulfilled.

## Realtime

The `supabase_realtime` publication includes `projects`, `internal_comments`, `client_comments`, `notifications`, `publication_reviews`, `published_versions`, `design_versions` and `design_boards`, with **insert/update only**. Subscribers use their own authenticated session; SELECT RLS is evaluated for those events. Deleted-row events are disabled because they do not provide the same RLS filtering. Client comments never share a stream/table with internal comments. Project/recipient filters improve efficiency but are not the authorization boundary. Four simultaneous real subscriptions verify channel isolation, zero cross-client events and absence of deleted private row identifiers.

## Verification evidence

`supabase test db` covers deterministic fixture counts, role/tenant restrictions, profile escalation, confidential production data, separate channels and cross-project foreign keys, immutable client versions, budget confirmation, insufficient balance, idempotent acceptance, ledger reconciliation, draft attachments, storage path boundaries and credit request fulfillment. `monthly_credits.test.sql` covers plan resolution and its one-time allowance, extras and transfers (including a past month's refusal), acceptance per month under concurrency and idempotency, a move between months (including an expired origin), settlement with extra cost/a charge month/a shortfall and a refund to the current month (once only), idempotent expiry, role access (a client reads only its own records; a designer reads none) and the September 2026 migration of prior balances. `security_definer_coverage.test.sql` covers `resolve_comment` (both channels), `revoke_invitation`, `reject_credit_request`, `discard_sanitized_asset`, `finalize_asset_discard`, the briefing/attachment size and draft caps above and `adjust_credits`' idempotent retry, against fixtures it creates itself rather than the seed or SABRE overlay rows. `supabase db lint --local` checks SQL function validity. Test transactions roll back their mutations. HTTP/Auth/Storage verification is separate from database assertions and must be reported separately.

## Trusted media worker

The [media service](../../apps/media/README.md) runs separately from the web UI and stores its service credential only in its own environment. Since the Versions retirement it only prepares project covers (`POST /covers/prepare`, `POST /covers/clear`) and final delivery files (`POST /deliveries/prepare?projectId=<uuid>`, a raw raster/PDF file that becomes the regenerated delivery record). The health URL is `http://127.0.0.1:55430/health` locally.

The public `register_sanitized_asset`, `discard_sanitized_asset`, `finalize_asset_discard` and `list_stale_sanitized_assets` functions grant execution only to `service_role`; none can be called by a browser's authenticated role. Attestations stay in `private.sanitized_assets`, which clients cannot query. `register_sanitized_asset` keeps its `p_source_design_id` parameter for the media worker's call shape, but refuses any non-null value and any `published-assets` registration (`22023`). `add_delivery_file` verifies the attested project, prepared-by identity, MIME type and byte size, and `set_project_cover` does the same for a cover.

Project covers (`202609270001_project_covers.sql`): `project-covers` holds sanitized PNGs only (10 MiB), written and attested (`register_sanitized_asset`, PNG with no source design) by the media worker; there is no authenticated insert policy. `public.project_covers` has one row per project (`storage_path` unique, `client_visible` default false); production (`can_produce`) reads every row and client members read a row only while it is client-visible, and the storage read policy applies the same rule to the object named by `storage_path`. `updated_by` is not readable by `authenticated`. The agency-only RPCs are the only writers: `set_project_cover(p_project_id,p_storage_path,p_client_visible=false)` requires a non-discarded `project-covers` attestation for the same project prepared by the caller (22023 otherwise) and returns the previous path (null when none or unchanged); `set_project_cover_visibility(p_project_id,p_client_visible)` (P0002 without a cover); `clear_project_cover(p_project_id)` returns the removed path. Each audits and none notifies. The stale-asset sweep and `discard_sanitized_asset` never take a live cover.

Google Drive folder links, by channel (`202609270009_project_drive_link.sql`, `202609270010_drive_link_whitespace.sql`, `202609270011_project_drive_links_by_channel.sql`, `202609270012_reject_null_drive_channel.sql`): the original single `projects.drive_url` column let the agency, an assigned designer and the client all read the same link, which broke channel isolation, so it was replaced by `public.project_drive_links(project_id, channel, url, updated_at, updated_by)` with one row per `(project_id, channel)` and `channel in ('internal','client')`. The read policy is `(channel='internal' and can_produce(project_id)) or (channel='client' and can_client_channel(project_id))`, so an assigned designer reads the internal link only, a client member reads the client link only, and the agency reads both; `updated_by` is not readable by `authenticated` (the same column-privilege idiom as `project_covers`), and there is no insert/update/delete grant — only the RPC writes. `set_project_drive_link(p_project_id,p_channel,p_url)` is the only writer: agency only (`private.assert_agency`), refuses a missing project (`P0002`), refuses a null or unrecognized channel (`22023` "Unknown channel"), trims the input, deletes that channel's row on an empty/blank value, and otherwise requires `p_url` to match `^https://drive\.google\.com(/[^[:space:]]*)?$` (`22023` "Paste a Google Drive link (https://drive.google.com/…)" — refuses `http://`, `javascript:` and a lookalike host such as `drive.google.com.evil.com`) — the same check is mirrored as a table check constraint and, on the client, `features/projects/drive-link.ts`'s `parseDriveUrl`. Each write audits (`project.drive_link_set`/`project.drive_link_cleared`, with the channel in `details`) and nothing notifies. `public.project_drive_links` is in `supabase_realtime` alongside `public.projects`. The link is only a link: nothing syncs with Google Drive, and it carries no delivered-project restriction.

PDF delivery is flattened to newly rendered page images and rebuilt as a new PDF. This removes original objects and metadata but intentionally does not retain editable vectors or searchable text. Delivery accepts only PNG, JPEG, WebP and PDF; video is a design surface (see above), never a delivery format, and ZIP is not accepted anywhere in this pipeline. Agency review remains responsible for content visibly drawn into an image, PDF or video frame; automatic metadata stripping does not redact visible names.

## Service validation

`service_catalog` and `format_catalog` preserve the 20 service types and 25 formats from the source catalog. Foreign keys prevent unknown IDs. On submission, the database checks service-compatible named deliverables, dimensions for fixed/fluid layouts, quantity and scope. Every declared service question is required in `direction.questions`; choice answers must match a catalog option and page counts must be positive whole-number strings. Drafts remain intentionally incomplete. Shared catalog tables are read-only to authenticated browser users.

## Additional verification commands

- `python3 supabase/tests/http_auth_storage_test.py`: nine real Auth/PostgREST/Storage integration tests.
- `npm --prefix apps/media test`: 34 tests across raster/PDF regeneration, video remux/attestation, and the origin allowlist (see `apps/media/README.md`, which states the current per-file split; treat any specific count as a snapshot rather than a contract and trust the command's own output over either document).
- `npm --prefix apps/media run test:integration`: 15 real worker pipeline checks, with temporary-object cleanup.
- `npm --prefix apps/media audit --omit=dev`: production dependency advisory check.
- `node supabase/tests/realtime_boundary_test.mjs`: real four-role subscription and deleted-event boundary check.
- `supabase/tests/concurrent_workflows_test.py`: historical Versions-era concurrency harness, coupled to the old port-55521 clone. It is not a current Miro verification command; see the [operations warning](../operations/README.md#database-auth-and-storage-backup) and use current database/browser acceptance.
- `python3 supabase/scripts/verify_seed.py` (`--staging` for the staging rehearsal): exact all-client scenario, all 20 accepted service answers, ledger, 70 templates, and the Miro model per project: one design board per assigned designer due on or before the project, rounds and client versions whose statuses follow the project status, placeholder Miro links, designer board isolation, no designer name in any client-visible row, and a cover on every project that the client can read exactly when it has a client version. It downloads 110 actual files (70 brand files, 25 covers as the agency, 14 client-visible covers as the client, one delivery) and checks each cover's PNG canvas against the `format_catalog` size of the project's leading deliverable.
- `python3 supabase/scripts/verify_local.py`: final source-backend verification after browser mutations stop.

Database tests now also cover trusted-worker attestations, denied direct publication/delivery uploads, source mapping, submitted question validation and safe removal of unregistered brand files. Execute these commands against the isolated fixture environment, not a production database. Browser end-to-end checks are owned by the web application test suite and are not implied by these backend results.
