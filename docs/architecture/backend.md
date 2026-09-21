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

`profiles.role` is a protected database value (`agency`, `client`, `designer`). Auth signup metadata cannot choose a role. New accounts start without client membership. Invitations attach an authenticated, email-confirmed account to an administrator-chosen role/client; invitation tokens are stored as hashes. Profiles expose only the caller's own record to non-agency users.

`clients → campaigns → briefings → projects → deliverables → design_versions → designs` captures production. `project_assignments`, `design_versions`, `designs`, `internal_comments` and `project_assets` are unreadable to clients. Designers see assigned projects and brand data; they cannot read credit data or client conversations.

Designers cannot select raw briefing rows because those contain budgets and requester IDs. `get_assigned_briefings(p_client_id=null)` returns an allowlisted production brief without financial/author fields, restricted to accepted briefs for assigned projects. Assignment revocation removes project, brief, file and internal-channel access on subsequent authenticated reads; repeating an existing assignment does not notify twice.

`published_versions → published_designs` is a separate immutable client projection. Each publication gets independent UUIDs and client version numbers; source IDs, creator IDs and internal notes are absent. Source mapping is in the unexposed `private` schema. Only agency users may publish. Structured design content is copied through an explicit field allowlist. Later internal edits do not alter the publication. Uploaded production artwork passes through the trusted media service before publishing. The service strips embedded metadata by regenerating bytes and records a private SHA-256 attestation; the publication RPC requires this attestation to match the source design, source path, project and agency preparer. The database itself cannot inspect embedded EXIF/PDF bytes.

Every publication attempt has a caller UUID idempotency key. A lost response can be retried with the same key; an intentional new revision uses a new key even for the same internal source version. Review accepts only the latest publication for that deliverable. Identical completed decision/feedback retries do not duplicate events, and conflicting second decisions fail. Review, publication, final-file registration and delivery serialize through the project lock. Delivered projects cannot publish new revisions or receive new final files.

`internal_comments` and `client_comments` are separate tables. Client comments expose only the label `Studio` or the client's display name, never agency/designer author UUIDs. Pins are normalized 0–1 coordinates with composite foreign keys enforcing project/version/design consistency. A general message may omit version/design.

`credit_accounts` stores the current balance; the immutable `credit_ledger` stores allocations, adjustments and one debit per project. Budget confirmation precedes acceptance. Acceptance locks the briefing and account, validates the balance, creates the project and all deliverables, and writes one debit in one transaction. Retrying an accepted briefing returns the existing project. Adjustment idempotency keys cannot be reused with different payloads. No payment gateway is simulated as a real charge.

Brand sections, assets and templates are scoped to a client; only agency users edit shared brand data. Personal `template_drafts` are accessible only to their owner and never create a project or debit. Notifications are recipient-only and are constructed separately for agency, client and designer recipients.

All five storage buckets are private. Object paths use scoped UUIDs and random UUID filenames, not names or emails. Metadata constraints preserve the matching project/client prefix. Internal assets permit production access only. Publication reads require a matching published record. Delivery reads require a matching delivery record. Published and delivery objects have no authenticated insert or update policy. Only the trusted media worker may upload regenerated bytes and attest to them; their bytes cannot be silently replaced by a browser caller. New final-file registration requires an approved project. Final delivery requires approval of every deliverable and at least one real delivery file; repeated delivery returns without duplicate events.

## Frontend table contract

Use generated `supabase/database.types.ts` as the authoritative TypeScript interface. Read tables through the caller's Supabase session. Authentication is `signInWithPassword`, followed by `profiles.select('*').eq('id', user.id).single()`. Queries need no service key.

Primary lists: `clients`, `campaigns`, `briefings`, `projects`, `deliverables`, `design_versions`, `designs`, `published_versions`, `published_designs`, `publication_reviews`, `internal_comments`, `client_comments`, `credit_accounts`, `credit_ledger`, `brand_sections`, `brand_assets`, `brand_templates`, `template_drafts`, `project_assets`, `delivery_files`, `notifications`, `invitations`.

Project status: `planned`, `in_progress`, `internal_review`, `client_review`, `changes_requested`, `approved`, `delivered`. Briefing status: `draft`, `awaiting_review`, `budget_confirmed`, `accepted`.

## Mutation RPC contract

All arguments use the `p_` prefix. Functions return a UUID unless marked void or JSON.

| Function | Arguments |
| --- | --- |
| `save_briefing` | `p_client_id`, `p_service_type`, `p_title=''`, `p_campaign_id=null`, `p_overview=''`, `p_goals=''`, `p_direction={}`, `p_deliverables=[]`, `p_due_date=null`, `p_estimated_credits=1`, `p_briefing_id=null`, `p_expected_updated_at=null` |
| `save_briefing_revision` (JSON) | Same arguments as `save_briefing`; atomically returns `{id,updated_at}` for editor saves |
| `submit_briefing` (void) | `p_briefing_id` |
| `confirm_briefing_budget` (void) | `p_briefing_id`, `p_credits`, `p_note=''` (required when different from estimate) |
| `accept_briefing` | `p_briefing_id` |
| `adjust_credits` | `p_client_id`, `p_amount`, `p_description`, `p_idempotency_key` |
| `create_client` | `p_name`, `p_slug`, `p_industry=''`, `p_initial_credits=0` |
| `assign_designer` (void) | `p_project_id`, `p_designer_id` |
| `revoke_design_assignment` (void) | `p_project_id`, `p_designer_id` |
| `create_design_version` | `p_deliverable_id`, `p_notes=''`, `p_copy_version_id=null` |
| `add_design` | `p_version_id`, `p_title`, `p_content={}`, `p_internal_asset_path=null` |
| `submit_design_version` (void) | `p_version_id` |
| `publish_version` | `p_version_id`, `p_release_note=''`, `p_assets={}` (map internal design UUID → sanitized publication object path), `p_idempotency_key=null` (caller UUID, required by current UI) |
| `review_publication` (void) | `p_publication_id`, `p_decision` (`approved`/`changes_requested`), `p_feedback=''` |
| `add_delivery_file` | `p_project_id`, `p_name`, `p_storage_path`, `p_mime_type`, `p_file_size` |
| `mark_project_delivered` (void) | `p_project_id` |
| `post_comment` | `p_project_id`, `p_channel` (`internal`/`client`), `p_body`, `p_version_id=null`, `p_design_id=null`, `p_pin_x=null`, `p_pin_y=null` |
| `resolve_comment` (void) | `p_comment_id`, `p_channel`, `p_resolved=true` |
| `create_invitation` (JSON) | `p_email`, `p_role`, `p_client_id=null`; returns `{id,token}` once |
| `accept_invitation` (void) | `p_token` |
| `revoke_invitation` (void) | `p_invitation_id` |
| `update_workspace_settings` (timestamptz revision) | `p_studio_name`, `p_timezone` (valid IANA name), `p_expected_updated_at=null` (the revision the form was read on; a mismatch is `PT409`) |
| `save_service_preset` (integer revision) | `p_service_type`, `p_min_credits`, `p_max_credits`, `p_due_days`, `p_expected_revision=null` (the revision the editor opened on; a mismatch is `PT409`) |

Deliverable payloads: `{name,format,width?,height?,quantity:1,scope:'original'|'adaptation'}`. Design content supports `headline`, `subheading`, `body`, `background`, `foreground`, `accent`, `eyebrow`, `layout`; only those fields enter publications. In the client comment channel `p_version_id` means the **published** version UUID and `p_design_id` means the **published** design UUID. Never submit internal IDs to the client channel.

Safe direct writes: own profile `display_name/avatar_url`; agency client descriptive fields; client/agency campaign creation/edit; agency project title/description/dates/board position; assigned designer/agency design content; agency shared brand data; personal template drafts; production project assets; own notification `read_at`. Security-sensitive transitions always use RPCs.

Existing draft edits require the revision loaded with the text. A mismatch returns HTTP 409 (`PT409`) without replacing newer content. The editor uses the atomic revision-returning RPC to avoid a write/read race. The same guard now covers every settings editor: `clients` and `campaigns` carry an `updated_at` maintained by a `before update` trigger and are written with `.eq("updated_at", <revision>)`, while `update_workspace_settings` and `save_service_preset` take the revision their form was opened on. Each expected revision is optional so a caller with no open form (fixtures, restore paths) still writes; every editor in the product supplies one. Project updates have an automatic `updated_at` trigger for optimistic filters, trimmed nonempty titles, valid date order and bounded numeric canvas positions. Workspace settings and immutable preset history are persisted; preset changes affect future estimates, leaving accepted quotes untouched. The `other` preset retains null estimate/timing until an agency quote exists. Invitations have serialized per-actor/hour and pending-workspace limits and reject expired, reused, wrong-email and existing-member role changes.

## Sources

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and security-definer search paths](https://supabase.com/docs/guides/database/functions)
- [Local development and seed ordering](https://supabase.com/docs/guides/local-development/seeding-your-database)

## Briefing attachments and credit requests

`briefing_attachments` records real files in the private `briefing-files` bucket. Save the draft first, upload to `<briefing-uuid>/<random-uuid>.<extension>`, then call `add_briefing_attachment(p_briefing_id,p_name,p_storage_path,p_mime_type,p_file_size)`. Allowed types are PNG, JPEG, WebP and PDF, up to 50 MiB. Draft access is required for upload/removal. Submission preserves read access for that client, agency and assigned production team. To remove a draft attachment call `remove_briefing_attachment(p_attachment_id)`, then remove its returned path from Storage. An unregistered file can also be removed while the briefing remains a draft.

`credit_requests` lets a client request 25, 50 or 100 credits through `request_credits(p_client_id,p_amount,p_note='')`. This never grants credits or charges a card. Agency users resolve the request through `fulfill_credit_request(p_request_id,p_note='')` or `reject_credit_request(p_request_id,p_note)`. Fulfillment is idempotent and returns the original ledger UUID on retries. Rejected requests cannot be fulfilled.

## Realtime

The `supabase_realtime` publication includes `projects`, `internal_comments`, `client_comments`, `notifications`, `publication_reviews`, `published_versions`, `design_versions` and `designs`, with **insert/update only**. Subscribers use their own authenticated session; SELECT RLS is evaluated for those events. Deleted-row events are disabled because they do not provide the same RLS filtering. Client comments never share a stream/table with internal comments. Project/recipient filters improve efficiency but are not the authorization boundary. Four simultaneous real subscriptions verify channel isolation, zero cross-client events and absence of deleted private row identifiers.

## Verification evidence

`supabase test db` covers deterministic fixture counts, role/tenant restrictions, profile escalation, confidential production data, separate channels, valid pin pairs and cross-project foreign keys, immutable snapshots, budget confirmation, insufficient balance, idempotent acceptance, ledger reconciliation, draft attachments, storage path boundaries and credit request fulfillment. `supabase db lint --local` checks SQL function validity. Test transactions roll back their mutations. HTTP/Auth/Storage verification is separate from database assertions and must be reported separately.

## Trusted media worker

The [media service](../../apps/media/README.md) runs separately from the web UI and stores its service credential only in its own environment. `POST /publications/prepare` receives `{versionId}`, downloads authorized internal image bytes and returns the design-to-path map consumed by `publish_version`. `POST /deliveries/prepare?projectId=<uuid>` receives a raw raster/PDF file and persists the regenerated delivery record. The health URL is `http://127.0.0.1:55430/health` locally.

The public `register_sanitized_asset` and `discard_sanitized_asset` functions grant execution only to `service_role`; neither can be called by a browser's authenticated role. Attestations stay in `private.sanitized_assets` and include internal source references that clients cannot query. `publish_version` verifies the attestation corresponds to the current source design/path. `add_delivery_file` verifies the attested project, prepared-by identity, MIME type and byte size.

PDF delivery is flattened to newly rendered page images and rebuilt as a new PDF. This removes original objects and metadata but intentionally does not retain editable vectors or searchable text. The worker does not accept video or ZIP delivery. Agency review remains responsible for content visibly drawn into an image or PDF; automatic metadata stripping does not redact visible names.

## Service validation

`service_catalog` and `format_catalog` preserve the 20 service types and 25 formats from the source catalog. Foreign keys prevent unknown IDs. On submission, the database checks service-compatible named deliverables, dimensions for fixed/fluid layouts, quantity and scope. Every declared service question is required in `direction.questions`; choice answers must match a catalog option and page counts must be positive whole-number strings. Drafts remain intentionally incomplete. Shared catalog tables are read-only to authenticated browser users.

## Additional verification commands

- `python3 supabase/tests/http_auth_storage_test.py`: nine real Auth/PostgREST/Storage integration tests.
- `npm --prefix apps/media test`: 14 raster/PDF regeneration tests across two files.
- `npm --prefix apps/media run test:integration`: 15 real worker pipeline checks, with temporary-object cleanup.
- `npm --prefix apps/media audit --omit=dev`: production dependency advisory check.
- `node supabase/tests/realtime_boundary_test.mjs`: real four-role subscription and deleted-event boundary check.
- `python3 supabase/tests/concurrent_workflows_test.py`: four concurrent workflow scenarios restricted to the disposable port-55521 backend.
- `python3 supabase/scripts/verify_seed.py`: exact all-client scenario, all 20 accepted service answers, ledger, version graph, 70 templates, artwork coverage per role and 108 actual file downloads. It also reads each artwork file's own PNG header and checks the pixel size against the format `format_catalog` records for the deliverable it belongs to, so a fixture that no longer matches its ordered format fails here rather than looking plausible on screen.
- `python3 supabase/scripts/verify_local.py`: final source-backend verification after browser mutations stop.

Database tests now also cover trusted-worker attestations, denied direct publication/delivery uploads, source mapping, submitted question validation and safe removal of unregistered brand files. Execute these commands against the isolated fixture environment, not a production database. Browser end-to-end checks are owned by the web application test suite and are not implied by these backend results.
