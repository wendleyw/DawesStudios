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

The brand's italic “Studios” lettering is part of the image, not the application's body typeface. Client artwork may have its own brand colors; application navigation, buttons, charts, and canvas controls remain monochrome. Actual asset thumbnails replace the prototype's grey illustrative placeholders when a real file exists.

**Decision**: status chrome differentiates by shape and tone, not hue, wherever a badge has room to do so. `.status-badge` therefore carries a dashed border for changes requested, a hollow dot for internal review, a square dot for delivered, and tonal greys elsewhere. The board calendar is the documented exception: at a 56 px lane a bar has no room for texture, and seven states have to be told apart across a dense grid, so `.timeline-project-bar` uses a restrained olive and amber family — the same families the calendar already used — stepped tonally per status. Measured text-to-fill contrast is 6.4:1 to 7.9:1 and bar edges are at least 3.0:1, and the dot shape still matches the badge so the two readings agree. Hue is additive here: the bar also carries its status in text, so the calendar does not rely on colour alone.

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
| Board/project action bar | Approximately 56 px high | Measured breadcrumb/action row below topbar; the board now folds this row into its identity header |
| Board filter strip | Approximately 58 px high | Measured board canvas starts at y=170; the board now opens these filters from a popover in that header |
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

Controls people look for by name carry that name. Signing out was an unlabelled icon wedged beside the account block and could not be found at all; it is a full row in the sidebar footer now, and its accessible name comes from the visible text rather than an attribute. A page that already exists but sits three clicks inside another one is, in practice, missing: Team is reached from the sidebar as well as from Studio settings, one destination with two ways in.

Keep one primary page title, one active context marker, and one action cluster per screen. Show the current task's primary action directly; place secondary actions in a labeled menu or contextual inspector. Account, search, and notifications are global controls without repeated sidebar/topbar copies. Use one client switcher or a compact expandable client list, not ten permanently expanded navigation trees. The active client is named once per screen: the board titles itself with the client's identity header, and every other page inside the workspace titles the work itself rather than repeating the client name as a decorative heading. Place settings and client creation in the agency workspace controls for members with the required permission.

### Workspace topbar

The topbar is global chrome, not a page toolbar. It names the studio on the left and carries the notifications control on the right, and nothing else: a page that needs controls renders them in its own header, where they sit beside the title they act on.

Where a page brings a header of its own, the bar would be an empty strip, so it stands down. Every page inside a client workspace brings one — the board its identity header, the project its title row, the rest their `page-heading` — and the shell marks that case by adding `client-workspace` to `.workspace`, which hides the bar and zeroes `--topbar-height` at ≥901 px. Each of those pages carries the notifications control itself, as the last item in its own header row, tagged `page-bell`. Below 901 px the bar stays whatever the page is, because it holds the only way to open the navigation drawer, and `page-bell` hides at that width rather than showing a second control.

Disclosure panels belong to their trigger: the board filter menu opens as a popover under its button and closes on Escape or an outside click.

### Brand Hub sections

The ten sections are a row of links under the title, in the order of their groups, with the current one carrying `aria-current="page"`. Where you are and what else there is are the same glance; a select hid the second half of that. They are links rather than buttons because they are routes — a section opens in a new tab and has its own address, which the select it replaced could never offer, and browser tests drive them the way a viewer does instead of calling `selectOption`. The row scrolls sideways rather than wrapping, so the group order survives every width: at 390 px it holds one row of 882 px inside 350 px and the page itself does not overflow.

### Board identity header

The board opens on whose work it is. Above the canvas — and above the list view — an identity header carries the client's brand mark at 58 px beside their name as the page's `h1`, with a quiet `PROJECT BOARD` caption below it, and the board's own controls on the same row: search, the filter menu, the result count, the view selector, the primary action, and last the notifications control the topbar would otherwise have held. It renders [`client-mark.tsx`](../../apps/web/features/workspace/client-mark.tsx)'s `ClientMark`, which takes its size from the `--client-mark-size` custom property, so any other surface showing the mark scales one component rather than keeping a copy.

The header is page chrome, not a canvas node: it stays in place while the board pans, and it is the board's only visible client name. Its height is free to change rather than being restated in a token — showing the canvas, `.board-page` takes the viewport exactly and the canvas takes whatever the header leaves. That has to be a `height`, not a `min-height`: React Flow sizes itself with an inline `height: 100%`, which resolves to zero against an indefinite one. A floor of 568 px keeps the canvas usable on a short window. The list view scrolls with the page instead, so it keeps the flexible box.

Below 1100 px the controls take their own row under the client's name. Below 1200 px the result count is dropped, and below 640 px the control labels collapse to icons that keep their accessible names.

## Board and project canvas

The board and project canvases use XYFlow/React Flow. Use a shared canvas frame with a subtle dot background, compact zoom/fit controls, and persisted positions or viewport where appropriate. Pointer and pan behavior must be understandable; mode controls can appear contextually rather than occupying a permanent full-width footer. The canvas is an interactive work surface, not a static screenshot or a decorative background behind a conventional grid.

Every `ReactFlow` instance sets `proOptions={{ hideAttribution: true }}`, so the library's attribution badge does not sit over the bottom-right corner of the work surface. The package is MIT licensed and its licence carries no interface attribution clause, so hiding the badge is permitted; xyflow asks that projects removing it subscribe to React Flow Pro to support the library, which is a request rather than a condition. Restoring the badge means dropping the prop from all three canvases: the board, the project canvas, and the design viewer.

Planning is sized by the widest thing it holds, which is the Kanban rather than the calendar: seven stage columns at 176 px with their gaps and padding, computed by `kanbanWidth()` in [`board-layout.ts`](../../apps/web/features/board/board-layout.ts) and held as `PLANNING_MIN_W`. Sizing the frame to the calendar instead left the last stages scrolled out of reach behind the frame's edge and broke every card title across three lines. The calendar then has width to spare, so its identity column holds a title of about thirty characters without an ellipsis; below 840 px the grid scrolls sideways inside the frame rather than crushing the dates together. Widening the frame lowers the zoom a full board is fitted at — that is the trade being made, and it is made for legible titles and reachable stages.

The seeded workspaces are not uniform, and the board is judged on the busy one. Nine clients carry two projects under a single campaign; SABRE carries the workspace the reference package documents — three campaigns, seven projects across four statuses, and two briefings that have not become projects yet — so Planning's calendar shows seven contending lanes and its Kanban fills four of its seven stages. A layout decision that only reads well on a two-project board has not been tested.

Board composition groups project previews inside campaign frames, stacked in one column below a collapsible Planning frame, and this stack is the canvas itself rather than one of several sibling views. Canvas and List are the only top-level board layouts; Timeline, Kanban and one opened project are the three states of the Planning frame, which is what keeps one set of records from being reachable through several competing destinations. The Planning frame is bounded in height and scrolls internally, so campaign frames are never pushed off screen. Because Planning and the campaign frames are visible together, the same project can appear in both: connect the two through selection, never by rebuilding the canvas on hover, and never let the duplicate reading turn into two competing sets of actions. An empty campaign remains visible with a clear way to create a briefing. Search and status filters operate consistently across both layouts and show a reset action when no matches remain.

A project card on the canvas answers to the pointer in two steps and leaves the board in both: one click selects the card, which is carried visually and as `aria-current` on the node and announced in a live region; two clicks open that project in the Planning frame, alongside an explicit open control on the card for the keyboard and for discoverability. The opened state is the project view itself rather than a summary of it, so the channel a role reads, what a client is never sent, and who may produce, publish or review are decided in one place; the frame header carries the way back to Timeline or Kanban and a link to the full page. Dragging stays confined to the card's grip, so moving a card is never read as selecting or opening it. Each card carries the leading artwork the viewer is allowed to see — working designs for the agency and the assigned designer, published designs for a client — through a short-lived signed URL; most projects have none, so the empty band is a quiet, deliberate tile rather than a broken image.

The timeline shows an understandable date interval, previous/next interval navigation, Today, date columns, and project bars. Use the current application date; do not copy “Sample today.” The Kanban regroups the same scoped records by status and navigates only: `status` is absent from the single column grant on `public.projects` and no RPC accepts an arbitrary target status, so a drag-to-transition or status menu would fail against the database. Do not ship one until an authorized transition exists; when it does, dragging and the menu must both invoke it and a keyboard-accessible status action must accompany them. The workflow labels are Brief, Designing, Agency review, Client review, Revision, Approved, and Delivered; a visible label and shape accompany every monochrome status marker. Reuse these semantic states across views without rendering every possible state as persistent chrome.

Project canvases group **deliverable format → version → design**, with multiple designs allowed within one version. Each deliverable is a stacked section, and each version inside it is a single horizontal line: a fixed label column on the left carries the version number, its status, its release note, client feedback, the design count and the version's one action, and the version's designs sit in a row beside that column, with the next version as the line below. The label column is one tile wide and every section starts on the same left edge, so the labels form one rail down the canvas — the calendar's sticky label column, applied to versions. A line is as wide as the designs it actually holds, so the right edge is deliberately ragged; past five tiles it stops widening and the rest stay behind a trailing “+N more designs” slot on the same line. The deliverable header stops at the label column plus two tile slots so its “new version” control stays beside the name. Each tile shows the deliverable's own proportions — 1080 × 1080 square, 1080 × 1920 tall — and the geometry is computed in [`canvas-layout.ts`](../../apps/web/features/projects/canvas-layout.ts) rather than measured after paint, so the canvas never reflows once it is drawn; the fixed part sizes in `projects.css` mirror that module and change with it. The canvas opens pinned to the top of the list at a zoom that fits the widest line, never magnified past natural size and never shrunk past the point where a preview stops being readable — a tall project scrolls rather than shrinking, and Fit View remains for anyone who wants the whole project at once. Formats remain metadata/badges; the deliverable also has a custom name, dimensions, quantity, and Original/Adaptation scope. Do not flatten distinct formats into unrelated projects or charge each badge as a separate project.

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

Every "nothing here yet" reads in one language: `.empty-state` — dashed frame, centred icon, heading and one supporting line, plus the action that recovers from it where one exists. A slot too small for that treatment adds `.empty-state-compact` (the kanban column, a version row on the project canvas) rather than inventing a private rule; the slot keeps only its own size. A route that is loading says `Loading …` through the shared `PageStatus`, including the shell's own wait, so one navigation shows one message in one layout; softer verbs are reserved for a wait that is a check rather than a fetch. A route that fails states the failure once, in its heading, with a plain explanatory paragraph under it — not a second time through `FormError`, whose `role="alert"` would announce it twice.

An action that destroys data confirms, and it confirms in the product's own dialog: removing a designer from a project, removing a briefing attachment or deliverable, and leaving a template draft with unsaved changes all open the shared `Modal`. `window.confirm` is not used anywhere.

The shared [Modal](../../apps/web/features/shared/modal.tsx) uses a native modal dialog for the browser's top layer and background inertness, plus explicit Tab/Shift+Tab cycling for predictable focus containment. Its controlled API is `open`, `onClose`, `title`, `children`, optional `description`, `footer`, `size` (`sm`, `md`, `lg`), and `initialFocusRef`. It names the dialog from its heading, focuses the heading or supplied target, handles Escape/backdrop dismissal, locks background scrolling, and restores the previously focused element on close. Consumers should not layer separate custom modal implementations over it.

Support keyboard navigation, reduced motion, 200% browser zoom, long project/client names, multiple-line comments, validation messages, and slow or failed network requests. Status, selection, validation, and saved-state feedback must not depend only on hue, animation, or a disappearing toast.

## Component ownership and duplication

Follow feature colocation: briefings own their wizard and service-driven fields; projects own versions, design viewing, and inspector behavior; credits own ledger display and report filters; Brand Hub owns brand sections and personal drafts. Share a component when it has at least two genuine consumers. The shell, page heading, button/input primitives, dialog, empty state, status indicator, table treatment, and canvas frame are suitable shared patterns. Avoid a single monolithic component containing every role and feature, or separate copied applications for agency/client/designer.

The same project entity drives Home, Board, Reviews, Credits links, and notifications. Use shared display rules for project names, statuses, dates, quantities, and credit amounts. Role-specific visibility does not justify duplicated mutable state or parallel business logic. Derived counts must have one authoritative definition.

### Interface vocabulary

One concept, one word. The interface uses these nouns and no synonym of them:

| Concept | Word | Not |
|---|---|---|
| A client organisation | **Client** | workspace, client workspace |
| The studio's own account and settings | **Studio** | workspace |
| The required output a briefing commissions | **Deliverable** | — |
| The image produced inside a version | **Design** | artwork |
| A downloadable file on `/clients/:id/assets` | **File**, and **Working file** for a source upload | asset |
| A file in the Brand Hub library | **Asset** | file, resource |
| A brief document | **Briefing** | brief |
| A person a project is assigned to | **Designer** | creative partner |
| A record on `/notifications` | **Notification** | update |
| The billing unit | **credits** | cr |

Deliverable, asset, working file and design are four different things and are never merged.
`features/workspace/` keeps its directory name because it is the application shell, not a client
record; "workspace" survives in the shell's own chrome (the navigation landmark, the shell's loading
and connection states) and nowhere else.

A status is never rendered from its database token. Every enum a user reads has a label map beside
its type — `statusLabels` and `versionStatusLabels` in
[`workspace-data.ts`](../../apps/web/features/workspace/workspace-data.ts),
`briefingStatusLabels` in `briefings/briefing-model.ts`, `creditKindLabels` and
`creditRequestStatusLabels` in `credits/credit-model.ts` — and no stylesheet re-cases a label with
`text-transform`.

### Dates and the studio timezone

Every user-facing date is rendered by `useDateFormat()`
([`workspace-data.ts`](../../apps/web/features/workspace/workspace-data.ts)); no component
constructs its own `Intl.DateTimeFormat`. It exposes `formatDate` (`Sep 21`), `formatDateLong`
(`Sep 21, 2026`), `formatDateTime` (`Sep 21, 2026, 11:00 PM`), `formatMonth` (`September 2026`) and
`formatWeekdayDate` (`Monday, September 21`), each taking the label to print when the value is
absent, so "No due date" belongs to the due-date column rather than to the formatter.

The timezone chosen in Settings → Studio is the zone every **instant** is read in — comments,
notifications, ledger rows, uploaded files, version history and "today". A **calendar date**
(`2026-09-21`: a due date, a start date, a campaign boundary, a timeline column) names a day rather
than an instant and is read in UTC everywhere, including `board/timeline-model.ts`, because shifting
it into a western zone would move a due date to the day before.

## Styling boundary

Three systems share the frontend, and each has exactly one job. This is the answer to "which
system do I use here", established by the [repository structural refactor](../superpowers/specs/2026-09-20-repository-structural-refactor-design.md) and enforced by every feature agent that follows it.

- **Tailwind v4** supplies the design-token bridge and utility classes. `apps/web/app/globals.css`
  opens with `@import "tailwindcss"`, followed by a `:root` block of 14 custom properties (colors,
  radii, and the sidebar/topbar geometry) and an `@theme inline` block that maps four of them —
  `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono` — into Tailwind's theme,
  so a utility class such as `bg-background` resolves to the same token the hand-authored CSS
  reads. Reach for a Tailwind utility for one-off layout or spacing on new markup; reach for the
  `:root` token, not a hardcoded value, whenever a color, radius or the shared shell geometry is
  needed. Beyond that bridge, the application is hand-authored CSS, not a Tailwind component
  system — there is no utility-first componentry to adopt here.
- **`apps/web/app/globals.css`** (1,105 lines after the Task 5 split, down from 2,221) holds the
  `:root` tokens and `@theme` block above, the reset and base element styles (`*`, `html`, `body`,
  headings, links, focus states), and the styles of the shared primitives in
  `apps/web/features/shared/` — `Modal`, `FormError`, `PageStatus`, `SearchField` — plus the older
  base classes every feature composes with (`button`, `icon-button`, `panel`, `toolbar`,
  `empty-state`, `page-heading`/`section-heading`, the `form-*` classes). Nothing feature-specific
  belongs here.
- **`apps/web/features/<feature>/<feature>.css`** holds every rule specific to that one feature —
  `board/board.css`, `board/timeline.css`, `workspace/workspace.css`, `workspace/activity.css`,
  `auth/auth.css`, and the rest, one stylesheet per feature, plus `shared/forms.css` for the shared
  form-layout classes (`stack-form`, `form-row`, `checkbox-label`, `form-actions`), loaded once
  globally by `app/layout.tsx`.

**The multi-feature override.** A namespace that reads as feature-specific by name stays in
`globals.css` regardless of its name when it has consumers in two or more features. Moving it would
either duplicate the rule into two stylesheets (a drift risk — the two copies stop matching) or
force one feature to import another feature's stylesheet, which breaks the boundary a different
way. `.status-badge` has consumers in six features (`board`, `briefings`, `credits`, `projects`,
`settings`, `workspace`); `.segmented-control` has consumers in five (`assets`, `board`, `brand`,
`projects`, `reviews`); `.brand-logo` reads as `brand`-owned but is shared by `auth` and
`workspace`. Each stays in `globals.css` under this rule. (These three are additional instances of
the rule, verified the same way as the twelve below, but outside the specific count Task 5 tracked —
see the note on that count at the end of this section.)

**The twelve namespaces Task 5 tracked, verified individually, in four categories.** The refactor
plan measured a specific, narrower set — everything matching
`grep -cE '^\.(board|kanban|project-|login-|sidebar|topbar|workspace|client-|profile-|home-|overview-)'`
against `globals.css` — and found 20 matches, 12 of which are legitimate exceptions to "feature-named
rules move out." Re-checking each of the 12 individually (`grep -rln 'className.*\bNAME\b'
apps/web/features --include="*.tsx" | sed 's#^features/##;s#/.*##' | sort -u`, plus reading the
actual CSS) found that an earlier draft of this document mischaracterized five of them as directly
multi-feature by consumer count when they are not — the real reasons are grouped selectors or, in
two cases, not established at all. The corrected breakdown:

- **Multi-feature consumers (5): `.topbar`, `.project-row`, `.project-table`, `.client-mark`,
  `.client-mark-initials`.** `.topbar` has consumers in `brand` and `workspace`. `.project-row` and
  `.project-table` are independently hand-authored with the same class names in both
  `board/board-page.tsx` and `workspace/home-page.tsx` — genuinely duplicated markup across two
  features, not a shared component. `.client-mark`/`.client-mark-initials` reach two features by a
  different mechanism: the `ClientMark` component is defined in `features/workspace/client-mark.tsx`,
  but its only current renderer is `features/board/board-page.tsx` (`import { ClientMark } from
  "@/features/workspace/client-mark"`), and `board-page.tsx` imports only `./board.css`, not
  `workspace.css` — so the class has to be visible outside feature boundaries for board's render to
  pick it up. Separately, `board.css`'s `.board-identity-mark` overrides the `--client-mark-size`
  custom property at equal specificity on the same element (58px there against `.client-mark`'s own
  26px default), so `.client-mark` also has to stay loaded before `board.css` for that override to
  keep resolving the same way.
- **Grouped selectors binding a single-feature namespace to a multi-feature or shared rule (4):
  `.project-title`, `.board-canvas`, `.project-canvas`, `.sidebar-collapse`.** `.project-title`'s
  only consumer is `workspace/home-page.tsx`, but `globals.css` groups it with `.project-row` in one
  rule (`.project-title strong, .project-row > strong { … }`), and `.project-row` is multi-feature —
  splitting the group would duplicate the rule or change its specificity. `.board-canvas` (`board`
  only) and `.project-canvas` (`projects` only) are each single-feature, but `globals.css` groups
  both (with `.design-viewport`, also `projects`-owned) into one `.react-flow__attribution` rule
  spanning `board` and `projects`. `.sidebar-collapse`'s only consumer, `workspace/app-shell.tsx`,
  renders it with `className="icon-button sidebar-collapse"` — the toggle carries both classes on
  one element, so the rule stays grouped with a shared primitive rather than moving cleanly to a
  single feature's stylesheet. An earlier draft of this document justified that placement by a
  cascade dependency: the shared `.icon-button` rule at the 640px breakpoint (`globals.css:911`,
  `width: 40px`) supposedly had to keep winning over `.sidebar-collapse`'s own sizing there. The
  final structural-refactor fix wave found that reasoning does not hold — `.sidebar-collapse` is
  already `display: none` under `@media (max-width: 900px)` (`globals.css:886`), a superset of the
  640px range, so the element is already hidden by the time the viewport reaches 640px and there is
  no sizing conflict left for that rule to win. `.sidebar-collapse` still belongs in `globals.css`,
  but for the grouped dual-class-selector reason above, not the cascade-order one.
- **Removed (1): `.workspace-status`.** Zero consumers were left in any `.tsx` file, and Task 5 left
  the rule in place because its own mandate was relocation, not cleanup. The final
  structural-refactor fix wave re-verified the zero-consumer finding and deleted the rule (the base
  selector, `.workspace-status i`, and its `@media (max-width: 1000px)` override) — removing
  genuinely dead code was within that wave's mandate.
- **Resolved (2): `.project-origin`, `.project-symbol`.** Both had exactly one consumer,
  `workspace/home-page.tsx`, and Task 5 found neither part of a grouped selector with a multi-feature
  rule, nor any cascade or specificity dependency — so it recorded them as unexplained rather than
  invent a justification. The final structural-refactor fix wave re-verified the single-consumer
  finding and moved both rules — `.project-origin small`, `.project-symbol`'s base rule, and its
  `@media (max-width: 1200px)` override — verbatim into `workspace/workspace.css`, in their original
  relative order. Neither selector remains in `globals.css`.

**Where the original spec's prediction was wrong.** The spec's Foundation 3 predicted `brand.css`
and `projects.css` would each receive rules split out of `globals.css`. Neither did at Task 5, for
two different reasons. `.brand-link` and `.brand-monogram` read as brand-owned by name, but their
only consumer is the sidebar brand mark in `workspace/app-shell.tsx`, so Task 5 moved them into
`workspace/workspace.css` instead. Every `project-*` namespace that stayed behind in `globals.css` at
that point stayed for one of the reasons above — genuinely multi-feature (`.project-row`,
`.project-table`), grouped with a multi-feature rule (`.project-title`, `.project-canvas`), or
unexplained (`.project-origin`, `.project-symbol`) — and none of those reasons pointed at
`projects.css`: the unexplained pair's sole consumer was `workspace/home-page.tsx`, not
`features/projects/`. The final structural-refactor fix wave later confirmed that and relocated the
unexplained pair into `workspace/workspace.css`, per the "Resolved" entry above — so, as predicted
here, `projects.css` still received nothing from any of this: not because `projects` has no CSS, but
because no rule that moved or stayed behind was ever exclusively `projects`-owned.

**Selector disjointness is enforced, not measured.** The split traded a single deterministic
cascade for one built from 13 feature stylesheets loaded alongside `globals.css`, which raised a
fair question: without `@layer` or a pinned import order in `app/layout.tsx`, what stops a rule
added to one feature's stylesheet from silently winning or losing against another feature's rule
of the same name? The answer is that the boundary rule above — a namespace with consumers in two
or more features stays in `globals.css` — makes the feature stylesheets' selectors disjoint by
construction: at the time this was checked, the 13 feature stylesheets declared 736 distinct
selectors between them and shared none. With disjoint selectors, the relative load order of
feature stylesheets cannot matter, because nothing in them can conflict; pinning an import order
would only order a conflict that does not exist. The two deliberate exceptions are `board.css`'s
`h3` (an inherited override of the base heading rule in `globals.css`, not a designed shared rule)
and `shared/forms.css`'s `.form-actions` (both files declare it, and because `app/layout.tsx`
imports `forms.css` after `globals.css`, `forms.css` wins — an unexamined consequence of the split
that is now pinned rather than left implicit).
[`stylesheet-boundary.test.ts`](../../apps/web/features/shared/stylesheet-boundary.test.ts)
enforces all of this as a standing check rather than a one-time measurement: no selector may appear
in two feature stylesheets, and the only selectors a feature stylesheet may share with
`globals.css` are those two named exceptions.

## Final audit gate — not yet executed

Complete the functional production-simulation gate first with exactly 10 clients and 25 seeded projects, then execute the comprehensive alignment audit. Preserve fixture identifiers and record any additional entities created during action testing separately. Neither the screenshots' 23 active projects nor a test that only checks the home count proves the required workflow coverage across all 25. The audit covers every action exposed by the product and all agreed end-to-end workflows; it does not require reproducing every prototype screen.

For each check, record application revision, environment, seed revision, authenticated role, client/project identifiers, viewport, steps, expected/actual result, screenshot or test-log path, defect identifier, and retest evidence. Link results from the implementation's validation report; do not turn this checklist into a pass claim without those artifacts.

- [ ] All 10 clients and all 25 projects can be reached through authorized navigation and reload correctly; summaries reconcile with their scoped records.
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
