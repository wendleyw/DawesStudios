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
| `/home` | Studio overview | Redirect to own client board | My work | [Home and global actions](../ref/01-agencia/01-home-e-globais/README.md). |
| `/clients/:clientId/board` | Workspace clients | Own client | Assigned work only | [Board](../ref/01-agencia/02-board/README.md); Canvas/List and Timeline/Kanban planning. |
| `/clients/:clientId/briefings` | Read/create | Read/create | Assigned accepted only | [Briefing list](../ref/01-agencia/04-briefings/01-lista/README.md); All, Draft, Awaiting review, In progress. |
| `/clients/:clientId/briefings/new` | Yes | Yes | No | Start a new Type → Details → Review flow with no inherited campaign. |
| `/clients/:clientId/briefings/:briefingId` | Read/review/accept | Read own client scope | Assigned accepted direction; no budget | Draft, submitted, quoted, insufficient balance, accepted result. |
| `/clients/:clientId/briefings/:briefingId/edit` | Authorized drafts | Own authorized drafts | No | Resume a persisted draft; validate every step. |
| `/projects/:projectId` | Full project | Sanitized project and publications | Assigned production | [Project canvas and inspector](../ref/01-agencia/03-projeto/README.md). |
| `/clients/:clientId/assets` | All project assets | Published assets | Assigned project assets | [Project asset library](../ref/01-agencia/05-assets/README.md); All/Approved, upload, detail/download. |
| `/clients/:clientId/reviews` | Agency and client review management | Own published reviews | No separate page | [Reviews](../ref/01-agencia/06-reviews/README.md); Waiting for review/Approved. Designers submit inside the assigned project. |
| `/clients/:clientId/brand/:section` | Read/edit | Read | Read when assigned to client work | Ten Brand Hub sections listed below. |
| `/clients/:clientId/brand/drafts/:draftId` | Own draft | Own draft | Own draft | Personal template editor; persistent and isolated from projects, billing, and other owners. |
| `/clients/:clientId/credits` | Read, quote, authorized adjustments | Read, request additional credits | No | [Credits](../ref/01-agencia/08-creditos/README.md); Balance & activity / Client report. |
| `/settings/workspace` | Agency | No | No | Studio name and timezone. |
| `/settings/team` | Agency | No | No | Team memberships, invitations, assignment availability. |
| `/settings/clients` | Agency | No | No | Client list and new client creation. |
| `/settings/presets` | Agency | No | No | Versioned service estimates and timing; canonical formats/questions remain unchanged. |
| `/settings/account` | Own account | Own account | Own account | Display name and real Auth password changes. |

The three product experiences are Agency, Client, and Designer. In this single-studio implementation, the protected Agency role owns administrative commands; Designer is the restricted production role. Every administrative operation is checked by the backend, independently of navigation visibility.

## URL and local state

Use query parameters for shareable, validated navigation state: board view/status/search/period, asset category, briefing tab, credit report period/campaign/project, selected project deliverable/version/design, and permitted comment channel. Invalid parameters fall back safely. IDs and channels in the URL are always reauthorized.

Board pan/zoom, inspector width, expanded sections, pending pin, unsent comment, and a template editor's current zoom are view state. Persist drafts to the signed-in owner when appropriate; clear or partition cached state when the authenticated user, workspace, client, project, design, or channel changes. A restored draft never crosses those scopes.

Selecting a project version/design keeps the user inside the project canvas. The right inspector contains comments for that design and channel. Previous/Next design traverses only the same version's designs. Back to versions restores the project overview. Sharing creates a link to an authorized client destination; the link does not grant public access to private work.

## Shell and global actions

| Surface | Required behavior |
|---|---|
| Sidebar | Studio branding, authorized client navigation, current client modules, collapse/expand, responsive navigation, active-route state, and keyboard skip-to-content. |
| Agency home | Cross-client overview with work requiring attention and links into projects; all ten seed clients are reachable. |
| Client home | Own board; no workspace client directory, designer identity, internal assignments, administrative settings, or internal review counts. Personal account settings remain available. |
| Designer home | My work and assigned projects; no other designers' unassigned work or client billing. |
| Global Search | Search overlay with keyboard shortcut, scope-safe clients/projects, results, no results, keyboard navigation, and selected-result navigation. |
| Notifications | Persisted recipient-scoped events, unread state, mark read, empty/error states, and authorized project destinations. |
| Account | Account/session actions for signed-in people; agency account surface additionally links workspace settings. |
| Help | Current product navigation help; do not present the old wireframe instructions as live system behavior. |
| Preview as | Agency-only non-mutating preview of sanitized perspectives if retained; never authentication, impersonation authority, or a client-visible control. |
| Reset preview | Isolated development/test dataset reset only; unavailable to ordinary production users. Resetting local view preferences must not delete backend data. |

## Board and project actions

Board combines an xyflow campaign/project canvas with a collapsible planning frame. The frame offers Timeline with Previous week, Next week, and Today, plus Kanban with valid role-specific transitions. A list view shows the same scoped records. Search, status filters, Pan/Select, zoom, Fit to screen, and open-project actions work consistently. New campaign accepts a name and optional goals/dates; new project enters the briefing flow. An explicitly invoked campaign action may identify the intended campaign, but the new briefing still requires the user to confirm its campaign in Details.

Project columns group deliverables by format and stack versions vertically. Each version can contain multiple designs. The inspector exposes Properties, Briefing, Brand, Deliverables & credits, Files & delivery, Activity, and Messages according to permissions. Project properties include permitted status transitions, start/due dates, and internal designer assignment. Credits and assignment are never returned to a Designer and Client respectively.

Named dialogs/actions: Add design, New version with notes, Send to agency, Publish for client review, Request changes, Approve design, Delivery, Share link, and Copy link. The reviewer offers Select comments, Pin comment, pending-pin cancel, pin selection, comment send, image zoom/reset, and same-version design carousel. File uploads and downloads operate on real persisted files, with progress, validation, and failure handling.

## Briefing navigation

| Step | Sections and actions |
|---|---|
| Type | Paginated catalog of all 20 services; select a single primary service; show suggested formats, estimate and timing; Previous/Next types; Continue. Do not restore the removed introductory heading, search, or filter row. |
| Details / Campaign | Choose existing campaign with search/no results or create one with name/optional goal; explicitly confirm campaign and enter project title. |
| Details / Deliverables | Choose allowed format badges; add/remove a deliverable or named same-format variation; edit custom name, valid dimensions/units, quantity, and Original/Adaptation scope. |
| Details / Briefing | Overview and Goals; optional Audience, Messaging, Resources, Inspirations, Style, Notes; service-specific questions; Brand Hub defaults with explicit project overrides and restore-defaults action. |
| Details / Timing & files | Optional target date and attachments; add/remove files; reject unsupported or oversized files with actionable feedback. |
| Review | Review campaign, service, deliverables, direction, date, and files; Back/Edit/Change type; Save draft or Send briefing. Sending does not debit credits. |
| Agency review | Confirm total project credits and explain required adjustments; show insufficient balance; accept once to create a project and debit once. Client can inspect status and open the accepted project/report. |

## Brand Hub navigation

All ten sections use the selected client context. Agency edits are persisted and audited; Client and assigned Designer receive read-only canonical brand data. Copy and personal-template actions remain available to authorized readers.

| Section slug | Name | Required surfaces/actions |
|---|---|---|
| `overview` | Brand Overview | Identity, segment, website, description, personality, audience, tone, visual direction, guidelines preview; agency edit/save/cancel. |
| `logos` | Logos | Eight variants: Primary, Secondary, Wordmark, Symbol/Icon, White, Black, Horizontal, Vertical; SVG/PNG/PDF format selection and variant details/use guidance. |
| `colors` | Colors | Named palette; HEX/RGB choice; copy HEX, RGB, CSS, Tailwind; agency edit and validation. |
| `typography` | Typography | Primary font, hierarchy and examples; custom sample text; font source link; agency edit. |
| `visual-style` | Visual Style | Four reference examples, photography Use/Avoid rules and direction; detail dialogs; agency edit. |
| `products` | Product Library | Product cards and per-product Assets, Specs, Rules tabs; multiple products including the three reference examples. |
| `assets` | Brand Assets | Search, categories, no results/clear filters, thirteen asset categories, detail with format/use guidance, copy reference, agency create. |
| `templates` | Templates | All/Social/Commerce/Web; seven templates; Use template creates an owned draft; list own drafts and resume editing. |
| `messaging` | Copy & Messaging | Voice/tone, headlines, taglines, CTAs, product descriptions, claims, approved/forbidden terminology, avoid rules; copy reusable blocks; agency edit. |
| `ai` | AI Brand Instructions | Brand context with Use/Never rules; agency edit; generate/copy text and manual-copy fallback. This is a context document, not an implied external AI service. |

Reference template types: Instagram Post (1080 × 1350), Instagram Story (1080 × 1920), Amazon A+ (1464 × 600), Amazon Gallery (2000 × 2000), Website Hero (1920 × 1080), TikTok (1080 × 1920), Meta Ads (1080 × 1080). Use one schema-driven editor for design name, headline, body, CTA, preview and zoom, with persisted owner-scoped changes and a return link. The reference zoom choices are 50/75/100/125%; an equally usable continuous control is an intentional simplification, not missing functionality.

## Credits and administration

Credits contains plan information, balance/consumption, activity search, All/Project debits/Credits added filters, and a client report filtered by period, campaign, and project. Deliverable breakdown explains the single project debit; agency adjustments retain their explanation. CSV export reflects the active authorized report and supports empty selections.

Additional-credit packages retain the reference choices of 25, 50, and 100 credits. A production client action creates a request or invokes an explicitly configured payment flow; it does not grant itself credits. Authorized agency allocation records an audited ledger entry. Isolated test mode can exercise simulated fulfillment without claiming a real payment. A future payment integration must document and test its own settlement contract.

Settings preserves Workspace, Team, Clients, and Presets. Save, invite, and create actions require actual persistence and visible success/error results. Development invitation delivery may use a local mail capture service. Production readiness must separately establish actual invitation delivery and environment configuration; a toast alone is not an invitation.

## Empty, error, and responsive states

Preserve no projects, empty campaign, first client board, no filter/search matches, no messages, pending comment pin, no shared version yet, no reviews, no assets, no credit activity, no notifications, and no personal drafts. Distinguish a legitimate empty state from loading, transport failure, lost authorization, and unavailable/deleted resources. Missing project and expired/unavailable template links provide a safe way back without revealing whether another tenant owns the ID.

Persisted records survive reload and process restart; old session-only expiration is replaced with a genuine unavailable-resource state. Forms retain recoverable input after a retryable error. Modals manage focus, close/cancel correctly, and cannot hide primary actions behind viewport edges. Visual verification includes the 1600 × 1000 reference viewport plus smaller desktop, tablet, and mobile adaptations. It assesses hierarchy, alignment, spacing, readability, minimalism, and useful task completion; it does not require duplicating each captured modal, scroll position, or toast.
