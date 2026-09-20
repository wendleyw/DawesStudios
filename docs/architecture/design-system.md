# Design system and acceptance criteria

Status: design direction and acceptance criteria. Representative reference inspection is complete; application conformance has not been audited by this document. An unchecked requirement remains unverified.

## Evidence and interpretation

The local reference package is visual inspiration, captured on September 20, 2026. Its [manifest](../ref/manifest.json) contains 711 screenshots: 306 agency, 247 client, and 158 designer captures. Every manifest viewport and all representative images inspected are 1600 × 1000. Scroll captures continue the same screen; they are not separate routes. See [reference-map.md](reference-map.md) for exact paths and route families. The user explicitly requested a fresh minimalist, lightweight, modern product; neither screenshot count nor pixel fidelity is an acceptance target.

The screenshots are a monochrome interaction prototype. Learn from the restrained surfaces, compact navigation, review workflow, and role boundaries while simplifying visible chrome and consolidating equivalent screens. The current production request supersedes the reference guides' earlier instruction to keep changes in memory. Persistence, authentication, file delivery, and permission checks require real implementations; prototype reset controls and simulated success messages are not product requirements. Keep technical architecture out of product copy unless it helps a user make a decision.

Numeric values below have one of three meanings:

- **Measured**: observed image dimensions, sampled flat colors, or visible screenshot boundaries.
- **Inferred**: approximate typography and spacing reconstructed from raster images, not extracted source CSS.
- **Decision**: an implementation rule covering production behavior or unrepresented responsive states.

## Brand and visual direction

Use the supplied [Brianna Dawes Studios logo](../../brand/brianna-dawes-studios.webp). It is a 2409 × 619 RGBA asset with a white wordmark and organic symbol, approximately 3.892:1. Preserve its aspect ratio, transparency, and complete composition. Do not recreate the wordmark in a UI font, replace the symbol with initials, or stretch the image. Its light artwork belongs on the dark navigation surface. A 156 × 40 display area is an inferred starting point for the desktop sidebar, with `object-fit: contain`.

The brand's italic “Studios” lettering is part of the image, not the application's body typeface. Client artwork may have its own brand colors; application navigation, buttons, status chrome, charts, and canvas controls remain monochrome. Actual asset thumbnails replace the prototype's grey illustrative placeholders when a real file exists.

## Shared tokens

The shared shell styles are implemented in [globals.css](../../apps/web/app/globals.css). The following product values reflect that initial implementation; measured reference values are identified separately. Functional and visual conformance remain subject to the audit gate.

| Token | Target | Basis and use |
|---|---|---|
| `color.canvas` | `#f6f6f4` | Implemented lighter workspace; reference dominant background was `#ededed` |
| `color.surface` | `#ffffff` | Measured panels and topbar |
| `color.surfaceSubtle` | `#f1f1ee` | Implemented subtle control surface; reference used `#f4f4f4` |
| `color.navigation` | `#222321` | Implemented dark navigation; reference was `#202020` |
| `color.navigationActive` | `#393b34` | Implemented selected navigation; reference was `#353535` |
| `color.text` | `#252523` | Implemented primary copy, headings, icons |
| `color.textMuted` | `#6c6c67` | Implemented secondary text on light surfaces |
| `color.textOnDark` | `#ffffff` | Decision: primary navigation and filled buttons |
| `color.textMutedOnDark` | `#bfc1b8` | Implemented secondary navigation copy |
| `color.border` | `#e3e3df` | Implemented surface rules; measured home reference was `#e0e0e0` |
| `color.controlBorder` | `#cacac4` | Implemented stronger input boundary |
| `color.primary` | `#252523` | Implemented filled primary action |
| `color.focus` | `#252523` | Implemented 2 px ring with 4 px offset; inverted ring on dark surfaces |
| `color.canvasDot` | `#d4d4d0` | Board component uses a 1 px dot at a 20 px grid step at 100% zoom |
| `radius.small` | `8px` | Implemented controls; reference was approximately 4 px |
| `radius.medium` | `12px` | Implemented panels/cards; dialogs use 14 px corners |
| `radius.round` | `999px` | Decision: only avatars, pins, and circular marks |
| `border.default` | `1px solid` | Measured surface separation |
| `shadow.surface` | `none` | Shell/list/workspace cards use borders; draggable board cards have a subtle 2% shadow |
| `shadow.overlay` | `0 20px 64px rgb(25 27 21 / 16%)` | Implemented dialogs only |

Spacing uses `4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 64px`. These form an inferred four-pixel scale. Prefer 8–12 px within a compact control group, 16–24 px inside panels, 24–32 px between sections, and 36–40 px at large content boundaries. Add a new spacing value only when a named component requires it.

The screenshots do not identify a font file. The implementation uses Geist supplied by [the application layout](../../apps/web/app/layout.tsx), followed by `ui-sans-serif`, `system-ui`, and `sans-serif`. Body text is 14 px / 1.5, navigation 12 px, table project names 13 px, supporting copy 12–13 px, section headings 18 px, and page headings a fluid 28–36 px. Summary figures are 36 px. Compact badges and eyebrows use 10–11 px, with important action copy at 13 px; their readability remains an explicit audit item. Use weight 400 for body, 500 for controls/page headings, and 550 for section headings. Avoid all-caps prose; short section eyebrows use restrained tracking.

## Reference geometry and fresh shell decisions

The following measurements explain the source hierarchy. They are not pixel-level acceptance constraints. The initial implementation uses a 240 px desktop sidebar, a quiet 64 px topbar, 36 px desktop content inset, and 1224 px maximum home wrapper including padding (1152 px content). The sidebar narrows to 224 px below 1200 px and becomes a drawer below 901 px. The collapsed desktop rail is 76 px. A 360 px contextual inspector is the recommended project-side-panel starting point. Let the canvas fill the remaining work area; avoid stacking multiple persistent toolbars above it.

| Region | Desktop target | Evidence / behavior |
|---|---|---|
| Sidebar | 248 px wide, full viewport height | Measured agency, client, and designer captures |
| Brand area | Approximately 82 px tall; 20 px horizontal inset | Inferred from home capture |
| Navigation row | 36 px high; 12 px outer inset | Measured home selection is x=12 to x=236 |
| Nested client navigation | Indented under active client; thin vertical guide | Shared board captures; use a single expanded client context |
| Topbar | 56 px high | Measured boundary y=56 |
| Board/project action bar | Approximately 56 px high | Measured breadcrumb/action row below topbar |
| Board filter strip | Approximately 58 px high | Measured board canvas starts at y=170 |
| Canvas bottom toolbar | 42 px high | Measured y=958–1000; never cover actionable content |
| Home and credits content | Approximately 1052 px maximum width, centered in main region | Measured x=398–1450 on home/credits |
| Home top content inset | 40 px below topbar | Inferred page eyebrow y≈100 |
| Home metric strip | 96 px high, six equal cells on wide screens | Measured x=398–1450, y=208–304 |
| Home attention list | Approximately 64 px rows | Measured list boundaries; allow growth for long text |
| Wide page inset | 32–36 px | Board, Brand Hub, and briefing captures |
| Project inspector | Approximately 336 px | Measured starts at x=1264 |
| Design comments panel | Approximately 340 px | Measured starts at x=1260 |
| Brief summary | Approximately 270 px, 28 px gap from wizard | Measured starts at x=1294 on briefing detail |
| Brand Hub secondary nav | Approximately 186 px, 32 px gap | Measured x=284–470, main content starts x=502 |

Agency Home summarizes only authorized studio data and provides one attention queue. Client Home opens that client's board. Designer My work lists assigned production work. Counts must derive from the same scoped data used by the corresponding list; the screenshot's fixture counts are not production values. Navigation must not imply access to unassigned client work.

Keep one primary page title, one active context breadcrumb, and one action cluster per screen. Show the current task's primary action directly; place secondary actions in a labeled menu or contextual inspector. Account, search, and notifications are global controls without repeated sidebar/topbar copies. Use one client switcher or a compact expandable client list, not ten permanently expanded navigation trees. The active client belongs in navigation and breadcrumbs; avoid repeating it as a large decorative heading on every nested panel. Place settings and client creation in the agency workspace controls for members with the required permission.

## Board and project canvas

The board and project canvases use XYFlow/React Flow. Use a shared canvas frame with a subtle dot background, compact zoom/fit controls, and persisted positions or viewport where appropriate. Pointer and pan behavior must be understandable; mode controls can appear contextually rather than occupying a permanent full-width footer. The canvas is an interactive work surface, not a static screenshot or a decorative background behind a conventional grid.

Board composition groups project previews inside campaign frames. Make the canvas the primary workspace; provide a compact list alternative where it improves scanning and accessibility. The reference's Timeline and Kanban are optional planning patterns to adopt only if they solve a distinct user task; recreating both is not required merely because screenshots exist. Avoid showing a full planning dashboard and duplicate project cards simultaneously. An empty campaign remains visible with a clear way to create a briefing. Search and status filters operate consistently across implemented views and show a reset action when no matches remain.

If a timeline is implemented, show an understandable date interval, previous/next interval navigation, Today, date columns, and project bars. Use the current application date; do not copy “Sample today.” Any card dragging and status menus must invoke the same authorized transition. Preserve a keyboard-accessible status action. The workflow labels are Brief, Designing, Agency review, Client review, Revision, Approved, and Delivered; a visible label and shape accompany every monochrome status marker. Reuse these semantic states across views without rendering every possible state as persistent chrome.

Project canvases group **deliverable format → version → design**, with multiple designs allowed within one version. The reference shows approximately 308 px-wide version columns with a 32 px gap and a compact format heading. Formats remain metadata/badges; the deliverable also has a custom name, dimensions, quantity, and Original/Adaptation scope. Do not flatten distinct formats into unrelated projects or charge each badge as a separate project.

Opening a design presents the artwork on the canvas and comments to its right. The artwork preserves its real dimensions and aspect ratio, scales to available space, and can be zoomed. A bottom carousel moves between designs within the selected version; selecting another version is a separate action. Preserve the selected design and version when opening the inspector or switching comment channels.

Pins are stored relative to the design's intrinsic coordinate space, not screen pixels. They must remain anchored after pan, zoom, resize, fit-to-view, reopening, and publication. Pin selection highlights its thread; selecting a thread highlights its pin. A pending pin is visibly distinct until its comment is saved. Moving between designs, versions, or channels must not show unrelated pins or retain an unsent draft on the wrong design.

## Information boundaries and review logic

Role differences come from authenticated, server-enforced permissions, not a “Preview as” dropdown. Agency members can use two explicitly labeled channels: **Agency & designer** and **Agency & client**. The designer sees only the internal channel for assigned work; the client sees only the agency/client channel. Client-facing agency messages use the Studio identity. Client responses, notifications, file names, activity items, previews, and accessible labels must not reveal designer names, avatars, assignments, or internal authorship metadata.

Agency publication creates an immutable snapshot of the selected version's designs for the client. Editing an internal design later must not silently mutate the shared client version. Only authorized agency actions publish; the designer submits to the agency, and the client requests changes or approves a shared publication. A comment belongs to its project, version/publication context, design, and channel. Generic project messages and pinned design feedback are related but distinct interfaces.

Approvals, revision requests, assignments, delivery, uploads, and notifications need pending, success, and actionable failure states. Do not optimistically announce success when persistence has failed. A delivered state must resolve to real authorized files; a share link must resolve to the intended client perspective and access boundary.

## Briefings, credits, and brand content

The reference briefing flow is Type → Details → Review. Retain progressive disclosure and explicit service/campaign choice; the product may consolidate steps where the request remains understandable and complete. A new briefing must not implicitly inherit the previously visited campaign. The supplied 20-service catalog is reusable domain content, not a requirement to copy its five-page card chooser. Details covers Campaign, Deliverables, Briefing, and Timing & files. Show the summary only where it helps verify a consequential submission; avoid two simultaneous step-navigation bars. Do not restore the redundant “FOR SABRE / Draft a brief…” heading.

Brand defaults can be retained or customized per briefing. The summary reflects the selected campaign, named deliverables, quantities, dimensions, service estimate, and turnaround. Back/Next preserves valid drafts; submission validates the complete request. Agency acceptance confirms the total quote, requires an explanation for applicable adjustments, creates one project, and debits credits once in an atomic operation. Repeated clicks, retries, and concurrent acceptance must not duplicate the project or debit. Insufficient balance prevents acceptance without losing the draft or quote.

Credits uses a quiet financial layout: current balance, relevant usage context, and a clear activity table with dates, projects, campaigns, amounts, and balance after. Reports and export belong to contextual actions instead of a second dashboard unless a separate reporting task justifies it. Debit/credit signs and row labels communicate meaning without color. Detailed deliverable scope explains a project debit, not independent duplicate charges. Totals, implemented filters/reports, project details, and exported CSV must reconcile to the ledger. Any credit addition must reflect a real authorized ledger action, with no implication that a payment occurred unless payment processing exists.

The reference Brand Hub contains ten sections: Brand Overview, Logos, Colors, Typography, Visual Style, Product Library, Brand Assets, Templates, Copy & Messaging, and AI Brand Instructions. Consolidate these into a small number of useful content groups rather than copying ten permanent navigation entries. Agency editing persists authorized client-specific data. If templates are included, personal drafts stay separate from briefs/projects/credit debits. AI Brand Instructions represents reusable brand context; do not imply a live AI generation service exists. Clipboard actions have success feedback and a manual-copy fallback.

## Responsive and accessibility decisions

No responsive captures exist in the package. These are implementation decisions to validate, not inferred mobile designs.

| Viewport | Required adaptation |
|---|---|
| 1600 × 1000 | Full shell and side panels; assess the fresh design against the principles, not pixel identity |
| 1440 × 900 | Normal desktop; maintain a clear hierarchy with fluid canvas and centered content |
| 1024 × 768 | Collapsible sidebar; inspectors become overlays if canvas would be unusably narrow; metrics wrap to three columns |
| 768 × 1024 | Navigation drawer; Brand Hub navigation becomes a labeled section selector; briefing summary collapses; metrics wrap to two columns |
| 390 × 844 and 320 × 800 | Single-column forms and lists; menus contain secondary actions; controls remain reachable; canvas pans inside its bounded region |

Document-level horizontal overflow is a defect. Timeline and canvas may pan or scroll within a visibly bounded, labeled region. Tables may scroll horizontally within their own region or use equivalent stacked rows while preserving headers and action labels. Never scale the entire application down to fit a phone. At narrow widths, a bounded artwork canvas is followed by the feedback panel in the same document, preserving draft, selection, and scroll state. Dialogs fit the viewport and scroll internally when necessary; their close and confirmation actions remain available.

Use semantic headings, real buttons and links, labeled form fields, table headers, descriptive empty states, and a skip-to-content link. Dialogs manage focus, close with Escape when appropriate, and return focus to their trigger. Interactive canvas controls and pins have accessible names; provide list/thread access that does not require precise pointer input. Focus visibility must survive both white and dark surfaces. Aim for at least 4.5:1 normal-text contrast, 3:1 large text/non-text control contrast, and 44 × 44 px touch targets; the production audit must measure these targets before asserting compliance. A 32–36 px desktop button may have a larger touch hit area without changing its visual dimensions.

The shared [Modal](../../apps/web/features/shared/modal.tsx) uses a native modal dialog for the browser's top layer and background inertness, plus explicit Tab/Shift+Tab cycling for predictable focus containment. Its controlled API is `open`, `onClose`, `title`, `children`, optional `description`, `footer`, `size` (`sm`, `md`, `lg`), and `initialFocusRef`. It names the dialog from its heading, focuses the heading or supplied target, handles Escape/backdrop dismissal, locks background scrolling, and restores the previously focused element on close. Consumers should not layer separate custom modal implementations over it.

Support keyboard navigation, reduced motion, 200% browser zoom, long project/client names, multiple-line comments, validation messages, and slow or failed network requests. Status, selection, validation, and saved-state feedback must not depend only on hue, animation, or a disappearing toast.

## Component ownership and duplication

Follow feature colocation: briefings own their wizard and service-driven fields; projects own versions, design viewing, and inspector behavior; credits own ledger display and report filters; Brand Hub owns brand sections and personal drafts. Share a component when it has at least two genuine consumers. The shell, page heading, button/input primitives, dialog, empty state, status indicator, table treatment, and canvas frame are suitable shared patterns. Avoid a single monolithic component containing every role and feature, or separate copied applications for agency/client/designer.

The same project entity drives Home, Board, Reviews, Credits links, and notifications. Use shared display rules for project names, statuses, dates, quantities, and credit amounts. Role-specific visibility does not justify duplicated mutable state or parallel business logic. Derived counts must have one authoritative definition.

## Final audit gate — not yet executed

Complete the functional production-simulation gate first with exactly 10 clients and 20 seeded projects, then execute the comprehensive alignment audit. Preserve fixture identifiers and record any additional entities created during action testing separately. Neither the screenshots' 23 active projects nor a test that only checks the home count proves the required 20-project workflow coverage. The audit covers every action exposed by the product and all agreed end-to-end workflows; it does not require reproducing every prototype screen.

For each check, record application revision, environment, seed revision, authenticated role, client/project identifiers, viewport, steps, expected/actual result, screenshot or test-log path, defect identifier, and retest evidence. Link results from the implementation's validation report; do not turn this checklist into a pass claim without those artifacts.

- [ ] All 10 clients and all 20 projects can be reached through authorized navigation and reload correctly; summaries reconcile with their scoped records.
- [ ] Board, implemented alternate views, search, filters, empty states, campaign creation, and project inspection work with the seeded portfolio.
- [ ] All supported briefing types and fields have meaningful coverage, including draft recovery, attachments, submission, adjusted quotes, insufficient credits, and repeated acceptance.
- [ ] Every project status and authorized transition is covered; invalid and unauthorized transitions fail with clear feedback.
- [ ] Designs, multiple versions, multiple designs per version, publication snapshots, internal/client comments, pin placement, thread selection, carousel, zoom, and persistent reload are covered.
- [ ] Client isolation and designer confidentiality are verified in visible UI, accessible text, responses, storage access, search, notifications, and shared links.
- [ ] Approval, revision, delivery, real uploads/downloads, credits, brand updates, global actions, and settings are exercised through their real persistence paths; any exposed reports, CSV, or personal drafts are also verified.
- [ ] Desktop visual review covers the implemented agency workspace, board, project/design viewer, briefing, credits, brand resources, client review, and designer work at 1600 × 1000; intentional consolidation is documented rather than treated as a screenshot mismatch.
- [ ] Responsive checks cover every viewport above, 200% zoom, long-content fixtures, empty states, errors, and active dialogs/inspectors.
- [ ] Alignment: headings, rows, toolbar baselines, panel edges, sidebar selection, and breadcrumbs follow shared geometry; no accidental one-off offsets remain.
- [ ] Spacing: controls, cards, forms, comment threads, and section gaps use the documented scale; scroll areas and sticky controls do not obscure content.
- [ ] Logic: visible actions match role, current state, and data; counts and confirmations stay consistent after mutation and reload; destructive actions identify their target.
- [ ] Minimalism: each screen has a clear purpose and primary action; prototype labels, duplicate titles, ornamental cards, unnecessary badges, and repeated explanations are removed.
- [ ] Duplication: no duplicated business transition, ledger write, component family, navigation entry, design version, or comment appears because of repeated actions or copied implementation.
- [ ] Accessibility: contrast, focus, keyboard actions, target sizes, announcements, and image/field labels have measured/manual evidence rather than visual assumptions.
- [ ] Every found defect has a severity, owner, correction, and retest; no unresolved blocking functional, permission, data-integrity, or layout defect is silently waived.

Implementation verification and remaining gates are recorded in the [September 20 design audit](../verification/design-audit.md). Mobile project artwork and comments currently stack vertically in a bounded canvas followed by the feedback panel; this is the implemented responsive consolidation.
