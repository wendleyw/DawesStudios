# Light and dark themes, dotted canvas and project tool bar

Date: 2026-09-24

Status: design approved in chat (all sections, one message); awaiting written-spec review

## Objective

The product gains a dark theme next to today's light one, and every xyflow canvas takes the look
of the Higgsfield canvas the user supplied: a dot grid, near-black in dark mode. Inside a project,
the tool icons leave the top-right card for a floating bar at the bottom of the canvas, and the
Playground (the project's brainstorm board) rises from the bottom instead of dropping from the top,
so it opens from the same edge as the button that launches it.

Success means all of the following hold:

1. Every screen reads correctly in both themes: text meets WCAG AA, no surface keeps a hard-coded
   light color, and native controls (selects, checkboxes, scrollbars) follow the theme.
2. A person's choice (System, Light or Dark) survives a reload with no flash of the other theme.
3. The board, project, design viewer and Playground canvases show the dot grid and the same zoom
   pill in both themes.
4. Project details, Conversation and Playground are reachable from the bottom bar with the same
   accessible names, and the Playground slides up from the bottom edge and back down on close.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Canvas in light mode | Follows the theme: the same dot grid, light in light mode and Higgsfield's near-black in dark mode. |
| How the theme is chosen | Follows the operating system by default; a System / Light / Dark choice in the sidebar footer overrides it and is remembered in this browser. |
| What goes into the bottom bar | Project details, Conversation and Playground. The channel switch and deliverable filter stay at the top. |
| Zoom controls | One horizontal pill at the bottom left of every canvas: zoom out, live percentage, zoom in, fit. No minimap. |
| Theme approach | Single token list written with CSS `light-dark()` (A). Two duplicated token blocks (B) and the `next-themes` package (C) were rejected. |

## Non-goals

- No minimap, and none of Higgsfield's drawing tools (pen, shapes, text, frames).
- No theme stored on the account: no migration, no API. The choice lives in this browser.
- No change to the design viewer's own tool row (Edit, Navigate, Add pin, Playground).
- Artwork, thumbnails and uploaded images are never recolored or filtered.
- Application chrome stays monochrome, as the design system already requires. Higgsfield's lime
  accent is not adopted.

## Current state

- The product is light only: `apps/web/app/globals.css` declares `color-scheme: light` and about
  forty color tokens on `:root`. Feature stylesheets add roughly 150 literal colors, most of them in
  `board/timeline.css` (34), `playground/playground.css` (24), `projects/projects.css` (21) and
  `briefings/briefings.css` (10). No component sets colors inline except one artwork fallback.
- `features/shared/canvas-background.tsx` draws a 24-unit line grid in `--canvas-grid` on
  `--canvas-background`. The Playground overrides both with a slightly darker pair.
- `features/shared/canvas-controls.tsx` renders xyflow's `Controls` as a vertical +, −, fit stack.
  The board docks it into a card under its left tool rail (`.board-zoom-dock`); the other three
  canvases leave it at xyflow's bottom-left position.
- `features/projects/project-header.tsx` renders the channel switch on the left and one card on the
  right: deliverable filter, Project details, Conversation and the page's `quickActions`
  (the Playground button). While reviewing a design, that toolbar is hidden and the viewer shows
  the Playground button in its own tool row.
- `features/playground/playground.css` animates the Playground dialog with
  `translateY(-100%) → 0` on entry and the reverse on exit. `tests/e2e/playground.spec.ts` asserts
  those keyframes.
- The content security policy already allows inline scripts (`next.config.ts`), so an inline theme
  script needs no policy change.

## Design

### 1. Theme model

- The preference is `system`, `light` or `dark`, default `system`. It is stored in `localStorage`
  under `dawes-theme`. A missing or unknown value reads as `system`. If storage throws (private
  windows, blocked site data) the choice still applies for the page's lifetime.
- Applying a choice sets `data-theme="light"` or `data-theme="dark"` on `<html>`; `system` removes
  the attribute.
- CSS: `:root { color-scheme: light dark }` follows the operating system;
  `:root[data-theme="light"]` and `:root[data-theme="dark"]` pin `color-scheme`. Every color token
  becomes `light-dark(<light>, <dark>)`, so each color is written once and `system` needs no script.
- No flash: a short inline script at the top of `<head>` in `app/layout.tsx` reads the stored value
  inside `try`/`catch` and sets the attribute before the first paint. `<html>` carries
  `suppressHydrationWarning`, since the server cannot know the attribute.
- Other open tabs follow a change through the `storage` event.
- The module lives in `features/workspace/theme.ts` (preference parsing, cycling, applying and the
  script source). Its consumers are the root layout and the sidebar switch.

### 2. Tokens and palette

Light values stay as they are. Dark values start from Higgsfield's sampled colors and are tuned in
the visual audit:

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#f7f8fa` | `#131416` |
| `--surface` | `#fff` | `#1c1e21` |
| `--surface-subtle` / `--surface-hover` | `#f2f3f5` / `#fafbfc` | `#25272b` / `#212327` |
| `--foreground`, `--ink` | `#272a30` | `#ececee` |
| `--muted` | `#636872` | `#9ea1a8` |
| `--border` / `--border-strong` | `#e5e7eb` / `#ccd0d7` | `#28292c` / `#3a3c41` |
| `--canvas-background` / `--canvas-grid` | `#f3f4f6` / dots near `#c5c9d0` | `#131416` / `#363739` |
| `--sidebar` / `--sidebar-active` / `--sidebar-border` | `#202226` / `#36393f` / `#3a3d44` | `#0f1012` / `#25272b` / `#28292c` |

- New tokens replace literals that meant "text on a filled dark control" (`--on-ink`: white in
  light, `#131416` in dark) and similar pairs found during conversion.
- A color used by one feature only is written with `light-dark()` in that feature's stylesheet; a
  color shared by two or more features becomes a token in `globals.css`, as the styling boundary
  requires.
- Status tones (`--tone-*`) and the timeline's olive/amber bar family get dark variants that keep
  badge text at 4.5:1 or better and bar edges at 3:1 or better.
- Dark surfaces separate with borders; shadows become darker and subtler.
- xyflow's control variables (`--xy-controls-*`) map to these tokens. Its translucent blue
  selection box reads on both themes and stays; the canvases use custom nodes only, so xyflow's
  default node colours never show.
- The sidebar stays dark in both themes. The white studio logos are unchanged.
- Client logos are uploaded images, often black on transparent. In dark mode an `img.client-mark`
  sits on a small light plate so a dark mark stays legible. Initials fall back to the tokens.

### 3. Theme switch

- `features/workspace/theme-toggle.tsx` adds one `nav-item` button to the sidebar footer, directly
  above **Help & support**, for every role.
- It shows the current choice as icon and text: Monitor **Theme: System**, Sun **Theme: Light**,
  Moon **Theme: Dark**. Each click moves to the next choice in that order and saves it.
- The collapsed rail and the phone drawer reuse the existing nav-item behavior (icon only when
  collapsed; the text stays available to assistive technology).
- Server rendering shows **Theme: System** and the real choice appears after hydration
  (`useSyncExternalStore` with a server snapshot), so hydration never mismatches.
- The login and invitation pages follow the stored choice or the system through the same script;
  they get no switch of their own.

### 4. Dotted canvas

- `CanvasBackground` switches to `BackgroundVariant.Dots`: 24-unit gap, dots of about 1.5 units,
  colored `--canvas-grid` on `--canvas-background`. The pattern still follows pan and zoom, and
  each instance keeps its unique ID.
- The Playground keeps its slightly deeper tone in both themes (dark near `#0f1012`), so the
  overlaid board still reads as a separate layer.
- Deliverable frames, version rows, notes and image cards take their colors from the tokens. The
  Playground's yellow notes get a muted dark variant.

### 5. Zoom pill

- `CanvasControls` renders a horizontal pill: **Zoom Out**, the zoom percentage, **Zoom In**, a
  divider and the fit button. The percentage is plain text read from the xyflow store
  (`transform[2]`), rounded to a whole percent, with tabular figures.
- Accessible names do not change (`Zoom In`, `Zoom Out`, `Fit View` or the consumer's own fit
  label, such as the board's `Fit board to view`), and the existing min/max disabling stays.
- The pill sits at the bottom left of the canvas with a 16 px inset, styled like the bottom bar.
- The board's zoom card becomes this pill at the bottom left of its canvas, clear of the tool rail.
  Where the rail already turns into a bottom bar (up to 900 px wide or 700 px tall), the pill keeps
  its current place next to that bar.

### 6. Project tool bar

- `features/projects/project-tool-bar.tsx` renders a group labelled **Project actions** at the
  bottom center of the project canvas: **Project details**, **Conversation**, a divider, then
  **Playground**. The group keeps today's name, so existing selectors keep working.
- It follows Higgsfield's shape in the product's monochrome palette: a `--surface` pill with a 1 px
  border, 16 px radius and 6 px padding; 40 px icon buttons with 10 px radius; a 1 × 24 px divider.
  The button for the open panel uses the selected style and `aria-expanded`.
- It sits inside `.project-canvas`, so it centers within the visible canvas when the side panel is
  open, and becomes inert with the rest of the project while the Playground is open. It is not
  rendered while reviewing a design; the viewer keeps its own Playground button.
- The Playground button keeps the ref that restores focus after the Playground closes.
- The header's right card keeps only the deliverable filter.
- Below 640 px wide the bar moves to the bottom right and the zoom pill stays at the bottom left.
  Phone buttons use the 44 px touch size, so at 380 px and narrower the pill drops its percentage
  so both fit.

### 7. Playground motion

- Entry animates `translateY(100%) → translateY(0)`; exit animates `translateY(0) → translateY(100%)`.
  Durations, easing, the completion timer and reduced-motion behavior are unchanged.

## Testing

Unit (Vitest, colocated):

- `theme.ts`: parsing stored values, the default, cycling order, applying and removing the
  attribute, and storage that throws.
- `theme-toggle.tsx`: the label per state, a click that cycles and saves, and a `storage` event from
  another tab.
- `canvas-controls.tsx`: the percentage follows the store; names and min/max disabling are kept.
- The project tool bar: three buttons with their names, `aria-expanded` and selected state for the
  open panel, and no bar while reviewing.
- `stylesheet-boundary.test.ts` keeps passing.

Browser (Playwright, each run with a private `--output`):

- A new theme spec: choose Dark, reload, and find `html[data-theme="dark"]` before hydration with
  the canvas background at `#131416`; with System, an emulated `prefers-color-scheme` decides.
- `playground.spec.ts`: the keyframe expectations become `translateY(100%)`.
- `project-feedback.spec.ts`: the layout check that places the Playground button beside the filter
  moves to the bottom bar.
- `workspace-actions`, `board-views`, `project-creation-cards`, `brand-canvas-final`,
  `production-workflow`, `console-errors` and `video-designs` pass unchanged or with updated
  locators only.

Visual audit: both themes at 1440 × 900, 900 × 700 and 390 × 844 for the board (canvas and list),
project, design viewer, Playground, briefings, reviews, credits, settings and login, with measured
contrast for text tokens and a search for literal colors outside `light-dark()` and tokens.

## Documentation

- `docs/architecture/design-system.md`: a dark column in the token table, a theming section, the dot
  grid, the zoom pill, the project tool bar and the Playground's new direction.
- READMEs of `features/shared` (background and controls), `features/projects` (tool bar),
  `features/playground` (motion), `features/workspace` (theme switch) and `features/board` (zoom).
- `docs/engineering/handoff.md` after each integrated task.

## Delivery

Three stages, each made of plan tasks that end in their own commit after a passing
`npm run check` and their browser checks (the project requires a commit per integrated task):

1. Theme: preference and script, sidebar switch, dark tokens, feature colours, browser check.
2. Canvas: dot grid, then the horizontal zoom pill.
3. Project: the bottom tool bar, then the Playground rising from below.

## Risks

- A literal color left in a stylesheet shows as a light patch in dark mode. A search gate and the
  audit screenshots catch it.
- `light-dark()` needs Chrome 123, Safari 17.5 or Firefox 120 (all from 2024). In an older browser
  a token that uses it is invalid, so colors would be missing rather than light. The product
  declares no browser policy today; the design-system document will state these minimums next to
  the features it already relies on (the top-layer `<dialog>` and `inert`).
- Other sessions edit this tree. Only this task's paths are staged, and each commit is limited to
  its own files.
