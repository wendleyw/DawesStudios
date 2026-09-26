# Application sitemap

Status: target architecture. Routes and behavior below are requirements, not claims that the application already implements them. Verification is tracked in [acceptance-matrix.md](acceptance-matrix.md).

## Source and scope

The product is Creative Canvas for Brianna Dawes Studios. The user has authorized a production-oriented implementation with xyflow for the board and project canvases and Docker-hosted Supabase for the backend. The older wireframe-only restriction in [the reference prompt](../ref/00-guia/PROMPT-NOVO-REPOSITORIO.md) is superseded. Its screens and workflows remain the experience reference.

The [reference manifest](../ref/manifest.json) contains 711 images representing 499 base states across Agency, Client, and Designer. This is a design inventory, not an exact-clone or screenshot-count acceptance gate. The current user direction is minimal, lightweight, and modern: consolidate equivalent states, remove duplicate controls, and preserve meaningful capabilities and information boundaries. Original hash routes identify reference captures; they do not define authorization or require production hash routing. English is the language of every new interface, route, document, and fixture.

## Route contract

The following paths are proposed canonical routes and may be consolidated during implementation when the same task remains clearly reachable. IDs identify persisted resources. Authentication and authorization determine the experience; neither a path prefix nor a role selector grants access. A person with several memberships chooses an authorized workspace or client context, not an arbitrary role.

| Route | Agency | Client | Designer | Purpose and reference |
|---|---|---|---|---|
| `/login` | Yes | Yes | Yes | Authenticate; return to an authorized intended destination. |
| `/auth/recovery` | Yes | Yes | Yes | Request a real recovery email; `?mode=update` completes the verified password reset. |
| `/auth/invite?token=:token` | Invitee | Invitee | Invitee | Validate a time-limited, single-use invitation before joining. |
| `/home` | Studio overview | One workspace → that client's Overview; several → the Home page | "My work" dashboard of assigned work | [Home and global actions](../ref/01-agencia/01-home-e-globais/README.md). |
| `/clients/:clientId/overview` | "What `<client>` sees" (read) | Own client, lands here | None (sent to the board) | Client welcome dashboard: numbers, what's moving, your turn, recently shipped. |
| `/clients/:clientId/board` | Workspace clients | Own client | Assigned work only | [Board](../ref/01-agencia/02-board/README.md); Five icon views: Canvas, List, Timeline, Kanban and Calendar. |
| `/clients/:clientId/briefings` | Read/create | Read/create | Assigned accepted only | [Briefing list](../ref/01-agencia/04-briefings/01-lista/README.md); All, Draft, With the studio (awaiting review and budget confirmed), In progress. |
| `/clients/:clientId/briefings/new` | Yes | Yes | No | Start a new Service → Details → Review flow with no inherited campaign; in-app links open a modal, direct loads use the full page. |
| `/clients/:clientId/briefings/:briefingId` | Read/review/accept | Read own client scope | Assigned accepted direction; no budget | Draft, submitted, quoted, insufficient balance, accepted result. |
| `/clients/:clientId/briefings/:briefingId/edit` | Authorized drafts | Own authorized drafts | No | Resume a persisted draft; validate every step. |
| `/projects/:projectId` | Full project | Sanitized project and publications | Assigned production | [Project canvas and inspector](../ref/01-agencia/03-projeto/README.md), with project/role Playground layer. |
| `/clients/:clientId/brand/files` | All project files | Published files | Assigned project files | Files, a Brand Hub section rather than a top-level destination; the old `/clients/:clientId/assets` redirects here with its query (`?project=`, `?campaign=`) ([reference](../ref/01-agencia/05-assets/README.md)); All/Approved, upload, detail/download. |
| `/clients/:clientId/reviews` | Agency and client review management | Own published reviews | No separate page | [Reviews](../ref/01-agencia/06-reviews/README.md); Waiting for review/Approved. Designers submit inside the assigned project. |
| `/clients/:clientId/brand/:section` | Read/edit | Read | Read when assigned to client work | Nine Brand Hub sections, Files among them. |
| `/clients/:clientId/brand/drafts/:draftId` | Own draft | Own draft | Own draft | Personal template editor; persistent and isolated from projects, billing, and other owners. |
| `/clients/:clientId/credits` | Read, quote, authorized adjustments | Read, request additional credits | No | [Credits](../ref/01-agencia/08-creditos/README.md); Balance & activity / Client report. |
| `/settings/workspace` | Agency | No | No | Settings → Studio: studio name, and the timezone every instant in the product is rendered in. |
| `/team` | Agency | No | No | Team membership, invitations, role changes, removal and active workload. `/settings/team` redirects here. |
| `/settings/clients` | Agency | No | No | Client list, new client creation, and each client's **People** (people and emails, pending invitations, invite and remove). |
| `/settings/presets` | Agency | No | No | Versioned service estimates and timing; canonical formats/questions remain unchanged. |
| `/settings/account` | Own account | Own account | Own account | Display name and real Auth password changes; a client person also sees one **Team** section per client (teammates, notification choice). |

The three product experiences are Agency, Client, and Designer. In this single-studio implementation, the protected Agency role owns administrative commands; Designer is the restricted production role. Every administrative operation is checked by the backend, independently of navigation visibility.

## URL and local state

Use query parameters for shareable, validated navigation state: board view/status/search/period, asset category, briefing tab, credit report period/campaign/project, selected project deliverable/version/design, and permitted comment channel. Invalid parameters fall back safely. IDs and channels in the URL are always reauthorized.

Board pan/zoom, inspector width, expanded sections, pending pin, unsent comment, and a template editor's current zoom are view state. Persist drafts to the signed-in owner when appropriate; clear or partition cached state when the authenticated user, workspace, client, project, design, or channel changes. A restored draft never crosses those scopes.

The active board view is saved per authenticated user and client in `board_preferences.active_view`. Playground opens as a fullscreen native dialog rising from the bottom over the entire viewport, including the sidebar and project header, without a separate route. Covered app navigation stays inert until close. Saved items persist per project/role; unfinished local drafts remain in memory and prompt before explicit close or ordinary app navigation. Opening from the design-upload dialog temporarily closes that dialog while retaining its mounted form and selected file; **Back to upload** reopens it after the layer slides back down.

Selecting a project version/design keeps the user inside the project canvas. The right inspector contains comments for that design and channel. Previous/Next design traverses only the same version's designs. Back to versions restores the project overview. Sharing creates a link to an authorized client destination; the link does not grant public access to private work.

## Shell and global actions

| Surface | Required behavior |
|---|---|
| Sidebar | Studio branding, authorized client switching, global destinations, collapse/expand, responsive navigation, active-route state, and keyboard skip-to-content. |
| Agency home | Cross-client overview with work requiring attention and links into projects; all ten seed clients are reachable. |
| Client home | Own board; no workspace client directory, designer identity, internal assignments, administrative settings, or internal review counts. Personal account settings remain available. |
| Designer home | My work and assigned projects; no other designers' unassigned work or client billing. |
| Global Search | Retired on 2026-09-24 at the user's request: it duplicated the board's search. Each page keeps its own search. |
| Notifications | Persisted recipient-scoped events, unread state, mark read, empty/error states, and authorized project destinations. |
| Account | Account/session actions for signed-in people; agency account surface additionally links workspace settings. |
| Help | Current product navigation help; do not present the old wireframe instructions as live system behavior. |
| Preview as | Agency-only non-mutating preview of sanitized perspectives if retained; never authentication, impersonation authority, or a client-visible control. |
| Reset preview | Isolated development/test dataset reset only; unavailable to ordinary production users. Resetting local view preferences must not delete backend data. |

## Board and project actions

Board offers five mutually exclusive icon views: Canvas, List, Timeline, Kanban and Calendar. The selected view persists per viewer/client. Floating identity/quarter and signed-in profile cards sit at the upper left/right. Visible text links beside the quarter show all client destinations, with an underline on the active section. These links also appear at the top of projects and other client pages, never duplicated in the sidebar; global actions and client switching remain there. All periods is the default; a panel shows year arrows and all four quarters without scrolling. Q1–Q4 filter overlapping project dates and retain undated work. A floating left toolbar holds board actions; on small or short screens it moves to the bottom, and search/filters use compact panels. Canvas contains campaign/project frames only. Timeline supports period navigation and three scales; Kanban groups the same projects by status without arbitrary status transitions; Calendar shows monthly due dates, undated work and a narrow-screen agenda. Search, campaign/status filters, selection and project destinations are shared across views. Canvas continues behind the floating header; structured views reserve space below it and contain their own scrolling. Campaign creation remains in Canvas; new work enters the briefing flow with explicit campaign confirmation. See the [board feature](../../apps/web/features/board/README.md).

Project creation appears as Add design cards beside editable artwork and Add version cards below each deliverable’s version stack. The agency’s shared-view cards start work in Working files; they never edit published snapshots. Actual client accounts retain review actions without production creation controls.

Every role with access to a project can open its own role's **Playground**. Its canvas supports notes, multiple image/document uploads, download, drag, resize, pan and zoom, with keyboard position/size fields. It is a separate brainstorming surface: no production upload, publication, credit debit or cross-role sharing results from adding an item. Saved content survives closing and reload; failed saves/removals expose recovery actions. The [Playground contract](playground-and-board-widgets.md) defines its scope and acceptance evidence.

Project columns group deliverables by format and stack versions vertically. Each version can contain multiple designs. The inspector exposes Properties, Briefing, Brand, Deliverables & credits, Files & delivery, Activity, and Messages according to permissions. Project properties include permitted status transitions, start/due dates, and internal designer assignment. Credits and assignment are never returned to a Designer and Client respectively.

Named dialogs/actions: Add design, New version with notes, Send to agency, Publish for client review, Request changes, Approve design, Delivery, Share link, and Copy link. The reviewer offers Select comments, Pin comment, pending-pin cancel, pin selection, comment send, image zoom/reset, and same-version design carousel. File uploads and downloads operate on real persisted files, with progress, validation, and failure handling.

## Briefing navigation

| Step | Sections and actions |
|---|---|
| Service | Search all 20 services and filter by category; select one primary service with a visible selection summary, estimate and timing; Continue. |
| Details / Project basics | Enter project title; explicitly choose an existing campaign or create one with name/optional goal; expand Search campaigns when needed. |
| Details / Deliverables | Choose allowed format badges; add/remove a deliverable or named same-format variation; edit custom name, quantity and Design approach; expand prefilled Size settings for dimension changes. |
| Details / Briefing | Overview and Goals; optional Audience, Messaging, Resources, Inspirations, Style, Notes; service-specific questions; Brand Hub defaults with explicit project overrides and restore-defaults action. |
| Details / Timing & files | Optional target date and attachments; Save draft to add files, then add/remove files; reject unsupported or oversized files with actionable feedback. |
| Review | Review campaign, service, deliverables, direction, date, and files; Back/Edit/Change service; Save draft or Send briefing. Sending does not debit credits. |
| Agency review | Confirm total project credits and explain required adjustments; show insufficient balance; accept once to create a project and debit once. Client can inspect status and open the accepted project/report. |

## Brand Hub navigation

All eight sections use the selected client context. Agency edits are persisted and audited; Client and assigned Designer receive read-only canonical brand data. Copy actions remain available to authorized readers. Templates has been retired and Products moved to the top of Assets; both routes redirect to Assets.

| Section slug | Name | Required surfaces/actions |
|---|---|---|
| `overview` | Brand Overview | Identity, segment, website, description, personality, audience, tone, visual direction, guidelines preview; agency edit/save/cancel. |
| `logos` | Logos | Eight variants: Primary, Secondary, Wordmark, Symbol/Icon, White, Black, Horizontal, Vertical; SVG/PNG/PDF format selection and variant details/use guidance. |
| `colors` | Colors | Named palette; HEX/RGB choice; copy HEX, RGB, CSS, Tailwind; agency edit and validation. |
| `typography` | Typography | Primary font, hierarchy and examples; custom sample text; font source link; agency edit. |
| `visual-style` | Visual Style | Four reference examples, photography Use/Avoid rules and direction; detail dialogs; agency edit. |
| `products` | Product Library | Product cards and per-product Assets, Specs, Rules tabs; multiple products including the three reference examples. |
| `assets` | Brand Assets | Search/category filters; All assets, Unfiled and named folders; agency create/rename/delete folder, choose upload destination and move asset; authorized preview/download/copy reference. Folder deletion retains files. |
| `messaging` | Copy & Messaging | Voice/tone, headlines, taglines, CTAs, product descriptions, claims, approved/forbidden terminology, avoid rules; copy reusable blocks; agency edit. |
| `ai` | AI Brand Instructions | Brand context with Use/Never rules; agency edit; generate/copy text and manual-copy fallback. This is a context document, not an implied external AI service. |

Existing owner-private draft URLs remain available with the shared editor, persisted changes, revision checks and a return link to Assets. The gallery and new-draft action are removed; existing templates and drafts are retained without billing or project changes.

## Credits and administration

Credits contains plan information, balance/consumption, activity search, All/Project debits/Credits added filters, and a client report filtered by period, campaign, and project. Deliverable breakdown explains the single project debit; agency adjustments retain their explanation. CSV export reflects the active authorized report and supports empty selections.

Additional-credit packages retain the reference choices of 25, 50, and 100 credits. A production client action creates a request or invokes an explicitly configured payment flow; it does not grant itself credits. Authorized agency allocation records an audited ledger entry. Isolated test mode can exercise simulated fulfillment without claiming a real payment. A future payment integration must document and test its own settlement contract.

Settings contains Studio, Clients, Presets, and Your account. Team has its own agency-only route at `/team`. Save, invite, and create actions require actual persistence and visible success/error results. Development invitation delivery may use a local mail capture service. Production readiness must separately establish actual invitation delivery and environment configuration; a toast alone is not an invitation. Removing a client's person goes through `POST /api/clients/:clientId/members/:profileId/remove`, which also blocks sign-in when it was their last client.

## Empty, error, and responsive states

Preserve no projects, empty campaign, first client board, no filter/search matches, no messages, pending comment pin, no shared version yet, no reviews, no assets, no credit activity, no notifications, and no personal drafts. Distinguish a legitimate empty state from loading, transport failure, lost authorization, and unavailable/deleted resources. Missing project and expired/unavailable template links provide a safe way back without revealing whether another tenant owns the ID.

Persisted records survive reload and process restart; old session-only expiration is replaced with a genuine unavailable-resource state. Forms retain recoverable input after a retryable error. Modals manage focus, close/cancel correctly, and cannot hide primary actions behind viewport edges. Visual verification includes the 1600 × 1000 reference viewport plus smaller desktop, tablet, and mobile adaptations. It assesses hierarchy, alignment, spacing, readability, minimalism, and useful task completion; it does not require duplicating each captured modal, scroll position, or toast.
