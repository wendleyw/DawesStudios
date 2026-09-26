# Permissions and information boundaries

Status: target security contract; implementation is unverified. The [acceptance matrix](acceptance-matrix.md) requires authenticated API, database, storage, realtime, and browser evidence before these boundaries can be considered enforced.

## Identity and scope

This installation serves one agency/studio and its isolated client workspaces. Every request has a verified person, a protected role, and authorized client/project scope. Agency members act within this studio; clients are limited to their client membership; designers are limited to explicitly assigned projects and the brand resources needed for those projects. IDs, UI flags, role selectors, client-provided author IDs, and hidden buttons are never authorization. A separate multi-agency SaaS tenancy layer is outside the current product scope.

Agency administration is an explicit capability for membership, workspace, preset, and credit-allocation changes. A revoked membership or assignment stops new reads, writes, subscriptions, and file access; cached data must be evicted or partitioned on context changes.

## Action matrix

`Scoped` means the same workspace/client/project constraints apply on the server. `Own` also requires the authenticated person to own the record. No access is the default.

| Resource / action | Agency | Client | Designer |
|---|---|---|---|
| Studio-wide overview/client directory | Scoped | No | No |
| Own workspace/client session | Scoped | Own client | Assigned scope |
| Browse brand asset folders | Scoped | Own client | Assigned client |
| Create/rename/delete folders and move brand assets | Scoped agency capability | No | No |
| Search and notifications | Scoped | Own client and recipient | Assigned and recipient |
| View board/campaigns/project summaries | Scoped | Own client, sanitized | Assigned projects only |
| Save board view | Own preference, scoped client | Own preference, own client | Own preference, assigned client |
| Read/change another viewer's board preference | No implicit access | No | No |
| Read/write Playground notes and files | Agency board in authorized project | Client board in own project | Designer board in assigned project |
| Read another role's Playground | No implicit access | No | No |
| Create campaign | Scoped | Own client, including briefing | No |
| Edit campaign planning | Scoped | No implied production authority | No |
| View briefing list and detail | Scoped | Own client | Safe assigned accepted list/detail; no budget |
| Create and save briefing | Scoped | Own authorized draft | No |
| Edit submitted/accepted briefing | Explicit controlled revision | No direct overwrite | No |
| Submit briefing | Scoped authorized draft | Own authorized draft | No |
| Quote and accept briefing | Scoped agency capability | View only | No |
| Project debit and credit report | Read, authorized commands | Own client read | No |
| Request additional credits | Scoped | Own client | No |
| Grant/adjust credits | Agency administrator, audited | No | No |
| Designer assignment and staff directory | Scoped agency capability | Never | Own assignment only |
| Project properties/status | Valid agency transitions | Client review commands only | Valid production transitions on assigned work |
| Read internal versions/designs | Scoped | No | Assigned work |
| Upload design/create version | Scoped | No | Assigned work |
| Submit design/version to agency | Scoped internal workflow | No | Assigned work |
| Publish immutable client version | Agency only | No | No |
| Read published version | Scoped | Own client | Assigned work if needed for production, without client messages |
| Client-channel project/design comments | Read/write as Studio | Read/write own client | No |
| Internal-channel project/design comments | Read/write | Never | Read/write assigned work |
| Pinned design comments | Authorized design and channel | Published design and client channel | Assigned design and internal channel |
| Client approval/change request | Manage workflow; do not impersonate client | Published review only | No |
| Agency internal approval/change request | Scoped | No | Receive internal result |
| Attach and publish delivery files/mark delivered | Agency only | No | Prepare internal files only |
| Download production files | Scoped | Published/delivered files only | Assigned production files |
| Canonical Brand Hub read | Scoped | Own client | Brand resources for assigned client |
| Canonical Brand Hub edit/create | Agency only | No | No |
| Copy brand text/context/color/reference | Scoped | Own client | Assigned client |
| Create/read/update template draft | Own | Own | Own, assigned client scope |
| Read another person's template draft | No implicit access | No | No |
| Workspace/team/client/preset administration | Agency administrator | No | No |
| Preview another perspective | Agency-only sanitized, non-mutating view | No | No |
| Reset test dataset | Isolated local/test operator only | No | No |

The source [permissions guide](../ref/00-guia/PERFIS-E-PERMISSOES.md) and [control inventory](../ref/00-guia/CONTROLES-E-OPCOES.json) include controls that were safe only because the wireframe mutated memory. Production controls must invoke the capability and state transition specified here. The agency's reference approval control may approve an internal submission; it must not forge a client's approval event.

## Client-facing projection

Client payloads contain only authorized public project metadata, approved briefing scope and credit information, published design snapshots, client-channel conversation, approved brand resources, client-safe activity, and the client's own role-scoped Playground content and personal board preferences. Agency messages are presented as **Studio**.

Never serialize designer names, avatars, emails, staff membership IDs, assignment relations, internal author metadata, internal comments, unpublished versions, internal notes, internal activity, internal notification counts, or storage paths containing private identity. Do not fetch these fields and hide them with CSS. Apply the restriction to nested relations, search results, reports, CSV, notifications, realtime events, error details, file names, downloadable file metadata, and browser caches.

A published design uses immutable file content and sanitized customer-visible metadata. Internal editing does not replace its bytes or mutate its snapshot. Publishing a later revision creates a new publication and keeps review/comment history bound to the prior publication. Client summaries may show that work is in progress before anything is published, with an explicit **Not shared yet** state; they must not include production design payloads.

Designer briefing reads use `get_assigned_briefings`, which omits author, estimate, confirmed credits, and budget note. Raw briefing table access is denied to designers. Designer-visible projections include the project direction, deliverables, deadlines, assigned production versions, internal agency conversation, and needed brand resources. They exclude client-channel messages, client contact details not required for production, client billing, workspace-wide staff directories, and other designers' unassigned work.

## Playground and presentation preferences

Playground is a role collaboration space, separate from production and publication. `private.can_access_playground` requires the board's role to equal the caller's current protected role and verifies its client/project relationship and current access. No role, including agency, has implicit access to another role's board. Removed members lose authenticated access; a designer requires current assignment access to that project. A project is mandatory; workspace-only legacy boards remain archived without authenticated RPC, table or Storage access. Note/file rows expose no author identity. See [backend contracts](backend.md#playground-and-board-preferences).

The private `playground-assets` bucket uses `<board UUID>/<item UUID>/<safe filename>`. Role/scope checks protect reads and signing; unclaimed staging also requires uploader ownership. The backend independently validates supported MIME, file size, matching item/path and revisions. Storage cannot overwrite an existing attachment or delete a live attached file. Tombstoned files remain eligible for scoped cleanup; caller-owned unclaimed uploads become eligible after 24 hours. A retry cannot replace newer content or switch an item's attachment. Existing signed URLs remain subject to the expiry limitation below.

The selected board view belongs to one viewer and client. `board_preferences` RLS requires `user_id = auth.uid()` and current client access for reads/writes. `save_board_view` accepts no owner parameter and validates its five identifiers in PostgreSQL. View changes affect presentation only and grant no additional project access. Legacy widget preferences remain private and preserved for compatibility.

## Comments and pins

Each conversation has an explicit channel: `client` for Client ↔ Studio, or `internal` for Designer ↔ Agency. The backend resolves the permissible channel from the caller and resource. An agency user explicitly chooses a channel; changing channels clears or restores only the matching channel's draft.

A design thread identifies workspace, client, project, version or publication, design or published design, and channel. A project conversation omits the design anchor but retains project and channel. Every referenced parent must belong to the same authorized hierarchy. A pending pin becomes visible to others only when its comment is successfully persisted. Coordinates are normalized in the design's own bounds. A client comment references a published design, never an internal version by guessed ID.

Authors are set from the authenticated identity. Comments cannot carry a forged author, role, tenant, design, or channel. Client-safe author presentation is a server-controlled projection. Text and links are rendered safely; messages and uploaded metadata never become executable HTML.

## Product decisions

Boundaries recorded here are intentional. An undocumented one reads as a defect to the next person who finds it; write it down instead of leaving it to be "fixed."

### A designer sees a client's decision, not the client's words

**Decision.** An assigned designer can see that a client requested changes to a published version — the project heading and the designer's review list both read `Changes requested` — but cannot read the change request's feedback text. The agency relays that feedback, translated and contextualized, through the internal channel instead. This is intentional: the agency is the interface between client and designer in both directions, so client feedback reaches the designer through the agency rather than directly.

**Mechanism.** Three independent things enforce it:
- `published_versions` carries no internal version id, so a designer reading it has no column to join a review against.
- The only table joining an internal `design_versions` id to its `published_versions` publication is `private.publication_sources`. `supabase/config.toml` sets `schemas = ["public"]`, so the `private` schema — and that join — is unreachable to any API caller, designer included.
- `publication_reviews`'s `reviews_read` policy resolves through `private.can_client_channel`, which is true for the agency or a client member of the project's client and false for a designer regardless of assignment. The policy admits agency and client only.

Reversing any one of the three alone would not change the outcome; all three would need to change together, which is why this is a schema and role-boundary decision rather than something a data or UI fix could touch.

**Reference.** Measured while resolving [Defect F-1](../verification/acceptance-family-f.md#defect-f-1-a-designer-never-learns-the-client-requested-changes); recorded against acceptance row **F15** in [acceptance-matrix.md](acceptance-matrix.md), whose "Not covered" note points back here.

### Revocation cannot reach a credential that was already issued

**Decision.** Two credentials in this installation survive the act that revokes the access behind
them, because neither is checked against live authorization once it exists. Neither is repairable
without replacing the mechanism, so each is bounded by an expiry instead, and both expiries are
deliberate numbers rather than defaults.

**Mechanism — the access token.** PostgREST validates an access token's signature and expiry and
nothing else. It never asks GoTrue whether the session still exists, and GoTrue holds no revocation
list a resource server could consult. Signing out destroys the refresh token and the browser's copy,
so the session cannot be continued — but a token already in someone else's hands keeps reading and
writing until it expires on its own.

**Measurement.** Acceptance family C signed a client in, called `logout?scope=global`, and then used
the same access token: `/auth/v1/user` answered `403` and the refresh token was gone, while
`/rest/v1/clients`, `projects`, `published_designs`, `client_comments`, `credit_accounts`,
`notifications` and `brand_sections` all answered `200`, and `rpc/post_comment` created a row. The
access token's expiry is therefore the entire post-sign-out exposure window.

**Number.** `supabase/config.toml` sets `jwt_expiry = 900` — fifteen minutes, not the Supabase
default of 3600. That is the window, and it is the only thing that shortens it short of putting a
session check in front of PostgREST. `supabase-js` refreshes transparently in the background, so the
cost is four times as many refresh calls and nothing a user can observe. A freshly issued token was
decoded after the change: `exp - iat = 900`.

**Mechanism — the signed storage URL.** A Storage signature's claim body is `{url, iat, exp}`. It
carries no subject and no session, so there is nothing in it to check against the caller's current
grants and nothing to revoke. Storage verifies the signature and the path and serves the bytes to
whoever presents the link, authenticated or not.

**Measurement.** A designer minted a signed URL for an internal object under an assignment they held.
`revoke_design_assignment` then removed every other route to it — the project disappeared from the
designer's reads, the direct object request answered `400`, and re-signing answered `400 Object not
found` — while the already-minted URL kept serving the file anonymously at `200`, 2,726 bytes, for
its full TTL.

**Number.** `THUMBNAIL_TTL` in `apps/web/features/board/board-data.ts` is **600** seconds, reduced
from 3600. Every other signing site in the product is already short — `project-data.ts` 300,
`brand-data.ts` 300 and 600 — and the board was the outlier by six to twelve fold. 600 matches the
nearest sibling and is the shortest value the board can take without a second cost: the board's React
Query `staleTime` is derived as `THUMBNAIL_TTL - 300`, a margin that re-mints the URLs before they go
blank, and 300 would flatten that margin to zero and re-sign on every render. The board re-mints on
render, so a board left open longer than ten minutes simply signs again. Playground uses 600-second
image previews and 60-second download links; its open query polls every 60 seconds to renew previews
and discover collaborator changes. These links carry the same expiry-bound authorization window.

**Reference.** Measured as [Defect C-1](../verification/acceptance-family-c.md#defect-c-1--an-access-token-keeps-working-after-sign-out)
and [Defect C-2](../verification/acceptance-family-c.md#defect-c-2--a-signed-storage-url-outlives-the-authorisation-that-minted-it);
recorded against acceptance rows **C01** and **C07** in [acceptance-matrix.md](acceptance-matrix.md).
Both numbers are load-bearing: raising either one widens a revocation window, and neither is a tuning
knob.

## Atomic commands

| Command | Authorization and invariant |
|---|---|
| Accept briefing | Agency; same-client campaign; submitted immutable scope; valid quote and explanation; sufficient balance; one transaction creates exactly one project and one debit. Duplicate or concurrent requests return the original result or fail without partial records. |
| Publish version | Agency; version belongs to the project; snapshot contains only intended designs and immutable authorized files; no internal identities/channels; publication/review/event written consistently. |
| Submit review | Authorized reviewer and pending review; targeted publication/version is current for that review; one terminal decision; change request includes actionable feedback. |
| Mark delivered | Agency; required client approval exists for the delivered publication; all advertised files exist and are authorized; delivery is durable and idempotent. |
| Allocate credits | Agency administrator or verified settlement worker; positive validated amount; immutable ledger reason/reference; idempotency key; no browser service secret. |
| Create/accept invitation | Agency administrator creates scoped invitation; valid unexpired single-use token; invitee identity verified; cannot choose extra permissions from request parameters. |
| Upload/download asset | Authorized parent; enforced file policy and size; private storage; ownership cannot be changed through an object key; publication access never implies internal bucket access. |
| Update role or assignment | Agency capability; validated target in workspace; audit trail; revoked access invalidates affected subscriptions and sessions as applicable. |

## Negative security cases

Tests must issue direct requests as unauthenticated, Client A, Client B, assigned Designer A, unassigned Designer B, and Agency. Repeat against reads, writes, downloads, subscriptions, CSV, search, and notification endpoints. Check cross-client parent combinations within this single-studio installation; no second studio tenancy layer is required. Agency administrative capability currently follows the protected Agency role; introducing finer-grained staff permissions later must preserve these existing boundaries.

Attempt ID substitution, forged author/role/channel/client IDs, invalid parent combinations, privilege escalation, stale session reuse, duplicate/concurrent acceptance, overdraft, double fulfillment, republishing via mutable file replacement, and HTML/script injection in titles/comments/file metadata. Verify denial and unchanged persisted state. UI-only role checks do not satisfy these cases.

Supabase policies, database constraints/transactions, API authorization, and storage policies must agree. Secret/service credentials remain in backend-only configuration. Privileged server code rechecks the same caller scope before operating with elevated database permissions. Audit records retain actor/action/target/time without leaking private payloads into client-readable event feeds.

## Team removal

Agency members manage Team at `/team`. Removing a member first sets `profiles.removed_at` in a transaction that revokes every assignment and records one audit event. Role-based database access ends immediately, including for existing JWTs; notification generation and read policies exclude removed members. Auth banning follows through the trusted server route, and only its successful completion sets `removal_completed_at`. A failed second step leaves a visible, retryable pending removal.

The last-agency guard counts active members only. Role changes, removal, assignment and invitation acceptance share a transaction lock and recheck caller access after waiting. Removed profiles cannot be reactivated through those operations. Profiles and authored history are preserved. Previously issued signed file URLs remain valid until their existing expiry; this change does not claim to revoke already-delivered bytes or signed URLs.

## Client people

A client can have several people, each with their own login; permissions inside a client are the
same for everyone. Only the studio adds (by invitation) and removes them. `client_team(p_client_id)`
is the one widened read: the client's active client-role people with their sign-in emails, returned
to the studio and that client's own people and to nobody else. Profile and membership policies do
not widen, designers are never part of a team, and another client's people are never returned.
Briefings (`requested_by`) and review decisions (`reviewed_by`) store a person's id; a client names
them only through `client_team` and reads someone who left as "Former member", and designers read
neither column.

Removing someone from one client (`remove_client_member`, audited) deletes that membership and that
client's notifications for them; a person who still belongs to another client keeps their login.
Removing their last client sets `removed_at` like a team removal, so every role-based read ends at
once, existing tokens included, and `/api/clients/{clientId}/members/{profileId}/remove` then blocks
sign-in and sets `removal_completed_at`. Project notifications reach the project's requester, people
who chose all activity and, for a studio reply, the people who wrote in that conversation; the
actor and removed people never receive them.
