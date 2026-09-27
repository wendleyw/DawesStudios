# Design system and acceptance criteria

Status: design direction and acceptance criteria. The September 23 UI refresh has [bounded browser and visual evidence](../verification/ui-refresh-2026-09-23.md). This document does not establish whole-product conformance; unchecked requirements remain unverified.

## Evidence and interpretation

The local reference package is visual inspiration, captured on September 20, 2026. Its [manifest](../ref/manifest.json) contains 711 screenshots: 306 agency, 247 client, and 158 designer captures. Every manifest viewport and all representative images inspected are 1600 × 1000. Scroll captures continue the same screen; they are not separate routes. See [reference-map.md](reference-map.md) for exact paths and route families. The user explicitly requested a fresh minimalist, lightweight, modern product; neither screenshot count nor pixel fidelity is an acceptance target.

The screenshots are a monochrome interaction prototype. Learn from the restrained surfaces, compact navigation, review workflow, and role boundaries while simplifying visible chrome and consolidating equivalent screens. The current production request supersedes the reference guides' earlier instruction to keep changes in memory. Persistence, authentication, file delivery, and permission checks require real implementations; prototype reset controls and simulated success messages are not product requirements. Keep technical architecture out of product copy unless it helps a user make a decision.

Numeric values below have one of three meanings:

- **Measured**: observed image dimensions, sampled flat colors, or visible screenshot boundaries.
- **Inferred**: approximate typography and spacing reconstructed from raster images, not extracted source CSS.
- **Decision**: an implementation rule covering production behavior or unrepresented responsive states.

## Brand and visual direction

Use the supplied [Brianna Dawes Studios logo](../../brand/brianna-dawes-studios.webp). It is a 2409 × 619 RGBA asset with a white wordmark and organic symbol, approximately 3.892:1. Preserve its aspect ratio, transparency, and complete composition. Do not recreate the wordmark in a UI font, replace the symbol with initials, or stretch the image. Its light artwork belongs on the dark navigation surface. A 156 × 40 display area is an inferred starting point for the desktop sidebar, with `object-fit: contain`. The sidebar animates the symbol: [`brand/logo-animation.webm`](../../brand/logo-animation.webm) plays when the app opens, rests on the finished symbol for ten seconds and plays again (a still with reduced motion), beside the wordmark cut from this asset, so the lockup keeps the original composition and proportions (see `shared/brand-mark.tsx`); the project tool bar repeats the animated symbol in a small tile of the menu colour. Sign-in, invitation and recovery screens keep the static logo. The favicon is the symbol alone, white on a rounded tile of the menu colour (`public/brand/favicon.png`); inside the signed-in app `workspace/animated-favicon.tsx` plays the same animation in the tab on the sidebar's rhythm (Chrome and Edge; Safari keeps the static icon, as does reduced motion).

The brand's italic “Studios” lettering is part of the image, not the application's body typeface. Client artwork may have its own brand colors; application navigation, buttons, charts, and canvas controls remain monochrome. Both themes keep that rule; neither recolours artwork. The status badge is one documented exception — see the Decision below — added at the user's request on 2026-09-24; the Miro bar's channel row is the other, added at the user's request on 2026-09-27. Actual asset thumbnails replace the prototype's grey illustrative placeholders when a real file exists.

**Decision**: status chrome differentiates by shape first, so status never reads from color alone, and now also carries a restrained hue per tone, added at the user's request on 2026-09-24. `.status-badge` styles four _meanings_ rather than the enum values of any one domain: `neutral` (the base — a filled grey dot on the subtle surface), `active` (a hollow ring on a soft blue tint), `attention` (a dashed border on a soft amber tint) and `complete` (a solid green fill, full-strength text and a square dot). The three colored tones are `--tone-active-fg/-bg/-border` (`#1d4e89` / `#e7f0fb` / `#a9c6ea`), `--tone-attention-fg/-bg/-border` (`#7a5400` / `#fbf1dc` / `#e3bd6e`) and `--tone-complete-fg/-bg/-border` (`#2f5d34` / `#e7f0df` / `#a9c48a`, harmonizing with the board timeline's olive/green family below) in `app/globals.css`; foreground-on-background contrast measures 7.29:1 (active), 6.05:1 (attention) and 6.55:1 (complete) against the 4.5:1 WCAG AA floor for the 12 px badge text. Each domain maps its own enum onto that vocabulary in TypeScript beside its label map, so briefings, credit requests and projects read consistently and a new domain needs no new CSS — see [`features/shared/status-tone.ts`](../../apps/web/features/shared/status-tone.ts). The board timeline is the documented exception to sharing this exact palette: at a 56 px lane a bar has no room for texture, and seven states have to be told apart across a dense grid, so `.timeline-project-bar` uses a restrained olive and amber family — the same families the calendar already used — stepped tonally per status. Measured text-to-fill contrast is 6.4:1 to 7.9:1 and bar edges are at least 3.0:1, and the dot shape still matches the badge so the two readings agree. Hue is additive here: the bar also carries its status in text, so the calendar does not rely on colour alone.

**Decision**: the project's Miro bar (`MiroBarShell` in [`features/projects/miro-view.tsx`](../../apps/web/features/projects/miro-view.tsx)) has two rows, chosen by the user on 2026-09-27 so the agency can tell the internal board from the client's at a glance. The first row says where you are (back, project and deliverable, due date, the view switch, **Open in Miro**, **More**) and stays neutral. The second row holds the channel and what it shows (board, rounds or client versions, status, the one primary action) and is tinted by channel with the existing tone tokens: Working files takes `--tone-attention-bg` with a faint diagonal hatch, and the agency's Shared with client takes `--tone-active-bg`. Colour is not the only signal: the channel is also named in text, as the agency's **Working files / Shared with client** tabs (lock and eye icons) or the designer's **Internal** label. The client has one channel, so their second row stays plain and names no channel.

## Shared tokens

The shared shell styles are implemented in [globals.css](../../apps/web/app/globals.css). The following product values reflect the September 23 unified UI refresh; measured reference values are identified separately. Functional and visual conformance remain subject to the audit gate.

| Token                           | Target                            | Dark                           | Basis and use                                                                         |
| ------------------------------- | --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `color.canvas`                  | `#f7f8fa`                         | `#131416`                      | Implemented lighter workspace; reference dominant background was `#ededed`            |
| `color.surface`                 | `#ffffff`                         | `#1c1e21`                      | Measured panels and topbar                                                            |
| `color.surfaceSubtle`           | `#f2f3f5`                         | `#25272b`                      | Implemented subtle control surface; reference used `#f4f4f4`                          |
| `color.navigation`              | `#202226`                         | `#0f1012`                      | Implemented dark navigation; reference was `#202020`                                  |
| `color.navigationActive`        | `#36393f`                         | `#25272b`                      | Implemented selected navigation; reference was `#353535`                              |
| `color.text`                    | `#272a30`                         | `#ececee`                      | Implemented primary copy, headings, icons                                             |
| `color.textMuted`               | `#636872`                         | `#9ea1a8`                      | Implemented secondary text on light surfaces                                          |
| `color.textOnDark`              | `#f5f6f8`                         | `#ececee`                      | Decision: primary navigation (filled controls: `--on-ink`)                            |
| `color.textMutedOnDark`         | `#b4b8c1`                         | `#a3a6ae`                      | Implemented secondary navigation copy                                                 |
| `color.border`                  | `#e5e7eb`                         | `#28292c`                      | Implemented surface rules; measured home reference was `#e0e0e0`                      |
| `color.controlBorder`           | `#ccd0d7`                         | `#3a3c41`                      | Implemented stronger input boundary                                                   |
| `color.primary`                 | `#272a30`                         | `#ececee`                      | Implemented filled primary action                                                     |
| `color.focus`                   | `#272a30`                         | `#ececee`                      | Implemented 2 px ring with 4 px offset; inverted ring on dark surfaces                |
| `--on-ink`                      | `#fff`                            | `#131416`                      | Text on filled `--ink` controls                                                       |
| `--canvas-background`           | `#f3f4f6`                         | `#131416`                      | Shared board, project and single-design canvas surface                                |
| `--canvas-grid`                 | `#c5c9d0`                         | `#363739`                      | Shared 24-unit dot grid, 1.5-unit dots; follows pan/zoom                              |
| Playground canvas overrides     | `#e9e9e2` / `#bdbdb2`             | `#0f1012` / `#333438`          | Slightly darker background and dots, scoped to the Playground canvas                  |
| `radius.small`                  | `8px`                             | —                              | `--radius`. Implemented controls; reference was approximately 4 px                    |
| `radius.medium`                 | `12px`                            | —                              | `--radius-lg`. Implemented panels/cards; shared dialogs also use 12 px corners        |
| `radius.round`                  | `999px`                           | —                              | Decision: only avatars, pins, and circular marks. No token; one call site             |
| `text.xs`                       | `11px`                            | —                              | `--text-xs`. Compact annotations                                                      |
| `text.sm`                       | `12px`                            | —                              | `--text-sm`. Timestamps, counts, badges, table headers and secondary metadata         |
| `text.base`                     | `13px`                            | —                              | `--text-base`. Navigation, supporting copy, small controls                            |
| `text.lg`                       | `14px`                            | —                              | `--text-lg`. Inputs, labels, action copy, list titles                                 |
| `eyebrow.tracking`              | `0.015em`                         | —                              | `--eyebrow-tracking`. The one tracking every eyebrow-shaped rule reads                |
| `space.xs` / `sm` / `md` / `lg` | `8` / `12` / `16` / `24px`        | —                              | `--space-xs`…`--space-lg`. The four steps the stylesheets lean on most                |
| `space.page`                    | `40px`                            | —                              | `--space-page`. The page gutter                                                       |
| `border.default`                | `1px solid`                       | —                              | Measured surface separation                                                           |
| `shadow.surface`                | `none`                            | —                              | Shell/list/workspace cards use borders; draggable board cards have a subtle 2% shadow |
| `shadow.overlay`                | `0 20px 64px rgb(20 23 29 / 16%)` | `0 20px 64px rgb(0 0 0 / 55%)` | Implemented dialogs only                                                              |

Spacing uses `4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 64px`. These form an inferred four-pixel scale. Prefer 8–12 px within a compact control group, 16–24 px inside panels, 24–32 px between sections, and 36–40 px at large content boundaries. Add a new spacing value only when a named component requires it.

The implementation uses Geist from [the application layout](../../apps/web/app/layout.tsx), followed by system sans-serif fallbacks. A second, opt-in **Editorial** pairing (below) swaps the families without changing any size or weight. Body text and primary controls are 14 px, navigation and supporting rows 13 px, metadata and status badges 12 px, and compact annotations 11 px. Shared page headings are 28 px/600, section headings 18 px/600, and overview figures 30 px/600. Project chrome uses a 28 px title with smaller responsive sizes. The four supporting sizes use `--text-xs`, `--text-sm`, `--text-base`, and `--text-lg`; headings and figures use `--text-title`, `--text-section`, and `--text-metric`. The shared eyebrow uses sentence case, `--text-sm`, weight 500 and `--eyebrow-tracking`. Supporting captions remain subordinate through size and contrast rather than widely tracked uppercase text.

### Light and dark themes

`:root` in [globals.css](../../apps/web/app/globals.css) sets `color-scheme: light dark` and writes every color token once, as `light-dark(<light>, <dark>)`; the browser's own light/dark choice, ordinarily the operating system's, picks a side, so native controls (scrollbars, form fields) theme themselves along with the product. `:root[data-theme="light"]` and `:root[data-theme="dark"]` each pin `color-scheme` to one side once a preference is set, overriding the OS default. The preference — `system`, `light` or `dark`, default `system` — is defined in [`features/workspace/theme.ts`](../../apps/web/features/workspace/theme.ts) and stored in `localStorage` under `dawes-theme`; choosing System removes that key rather than writing it. A short inline script from the same module runs in `<head>` in [`app/layout.tsx`](../../apps/web/app/layout.tsx), before hydration, and sets `data-theme` on `<html>` from the stored value, so a saved choice never flashes the other theme on load; `<html>` carries `suppressHydrationWarning` because the server cannot know that stored value. The sidebar footer's [`ThemeToggle`](../../apps/web/features/workspace/theme-toggle.tsx) button reads `Theme: System`, `Theme: Light` or `Theme: Dark` with a matching Monitor/Sun/Moon icon; each click saves and applies the next choice in that order (System → Light → Dark → System), and a change made in one tab reaches this browser's other open tabs through the native `storage` event.

Type pairings follow the same pattern. [`features/workspace/font.ts`](../../apps/web/features/workspace/font.ts) stores `geist` (the default, no key) or `editorial` under `dawes-font`, its `<head>` script sets `<html data-font>` before paint, and the sidebar's [`FontToggle`](../../apps/web/features/workspace/font-toggle.tsx), directly above the theme row, reads `Font: Geist` or `Font: Editorial`. Families are never named in feature CSS; they come from four tokens on `<body>` in `globals.css`:

| Token | Role | Geist (default) | Editorial |
| --- | --- | --- | --- |
| `--font-text` | body copy and controls | Geist | Inter |
| `--font-display` | `h1`, `h2`, headline figures (overview stats, flight count, credits used) | Geist | Fraunces |
| `--font-data` | small figures read as data: count badges, board result count, zoom level, timecodes, budget figures, credit numbers, file-type labels | Geist | JetBrains Mono |
| `--font-code` | literal code such as colour values | Geist Mono | JetBrains Mono |

`h3` and smaller text stay in the text family so dense UI remains legible. `--display-tracking` loosens the tight heading letter-spacing slightly for the serif. The Editorial fonts load with `preload: false`, so the default pairing downloads nothing extra. To add a pairing: add its value in `font.ts` (and the head script), load its families in `app/layout.tsx`, and write one token block keyed on its `data-font` value.

The styling boundary extends to color: a color that only one feature uses is written `light-dark()` in that feature's own stylesheet, and a color shared by two or more features is a token in `globals.css`, the same rule as any other shared-versus-feature selector. A few surfaces are deliberately identical in both themes rather than tokenized: the dark sidebar (`.login-story`, `.sidebar-collapse`, `.profile-bar`, `.mobile-sidebar-close`) keeps its navigation color regardless of theme, comment pins (`.artwork-pin`, `.video-pin-marker`) keep one look over artwork in either theme, video letterboxing (`.artwork-video`) stays black, and `::selection` keeps its dark olive highlight. A whole surface that is dark in both themes uses the `.dark-surface` scope from `globals.css` instead of literal colors: it re-declares every token on its own element and fixes `color-scheme: dark` there, so everything inside resolves the dark palette (the Playground canvas and Miro mode's asset strip). Such a surface fills with `--menu-surface`, the sidebar colour as the page's theme resolves it, declared on `:root` alone so the scope does not re-resolve it — all four listed with their reason in `theme-colors.test.ts`'s `themeIndependent` map. A declaration whose property ends in `shadow` may also keep a literal black value, any opacity, outside `light-dark()` — the board and client identity cards' `0 3px 14px rgb(0 0 0 / 7%)` and the zoom pill's `--xy-controls-box-shadow: 0 4px 18px rgb(0 0 0 / 8%)` among them — because black reads as a shadow regardless of the surface under it. Uploaded client logos need their own fix rather than a token: they are often a dark mark on transparency, so `img.client-mark` seats them on a small light plate in dark mode — `background` and a 3px `box-shadow` ring, both `light-dark(transparent, #f4f4f5)` — while light mode leaves the plate transparent.

[`features/shared/theme-colors.test.ts`](../../apps/web/features/shared/theme-colors.test.ts) is the standing gate behind all of this, parallel to `stylesheet-boundary.test.ts` above: it parses `globals.css` and every feature stylesheet and fails on any literal color found outside `light-dark()` unless its selector is named in `themeIndependent` (each with a stated reason) or its property ends in `shadow` and holds only black. The same file measures WCAG AA contrast on both the light and dark side: 4.5:1 or better for the text-on-surface token pairs (`--foreground`, `--muted` and `--on-ink` against their surfaces, plus the sidebar and status-tone pairs), and, for the board timeline's eight bar variants (the default bar and its seven statuses), 4.5:1 or better for the bar's text against its fill and 3:1 or better for the bar's edge against the lane surface — so a dark value that passes the color gate but reads poorly still fails the suite.

Tokens are authored with `light-dark()`, but no browser ever receives that function literally: Tailwind's PostCSS step and Lightning CSS compile it into a `--lightningcss-light`/`--lightningcss-dark` custom-property fallback, toggled by `color-scheme` and `prefers-color-scheme`, so a browser without native `light-dark()` support still gets both themes rather than a missing color. Confirmed by serving `/login` and inspecting its compiled stylesheet: it contains no `light-dark(` and 40+ `--lightningcss-light`/`--lightningcss-dark` declarations toggled under `@media (prefers-color-scheme: dark)`. If the Content-Security-Policy in [`next.config.ts`](../../apps/web/next.config.ts) ever drops `script-src`'s `'unsafe-inline'`, allow the fixed [theme script](../../apps/web/features/workspace/theme.ts) by its sha256 hash instead, since its content is static and never varies per request. This sits beside the product's existing reliance on the top-layer `<dialog>` element (used by both [Modal](../../apps/web/features/shared/modal.tsx) and Playground) and the `inert` attribute (Playground's covered controls), and on the `:has()` selector, which `.client-page-heading:has(.page-actions > :not(.page-bell))` already depends on.

### Unified document surfaces

Non-client document pages share `--content-width: 1280px`, a 40 px desktop gutter, 32 px section spacing and 24 px panel padding. Client sections use the full available width with 16 px desktop and 12 px mobile gutters, the plain `--background` page surface and a white title/action card below the floating workspace header. The dot grid stays on the xyflow canvases; behind document content it competed with the text. Briefing/review filters, Files tools and Brand Hub section links live inside that card. Existing responsive breakpoints reduce the gutter. The page header and its action group align at the top; overview date and creation action form one group. Overview figures use separate bordered panels. Briefings, credit history, review cards and settings sections use the same white surface, neutral border and 12 px panel radius; credit activity and credit requests render as the same one-line rows as briefings and reviews; artwork geometry is unchanged.

`.section-tabs` in `app/globals.css` serves Brand Hub, briefings, credits and settings. It provides one scrollable row, a 48 px target and an underline for the active item. Each feature retains its navigation semantics: routes remain links with `aria-current`, and filters remain buttons with their existing state attributes. Feature styles own placement only. See the [shared UI contract](../../apps/web/features/shared/README.md).

Controls use 40 px standard and 32 px compact heights, with the existing larger mobile targets. Inputs, labels, dialogs and empty states inherit the same tokens. The supplied white logo remains on dark navigation; login retains its branded split layout with a contained white form panel. The Playground retains its darker local canvas tokens and existing motion behavior.

## Reference geometry and fresh shell decisions

The following measurements explain the source hierarchy. They are not pixel-level acceptance constraints. The current implementation uses a 216 px desktop sidebar. Non-client document pages have a 64 px topbar, 40 px desktop content inset and 1280 px maximum wrapper including padding; client surfaces use the floating layout described above. The sidebar narrows to 204 px below 1200 px and becomes a drawer below 901 px. The collapsed desktop rail is 76 px. The project inspector is 380 px wide with viewport insets on phones. Let the canvas fill the remaining work area; avoid stacking multiple persistent toolbars above it.

| Region                   | Desktop target                                               | Evidence / behavior                                                                                |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Sidebar                  | 248 px wide, full viewport height                            | Measured agency, client, and designer captures                                                     |
| Brand area               | Approximately 82 px tall; 20 px horizontal inset             | Inferred from home capture                                                                         |
| Navigation row           | 36 px high; 12 px outer inset                                | Measured home selection is x=12 to x=236                                                           |
| Client navigation        | One searchable client switcher and a flat icon list          | The active workspace stays clear even with many clients                                            |
| Topbar                   | 56 px high                                                   | Measured boundary y=56                                                                             |
| Board/project action bar | Approximately 56 px high                                     | Measured breadcrumb/action row below topbar; the board now folds this row into its identity header |
| Board filter strip       | Approximately 58 px high in the reference                    | Current filters open from the floating left toolbar                                                |
| Canvas bottom toolbar    | 42 px high in the reference                                  | Current zoom pill anchors to the bottom of the floating tool dock                                  |
| Home and credits content | Approximately 1052 px maximum width, centered in main region | Measured x=398–1450 on home/credits                                                                |
| Home top content inset   | 40 px below topbar                                           | Inferred page eyebrow y≈100                                                                        |
| Home metric strip        | 96 px high, six equal cells on wide screens                  | Measured x=398–1450, y=208–304                                                                     |
| Home attention list      | Approximately 64 px rows                                     | Measured list boundaries; allow growth for long text                                               |
| Wide page inset          | 32–36 px                                                     | Board, Brand Hub, and briefing captures                                                            |
| Project inspector        | Approximately 336 px                                         | Measured starts at x=1264                                                                          |
| Design comments panel    | Approximately 340 px                                         | Measured starts at x=1260                                                                          |
| Brief summary            | Approximately 270 px, 28 px gap from wizard                  | Measured starts at x=1294 on briefing detail                                                       |
| Brand Hub secondary nav  | Approximately 186 px, 32 px gap                              | Measured x=284–470, main content starts x=502                                                      |

Agency Home summarizes only authorized studio data and provides one attention queue. Client Home opens that client's board. Designer My work lists assigned production work. Counts must derive from the same scoped data used by the corresponding list; the screenshot's fixture counts are not production values. Navigation must not imply access to unassigned client work.

Controls people look for by name carry that name. Signing out was an unlabelled icon wedged beside the account block and could not be found at all; it is a full row in the sidebar footer now, and its accessible name comes from the visible text rather than an attribute. A page that already exists but sits three clicks inside another one is, in practice, missing: Team has its own agency-only sidebar destination at `/team`; the old `/settings/team` URL redirects there. Settings no longer repeats Team as a tab.

Keep one primary page title, one active context marker, and one action cluster per screen. Show the current task's primary action directly; place secondary actions in a labeled menu or contextual inspector. Account, search, and notifications are global controls without repeated sidebar/topbar copies. Use one searchable client switcher in the sidebar and show its workspace destinations once at the top of the client pages. Single-client accounts use a direct workspace link. The board repeats the selected context in its own title: the board titles itself with the client's identity header, and every other page inside the workspace titles the work itself rather than repeating the client name as a decorative heading. Place settings and client creation in the agency workspace controls for members with the required permission.

### Workspace topbar

Every client surface uses the shared floating `workspace/canvas-header.tsx`. The
`board-workspace` and `client-page-workspace` shell classes hide the desktop topbar and zero
`--topbar-height` at 901 px and above. Board/project headers overlay the canvas; other client
sections keep the identity/profile header sticky inside the main scrolling region. Non-client
routes retain the studio identity in the shell topbar.

On mobile the topbar carries the navigation drawer trigger. Every client surface keeps one
notification bell immediately left of the profile in the account card. Its nonmodal, top-layer
popover opens directly below that card with a short downward animation, bounded width/height and
an internally scrolling feed. Reduced motion skips the animation. Close/Escape returns focus;
outside clicks dismiss; opening does not mark notifications read. Non-client pages retain their
topbar link. Client links never appear in the sidebar.

Disclosure panels belong to their trigger: the board filter menu opens as a popover under its button and closes on Escape or an outside click.

### Brand Hub sections

The eight sections are a row of links under the title, in the order of their groups, with the current one carrying `aria-current="page"`. Where you are and what else there is are the same glance; a select hid the second half of that. They are links rather than buttons because they are routes — a section opens in a new tab and has its own address, which the select it replaced could never offer, and browser tests drive them the way a viewer does instead of calling `selectOption`. The row scrolls sideways rather than wrapping, so the group order survives every width: the links scroll within their title card without causing page overflow.

### Canvas identity header

Two compact cards float over the work area: the approved client logo alone (48px tall on every client page, 32px on phones and short windows, and up to three times as wide so wide wordmarks keep their size; the name stays its accessible label and tooltip; it links to that client's Overview, or to the board for a designer, who has none) and quarter selector at the left; the signed-in viewer’s own profile link at the right. There is no full-width board title strip or project-board caption. The period trigger has an intrinsic width. All periods is the default; a compact panel exposes year arrows, the four quarter buttons and their month ranges together without an internal scrollbar. Q1–Q4 filter overlapping project dates and retain undated work across all views. All client destinations appear as visible text links beside the quarter, with the active page underlined. They wrap on narrow screens instead of using a scrollable menu. Projects and all other client pages share the floating identity/navigation/profile component; only the board includes the quarter control. Neither duplicates them in the sidebar. Global actions and the client switcher stay in the sidebar, with compact spacing in short client-workspace windows. Board actions live in a floating left toolbar: search, filters, the five view icons, allowed briefing creation. Search/filter panels open to its right and hold the result count and clear action. Keyboard focus enters the panel on open and returns to the trigger on Escape or close; outside clicks dismiss without discarding the filter state.

Canvas has the shared zoom pill (zoom out, zoom level, zoom in, fit) at the bottom left of the work area, under the rail's column. Manual zoom reaches 10%, while automatic fitting keeps a 40% readability floor. The grid fills the entire work area beneath both cards; it has no reserved side strip. List, Timeline, Kanban and Calendar reserve a gutter to keep their content clear of the toolbar. On viewports up to 900 px wide or 700 px tall, the cards become horizontal bars at the bottom, with zoom below the main bar and panels opening above it. Structured views reserve bottom space, while Canvas continues beneath the cards. The board fills the height below the shared mobile topbar. Its identity/profile cards overlay Canvas, while structured views leave their top edge clear. Each work surface contains its own scrolling. Canvas fits only after its current element is measured, leaves room below the identity card and refits when that viewport changes size. Save/load failures expose usable retry controls below the floating header.

Project pages use a full-width floating title card below the client identity/account cards.
The title is 28 px on desktop, with status and due date alongside and responsive wrapping. Channel
controls sit below on the left and All deliverables on the right. Project details, Conversation and
Playground sit in a floating tool bar at the bottom centre of the canvas: a 16 px-radius pill with
40 px buttons, a divider before Playground and the open panel's button selected, after the
Higgsfield canvas the user chose, in the product's monochrome palette. On phones it moves to the
bottom right. While a side panel is open, the bar re-centres in the space between the zoom pill and
the panel, and hides on a canvas narrower than 800 px until the panel closes. During design
review, a compact deliverable toolbar replaces the channel row and the bar, and includes Playground.
The artwork has its own space above the design/version navigation footer. Desktop double-click,
keyboard activation, the explicit open arrow and a single touch tap enter feedback.

Conversation and details share a floating inspector with close/Escape and focus return. Design
feedback uses a wider 310–380 px column, compact heading and scope controls, an independently
scrolling history and a growing 60–120 px composer with adjacent send action. Show privacy context
once. Preserve scoped drafts, image/video pins, read errors and full historical review notes.

### Welcome dashboards

The client Overview (`/clients/:clientId/overview`) and the designer's `/home` are dashboards built from the same shared pieces: [`WelcomeHeader`/`welcomeTitle`](../../apps/web/features/shared/welcome-header.tsx), the `.overview-stats` tiles, and the [`OverviewPanel`](../../apps/web/features/overview/overview-panel.tsx) three-column layout ([`overview.css`](../../apps/web/features/overview/overview.css)). `WelcomeHeader` renders an eyebrow (the page's role name — **Overview** on the client route and the studio's `/home`, **Home** on a client's `/home` when it has more than one workspace, **My work** on the designer's `/home`), an `<h1>` heading, an optional one-line subtitle, and the caller's own action group. The client Overview passes `card`, so its header sits inside the shared white `client-page-heading` card like every other client route; the studio's and the designer's `/home` keep the plain, non-card heading other document pages use. The heading is `welcomeTitle(display_name)` — "Welcome back, `<first name>`" — on a viewer's own dashboard (the client's own Overview, and the studio's and the designer's own `/home`); the studio reading a client's Overview instead sees "What `<client>` sees", since that page belongs to the client, not the studio. Each header carries a date — a weekday-date subtitle on the client's own reading of its Overview, a `home-date` span beside the title on `/home` — except the studio's reading of that same Overview, which shows the fixed subtitle "This client's overview, as they see it." instead, with no date. Each also carries at most one action beside it: **New briefing** on the client Overview (for both the client's own reading and the studio's), **New client** on the studio's own `/home`, and none on the designer's `/home`, which shows only the date.

The `.overview-stats` tiles carry a number, a label and — on these two dashboards only — an optional one-line note; their base box/number/label rules live in [`globals.css`](../../apps/web/app/globals.css), shared with the studio's own `/home` figures, which carry no note. The client Overview shows three — **Credits remaining** (a `used`/`total` note from the ledger), **Active projects** (a delivered-this-month note) and **Needs your review** — and the designer's `/home` shows four — **Active projects**, **Your turn**, **In studio review** and **Delivered this month** — with no credits figure or word anywhere on a designer's dashboard. Only the client Overview adds an **In flight** strip below the tiles: three counts in one bordered row — briefings **with the studio**, projects **in progress**, and projects **delivered** overall.

Both dashboards end in three [`OverviewPanel`](../../apps/web/features/overview/overview-panel.tsx) columns — **What's moving**, **Your turn** and a **Recently shipped**/**Recently delivered** column — each holding up to `ROW_LIMIT` (5) one-line rows ([`overview-model.ts`](../../apps/web/features/overview/overview-model.ts)), sorted soonest-due first, oldest-waiting first or most-recently-delivered first. The client Overview's columns each carry a **See all** link into the board or Reviews; the designer's `/home` has no board-wide list route to point one at, so its columns carry none. `.overview-columns` is a `1.4fr`/`1fr`/`1fr` grid that stacks to one column below 1000 px.

Isolation: the client Overview renders exactly what the client itself is allowed to see, for both readers. Reviews go through the client's own **Waiting for you** rule (`inReviewTab("waiting", row, "client")`), which drops every `internal` row for every viewer — including the studio's "What `<client>` sees" reading of the same page — so no designer identity, assignment, internal note or unpublished version reaches it. A designer who opens the route by hand is redirected to that client's board before the tiles render.

### Client people and attribution

Settings → Clients gives each client row a **People** button in place of Invite. Its `lg` dialog
stacks **People** (one `settings-list-row` per person: name, email, a quiet **Remove**), **Invited**
(email and "Invitation expires <date>", read-only) and a primary **Invite person** that opens the
existing invite dialog above it. Remove confirms in a second dialog — "Remove <name>?", "<name>
loses access to <client>." and, for the last person, "<client> will have nobody who can sign in
until someone is invited." A removal still blocking sign-in reads "Access removed · Account block
pending" with **Finish removal**.

Your account shows a client person one `settings-section` per client, "<client> team": the people
as rows (the viewer marked with a "You" badge), "To add or remove someone, contact the studio." and a
**Notifications** segmented control — **My requests** / **All <client> activity** — that wraps on a
phone. Emails wrap anywhere (the shared `.settings-list-row p` rule).

Attribution reads the same everywhere: "Requested by <name>" on the Briefings list (its own column,
dropped below 1000 px), under the briefing's title (with the studio's small quiet **Change**) and in
the project's details; "Approved by <name> · <date>" or "Changes requested by <name> · <date>" in
the Reviews note column and the project's version history. Someone who left reads "<name> (left)" to
the studio and "Former member" to the client; designers see neither.

## Board and project canvas

The board and project canvases use XYFlow/React Flow. Use a shared canvas frame with a subtle dot-grid background, compact zoom/fit controls, and persisted positions or viewport where appropriate. Pointer and pan behavior must be understandable; mode controls can appear contextually rather than occupying a permanent full-width footer. The canvas is an interactive work surface, not a static screenshot or a decorative background behind a conventional grid.

Every `ReactFlow` instance sets `proOptions={{ hideAttribution: true }}`, so the library's attribution badge does not sit over the bottom-right corner of the work surface. The package is MIT licensed and its licence carries no interface attribution clause, so hiding the badge is permitted; xyflow asks that projects removing it subscribe to React Flow Pro to support the library, which is a request rather than a condition. Restoring the badge means dropping the prop from the board, project, design viewer and Playground canvases.

Canvas, List, Timeline, Kanban and Calendar are mutually exclusive views selected by five icon buttons. Accessible names, native tooltips and `aria-pressed` identify each choice. A saved view is personal to the authenticated user and client. Pending changes appear immediately; failed saves restore the confirmed view and provide retry.

Timeline and Kanban occupy full work surfaces. Wide Kanban boards fit all seven columns; narrow boards scroll horizontally inside their boundary and vertically within each column. Calendar fits complete Monday-first weeks into the remaining height, with compact project deadlines and scrolling inside busy days. Below 900 px of board width it becomes a monthly agenda. Undated projects remain accessible in their own bounded section. Calendar month and Timeline period/scale survive switching views.

The seeded workspaces are not uniform, and the board is judged on the busy one. Nine clients carry two projects under a single campaign; SABRE carries the workspace the reference package documents — three campaigns, seven projects across four statuses, and two briefings that have not become projects yet — so Timeline shows seven contending lanes and Kanban fills four of its seven stages. A layout decision that only reads well on a two-project board has not been tested.

Canvas composition groups project previews inside campaign frames, each holding a row of project cards and stacked vertically. Its node model no longer contains planning widgets. Selection, search and campaign/status filters are shared across all five views; they never widen backend project scope. Empty campaigns and contextual briefing creation remain available in Canvas.

A project card selects on one click, with visual selection, `aria-current` and a live announcement. A double click or its explicit open control navigates to the project's own page; it opens the project work surface. The project feature remains the sole owner of production, publication and review actions. Dragging stays confined to the card's grip, so moving a card is never read as selecting or opening it. Every card sits on its campaign's grid (one card width plus the 20 px card gap per column, one card height plus the gap per row), so neighbouring cards always keep the same spacing, including positions saved before the grid existed. A dropped card settles on the cell beneath it; dropping it on another card swaps the two, and dropping it on the New briefing slot takes the nearest free cell. Each card carries the leading artwork the viewer is allowed to see — working designs for the agency and the assigned designer, published designs for a client — through a short-lived signed URL; most projects have none, so the empty band is a quiet, deliberate tile rather than a broken image.

The timeline shows an understandable date interval, previous/next interval navigation, Today, date columns, and project bars. Use the current application date; do not copy “Sample today.” The Kanban regroups the same scoped records by status and navigates only: `status` is absent from the single column grant on `public.projects` and no RPC accepts an arbitrary target status, so a drag-to-transition or status menu would fail against the database. Do not ship one until an authorized transition exists; when it does, dragging and the menu must both invoke it and a keyboard-accessible status action must accompany them. The workflow labels are Brief, Designing, Agency review, Client review, Revision, Approved, and Delivered; a visible label and shape accompany every status marker, and the status badge's tone hue (see the Decision above) is additive rather than the only cue. Reuse these semantic states across views without rendering every possible state as persistent chrome.

Project canvases group **deliverable format → version → design**, with multiple designs in a version. Deliverables are stacked frames: a title bar with the deliverable name centred, then one border around all of its versions and its Add version row (user request, 2026-09-24). Each version is a horizontal row with a fixed metadata column on the left and artwork tiles to its right. Preview proportions follow the deliverable dimensions; five previews remain visible before a more-designs control. An editable row ends with a dashed **Add design** tile, and a full-width dashed **Add version** row sits below all versions of the deliverable. Empty editable rows show the same creation tile. Header plus buttons are removed. These cards follow the board’s briefing/campaign creation pattern and are included in `canvas-layout.ts` bounds to prevent overlap.

The agency can start working content from either Working files or Shared with client. Creation cards in the shared tab identify their Working files destination and switch there before opening the existing dialog; Add design targets the latest internal version of that deliverable. They do not modify a publication. Client accounts retain published artwork/review controls and receive no production actions or internal reads. The canvas opens pinned to the top at a readable width fit; tall projects pan rather than shrinking every version to fit their total height. Formats, custom names, dimensions, quantities and Original/Adaptation scope remain deliverable metadata, not separate project charges.

Opening a design presents the artwork on the canvas and comments to its right. The artwork preserves its real dimensions and aspect ratio, scales to available space, and can be zoomed. A bottom carousel moves between designs within the selected version; selecting another version is a separate action. Preserve the selected design and version when opening the inspector or switching comment channels.

Pins are stored relative to the design's intrinsic coordinate space, not screen pixels. They must remain anchored after pan, zoom, resize, fit-to-view, reopening, and publication. Pin selection highlights its thread; selecting a thread highlights its pin. A pending pin is visibly distinct until its comment is saved. Moving between designs, versions, or channels must not show unrelated pins or retain an unsent draft on the wrong design.

A video design plays in the same viewer slot an image occupies, with native controls in place of the click-to-zoom canvas interaction — the design still sits inside the same xyflow node, but the node hosts a `<video>` element instead of an `<img>`. Placing a pin on a still image needs only a point; placing one on video needs a point _and_ a moment, so the pin tool pauses playback on click and records the player's exact `currentTime` alongside the click coordinate as the pin's `pin_t`, in seconds from the start of the file. A pin with no time belongs to a still image and is always shown; a video's pins are windowed to the ones near the current playhead position so a long recording with many comments does not paint every pin over the same frame at once. Below the player, a marker track lays out every timed comment along the video's duration as a row of position-proportional buttons — the calendar-strip idiom applied to a timeline instead of a date range — and clicking one seeks the player to that pin's moment and selects its thread, the same cross-highlight relationship a spatial pin already has with its comment.

## Playground canvas

**Playground** is a project-only board that rises from the bottom over the entire viewport and slides back down on close. Its named native dialog enters the browser's top layer, covering the sidebar, mobile topbar, client/project headers and work area. Width is 100vw and height is 100dvh, with no rounded frame or project-header inset. A transparent backdrop preserves the slide's reveal of the project beneath it. Covered controls are inert and body scrolling is locked; the underlying project stays mounted to retain viewport and selection. Its compact single-row header contains title/team scope, icon tools, save status and the return icon. Reduced-motion users receive an immediate transition. Escape and native cancellation preserve unsaved/busy protections. Opening from the design-upload form temporarily closes its dialog while preserving mounted fields/file; **Back to upload** reopens the same form after exit. See the [current interaction contract](project-playground-and-video-optimization.md) and [feature README](../../apps/web/features/playground/README.md).

Use the existing quiet typography, neutral surfaces and restrained borders. Notes, image previews and document cards share selection and editing controls. Drag/resize saves after the gesture; labeled position/size fields provide keyboard access to the same geometry. Multi-file selection/drop reports rejected files individually while valid files continue. Pan, zoom and fit operate within the canvas, and the editor remains reachable at mobile widths.

Saved content and geometry persist; unsaved local edits have explicit save/discard states. In-flight work blocks close with visible feedback, while failures retain the original attempt for retry. Revision conflicts preserve edits and offer a deliberate reload. Deletion confirms and retains retry state until file cleanup succeeds. Do not represent these actions only with a disappearing toast or imply that unsaved local files survive browser navigation.

## Information boundaries and review logic

Role differences come from authenticated, server-enforced permissions, not a “Preview as” dropdown. Agency members can use two explicitly labeled channels: **Agency & designer** and **Agency & client**. The designer sees only the internal channel for assigned work; the client sees only the agency/client channel. Client-facing agency messages use the Studio identity. Client responses, notifications, file names, activity items, previews, and accessible labels must not reveal designer names, avatars, assignments, or internal authorship metadata.

Agency publication creates an immutable snapshot of the selected version's designs for the client. Editing an internal design later must not silently mutate the shared client version. Only authorized agency actions publish; the designer submits to the agency, and the client requests changes or approves a shared publication. A comment belongs to its project, version/publication context, optional design, and channel. The design viewer holds a design's own comments and image/video pins; the version's studio note, review decision and unpinned discussion live in that version's panel on the board, and a pending client review is offered in both. Version cards retain status and a comment shortcut instead of truncated feedback blocks. Generic project Conversation retains its aggregate of unpinned messages. Existing review records are preserved; drafts and queries distinguish version, design and channel.

Approvals, revision requests, assignments, delivery, uploads, and notifications need pending, success, and actionable failure states. Do not optimistically announce success when persistence has failed. A delivered state must resolve to real authorized files; a share link must resolve to the intended client perspective and access boundary.

## Briefings, credits, and brand content

The briefing flow is Service → Details → Review. The 20-service catalog supports search and category filtering, with a visible selected-service summary. A new briefing must not implicitly inherit the previously visited campaign. Details starts with project title and campaign, then creative direction and service questions, formats, and timing/files. Standard sizes are prefilled under expandable Size settings; custom dimensions remain exposed. Use plain-language Design approach labels, retain optional brand overrides and focus the error summary after invalid submission. A local Save draft to add files action explains the attachment prerequisite. Keep one step-navigation bar and a review summary before sending; do not restore the redundant “FOR SABRE / Draft a brief…” heading.

Brand defaults can be retained or customized per briefing. The summary reflects the selected campaign, named deliverables, quantities, dimensions, service estimate, and turnaround. Back/Next preserves valid drafts; submission validates the complete request. Agency acceptance confirms the total quote, requires an explanation for applicable adjustments, creates one project, and debits credits once in an atomic operation. Repeated clicks, retries, and concurrent acceptance must not duplicate the project or debit. Insufficient balance prevents acceptance without losing the draft or quote.

Credits uses a quiet financial layout: current balance, relevant usage context, and a clear activity list, one line per entry, with dates, projects, campaigns, amounts, and balance after. Reports and export belong to contextual actions instead of a second dashboard unless a separate reporting task justifies it. Debit/credit signs and row labels communicate meaning without color. Detailed deliverable scope explains a project debit, not independent duplicate charges. Totals, implemented filters/reports, project details, and exported CSV must reconcile to the ledger. Any credit addition must reflect a real authorized ledger action, with no implication that a payment occurred unless payment processing exists.

The reference Brand Hub contains ten sections: Brand Overview, Logos, Colors, Typography, Visual Style, Product Library, Brand Assets, Templates, Copy & Messaging, and AI Brand Instructions. Consolidate these into a small number of useful content groups rather than copying ten permanent navigation entries. Agency editing persists authorized client-specific data. The current product has nine sections, Files among them: Templates is retired and Products (with an image and a link per product) is a tile in Assets, both old routes redirect to Assets, and legacy private drafts remain directly accessible. Assets is a directory of nested client-scoped folders shown as compact folder tiles (the same `FolderTile` as Files campaigns) with a path back up; it holds files and HTTPS links. The agency organizes; clients may add folders, images and links; designers browse. Deleting a folder moves its contents up to its parent. Every Brand Hub section uses one compact scale (`brand.css`): 14 px gaps between panels, 20 px panel padding (16 px on phones), 15 px panel titles, 14 px body text and tight 6 px list rhythm; showcase text stays modest (the overview name at 26 px, messaging lines at 17 px, type specimens at 26 px) so no section reads larger than its neighbours. File, asset and product cards share 180 px minimum columns with 112–120 px previews. Private drafts remain separate from briefs/projects/credit debits. AI Brand Instructions represents reusable brand context; do not imply a live AI generation service exists. Clipboard actions have success feedback and a manual-copy fallback.

## Responsive and accessibility decisions

No responsive captures exist in the package. These are implementation decisions to validate, not inferred mobile designs.

| Viewport                | Required adaptation                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1600 × 1000             | Full shell and side panels; assess the fresh design against the principles, not pixel identity                                   |
| 1440 × 900              | Normal desktop; maintain a clear hierarchy with fluid canvas and centered content                                                |
| 1024 × 768              | Collapsible sidebar; inspectors become overlays if canvas would be unusably narrow; metrics wrap to three columns                |
| 768 × 1024              | Navigation drawer; Brand Hub section links scroll inside their row; briefing summary collapses; metrics wrap to two columns      |
| 390 × 844 and 320 × 800 | Single-column forms and lists; menus contain secondary actions; controls remain reachable; canvas pans inside its bounded region |

Document-level horizontal overflow is a defect. Timeline and canvas may pan or scroll within a visibly bounded, labeled region. Tables may scroll horizontally within their own region or use equivalent stacked rows while preserving headers and action labels. Never scale the entire application down to fit a phone. At narrow widths, a bounded artwork canvas is followed by the feedback panel in a scrolling viewer body, preserving draft and selection. Short windows also scroll the viewer body to keep the floating header and viewer controls clear. Dialogs fit the viewport and scroll internally when necessary; their close and confirmation actions remain available.

Use semantic headings, real buttons and links, labeled form fields, table headers, descriptive empty states, and a skip-to-content link. Dialogs manage focus, close with Escape when appropriate, and return focus to their trigger. Interactive canvas controls and pins have accessible names; provide list/thread access that does not require precise pointer input. Focus visibility must survive both white and dark surfaces. Aim for at least 4.5:1 normal-text contrast, 3:1 large text/non-text control contrast, and 44 × 44 px touch targets; the production audit must measure these targets before asserting compliance. A 32–36 px desktop button may have a larger touch hit area without changing its visual dimensions.

Every "nothing here yet" reads in one language: `.empty-state` — white surface with a solid neutral border, centred icon, heading and one supporting line, plus the action that recovers from it where one exists. A slot too small for that treatment adds `.empty-state-compact` (the kanban column, a version row on the project canvas) rather than inventing a private rule; the slot keeps only its own size. A route that is loading says `Loading …` through the shared `PageStatus`, including the shell's own wait, so one navigation shows one message in one layout; softer verbs are reserved for a wait that is a check rather than a fetch. A route that fails states the failure once, in its heading, with a plain explanatory paragraph under it — not a second time through `FormError`, whose `role="alert"` would announce it twice.

An action that destroys data confirms, and it confirms in the product's own dialog: removing a designer from a project, removing a briefing attachment or deliverable, and leaving a template draft with unsaved changes all open the shared `Modal`. `window.confirm` is not used anywhere.

The shared [Modal](../../apps/web/features/shared/modal.tsx) uses a native modal dialog for the browser's top layer and background inertness, plus explicit Tab/Shift+Tab cycling for predictable focus containment. Its controlled API is `open`, `onClose`, `title`, `children`, optional `description`, `footer`, `size` (`sm`, `md`, `lg`), and `initialFocusRef`. It names the dialog from its heading, focuses the heading or supplied target, handles Escape/backdrop dismissal, locks background scrolling, and restores the previously focused element on close. Ordinary forms use this primitive. Playground uses its own fullscreen native dialog to retain the canvas layout and guarded entry/exit animation. The upload consumer temporarily closes its Modal while retaining the mounted form, then reopens it after the Playground exit completes.

Support keyboard navigation, reduced motion, 200% browser zoom, long project/client names, multiple-line comments, validation messages, and slow or failed network requests. Status, selection, validation, and saved-state feedback must not depend only on hue, animation, or a disappearing toast.

## Component ownership and duplication

Follow feature colocation: briefings own their wizard and service-driven fields; projects own versions, design viewing, and inspector behavior; credits own ledger display and report filters; Brand Hub owns brand sections and personal drafts. Share a component when it has at least two genuine consumers. The shell, page heading, button/input primitives, dialog, empty state, status indicator, table treatment, and canvas frame are suitable shared patterns. Avoid a single monolithic component containing every role and feature, or separate copied applications for agency/client/designer.

The same project entity drives Home, Board, Reviews, Credits links, and notifications. Use shared display rules for project names, statuses, dates, quantities, and credit amounts. Role-specific visibility does not justify duplicated mutable state or parallel business logic. Derived counts must have one authoritative definition.

### Interface vocabulary

One concept, one word. The interface uses these nouns and no synonym of them:

| Concept                                      | Word                                               | Not                         |
| -------------------------------------------- | -------------------------------------------------- | --------------------------- |
| A client organisation                        | **Client**                                         | workspace, client workspace |
| The studio's own account and settings        | **Studio**                                         | workspace                   |
| The required output a briefing commissions   | **Deliverable**                                    | —                           |
| The image produced inside a version          | **Design**                                         | artwork                     |
| A downloadable file on `/clients/:id/assets` | **File**, and **Working file** for a source upload | asset                       |
| A file in the Brand Hub library              | **Asset**                                          | file, resource              |
| A brief document                             | **Briefing**                                       | brief                       |
| A person a project is assigned to            | **Designer**                                       | creative partner            |
| A record on `/notifications`                 | **Notification**                                   | update                      |
| The billing unit                             | **credits**                                        | cr                          |

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
  opens with `@import "tailwindcss"`, followed by a `:root` block of 23 custom properties (colors,
  radii, the type and spacing scales, the eyebrow tracking, and the sidebar/topbar geometry) and an
  `@theme inline` block that maps four of them —
  `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono` (the last two read the type-pairing tokens `--font-text` and `--font-code`) — into Tailwind's theme,
  so a utility class such as `bg-background` resolves to the same token the hand-authored CSS
  reads. Reach for a Tailwind utility for one-off layout or spacing on new markup; reach for the
  `:root` token, not a hardcoded value, whenever a color, radius or the shared shell geometry is
  needed. Beyond that bridge, the application is hand-authored CSS, not a Tailwind component
  system — there is no utility-first componentry to adopt here.
- **`apps/web/app/globals.css`** (1,132 lines: 1,105 after the Task 5 split, down from 2,221, plus later shared-token work) holds the
  `:root` tokens and `@theme` block above, the reset and base element styles (`*`, `html`, `body`,
  headings, links, focus states), and the styles of the shared primitives in
  `apps/web/features/shared/` — `Modal`, `FormError`, `PageStatus`, `SearchField` — plus the older
  base classes every feature composes with (`button`, `icon-button`, `panel`, `toolbar`,
  `empty-state`, `page-heading`/`section-heading`, the `form-*` classes). Nothing feature-specific
  belongs here.
- **`apps/web/features/<feature>/<feature>.css`** holds every rule specific to that one feature —
  `board/board.css`, `board/timeline.css`, `workspace/workspace.css`,
  `auth/auth.css`, and the rest, one stylesheet per feature, plus `shared/forms.css` for the shared
  form-layout classes (`stack-form`, `form-row`, `checkbox-label`, `form-actions`), loaded once
  globally by `app/layout.tsx`.

**The multi-feature override.** A namespace that reads as feature-specific by name stays in
`globals.css` regardless of its name when it has consumers in two or more features. Moving it would
either duplicate the rule into two stylesheets (a drift risk — the two copies stop matching) or
force one feature to import another feature's stylesheet, which breaks the boundary a different
way. `.status-badge` has consumers in six features (`board`, `briefings`, `credits`, `projects`,
`settings`, `workspace`); `.segmented-control` has consumers in five (`assets`, `board`, `brand`,
`projects`, `reviews`); `.brand-logo` read as `brand`-owned but was shared by `auth` and
`workspace`; since the sidebar's animated lockup (2026-09-24) only `auth` uses it, so it moved to
`auth.css`. The other two stay in `globals.css` under this rule. (These three are additional instances of
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
  and its current consumers include the shell and `workspace/canvas-header.tsx`, rendered by both
  board and projects. The identity/profile namespace (including `.board-identity-mark`) now also
  belongs in `globals.css` because these two features share it. The mark's size override follows
  the base `.client-mark` rule so equal-specificity declarations remain deterministic.
- **Grouped selectors binding a single-feature namespace to a multi-feature or shared rule (3):
  `.project-title`, `.board-canvas`, `.project-canvas`.** `.project-title`'s
  only consumer is `workspace/home-page.tsx`, but `globals.css` groups it with `.project-row` in one
  rule (`.project-title strong, .project-row > strong { … }`), and `.project-row` is multi-feature —
  splitting the group would duplicate the rule or change its specificity. `.board-canvas` (`board`
  only) and `.project-canvas` (`projects` only) are each single-feature, but `globals.css` groups
  both (with `.design-viewport`, also `projects`-owned) into one `.react-flow__attribution` rule
  spanning `board` and `projects`.
- **Moved to their feature on 2026-09-23 (2): `.sidebar-collapse` and `.spin`.** No grouped rule
  ever bound `.sidebar-collapse` to `.icon-button`; the toggle only carries both classes on one
  element. Its rules now live in `features/workspace/workspace.css`, which loads after
  `globals.css`. The one source-order flip against the 640px `.icon-button` override is inert,
  because the toggle is already `display: none` at 900px and below. `.spin` and its keyframes moved
  to `features/auth/auth.css`, the stylesheet of their only consumer, `login-page.tsx`.
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
construction: the feature stylesheets declare their selectors disjointly and share none.

The exact counts are deliberately not written here. `apps/web/features/shared/stylesheet-boundary.test.ts`
recomputes them on every run and fails on an actual overlap, so the test is the live answer and any
figure copied into prose is a snapshot that starts rotting immediately. This sentence previously
carried one: it said 736, was corrected to 730, and was 739 within the same day as feature work
landed. Read the test's output, not a number in a document. With disjoint selectors, the relative load order of
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

## Canvas grid and navigation

All four xyflow surfaces use the shared `CanvasBackground`: the client board,
project board, single-design viewer and Playground. The Playground's darker
surface distinguishes the overlaid workspace; its toolbar and inspector retain
their existing readable surfaces. SVG patterns have unique IDs when two canvases
are mounted together.

Scroll and trackpad gestures pan freely in both axes at native delta speed;
pinching zooms. Empty-space dragging remains immediate and follows the pointer.
The shared zoom pill (zoom out, live zoom level, zoom in, fit) animates over 200 ms and honors reduced motion. The
board keeps its custom readable fit; project, design and Playground retain their
own zoom ranges and selection/pin behavior. No CSS transition is applied to the
viewport transform, avoiding drag lag and pin drift.

## Passive video tiles and playback

Project-design previews and the client board show a quiet Video indicator instead of mounting a video decoder or attempting to render an MP4/WebM as an image. The existing design/project title and selected version identify the item. Opening the design loads one private player with native transport controls. A signed-URL renewal retains the same media element and restores playhead, speed and paused/playing state. Temporal pin actions remain unavailable until metadata and any restoring seek complete, preventing feedback against a temporary zero playhead. Image previews retain their existing behavior. Network-budget and playback checks are recorded in the [integration report](../verification/project-playground-video-2026-09-23.md).

The single-design viewer refits artwork on actual canvas-size changes so desktop/mobile resizing and sidebar transitions keep it fully visible and readable. This fit can recover from an intermediate narrow size and caps zoom at 1. Playback, comments and ordinary rerenders preserve manual pan/zoom.
