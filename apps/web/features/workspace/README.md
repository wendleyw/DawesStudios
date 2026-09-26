# Workspace shell, overview and notifications

This feature holds the application chrome (`app-shell.tsx`), the home overview
(`home-page.tsx`) and notifications (`notifications-page.tsx`, `notifications-bell.tsx`). The
workspace-wide search page (`/search`, the sidebar's Search item and its ⌘K shortcut) was removed
on 2026-09-24 at the user's request because it duplicated the board's own search; each page keeps
its own search field. `client-mark.tsx` renders a client's mark — the logo the agency set in
Settings > Clients (`clients.logo_path`), else the first Brand Hub Logo image, else initials — and
is used by this feature's shell, `features/board` and `features/settings`.

## `/home`

`/home` (`home-page.tsx`) greets every role with the shared `WelcomeHeader`/`welcomeTitle`
(`features/shared`): an eyebrow — `Overview` for the agency, `Home` for a client — and "Welcome
back, `<first name>`" as the title. The agency and client roles keep `HomePage`'s own dashboard below
that header (the tile row, "Needs attention" table and clients grid, unchanged). A designer's `/home`
instead renders `DesignerOverview` (`features/overview/designer-overview.tsx`, eyebrow "My work"),
returned right after `HomePage`'s own hooks resolve and before any of that dashboard renders, since a
designer's `/home` is their own assigned-work dashboard, scoped to their own projects and excluding
credits — see [`features/overview/README.md`](../overview/README.md) for its numbers and columns.

## One client navigation across the workspace

`app-shell.tsx` resolves the active client from `/clients/:id/*` or through `useProjectClient`
for `/projects/:id`. Client destinations appear once, as visible text links at the top, with an
underline on the active section. `client-navigation.tsx` owns their shared routing and role rules:
Overview, Board, Briefings, Reviews, Files, Brand Hub and Credits, with Overview and Credits hidden
for designers, so a designer's five destinations start on Board. Projects keep Board active. No
client destinations remain in the sidebar on any route. A client signed into exactly one workspace
lands on its Overview after sign-in (`home-page.tsx`'s single-workspace redirect); the sidebar's own
single-workspace link (`client-switcher.tsx`) opens the same Overview for clients and the studio,
and the Board for designers, since designers have no Overview destination. A client signed into
several workspaces stays on `/home` and opens each one's Overview from there — the switcher's
multi-workspace options and `home-page.tsx`'s workspace cards both link to `/clients/:id/overview`
for that role, and to `/clients/:id/board` for the studio and designers.

All client routes share `canvas-header.tsx`: floating client identity/navigation on the left
and the signed-in viewer’s profile with a notification bell on its left in one account card. A
compact credit balance chip (`features/credits/credit-balance-chip.tsx`) sits directly left of that
bell, linking to the client's Credits page; it renders nothing for a designer viewer, since credits
stay out of that role's view everywhere else. Only the board supplies the quarter control.
Projects own a compact title/status/date card and separate contextual control groups below this header. Briefings,
Reviews, Files, Brand Hub and Credits receive the same header from the shell, positioned sticky
inside the main scrolling region. Their white title/action cards and contextual tools sit below it
on the plain page background (the dot grid belongs to the canvases), using the full available
width with 16 px desktop and 12 px mobile gutters.
Route changes reset this region's scroll position.

All desktop client routes hide the shell topbar and set `--topbar-height` to zero. On phones the
64 px shell topbar carries the navigation-drawer button. Client routes show one bell beside the
profile across all sizes; non-client routes retain their topbar link. No board toolbar or client
page title repeats the notification action. Client links wrap without menu scrolling.

`notifications-popover.tsx` uses the native nonmodal Popover API so the feed opens above canvas and
sticky containers. It is anchored below the account card, bounded to the viewport, and slides down
briefly (no animation with reduced motion). Escape/close returns focus; an outside click dismisses
without stealing focus, and route changes close it. The scrolling feed reuses recipient-scoped reads
and explicit read mutations from `workspace-data.ts`; opening alone does not mark activity as read.
The full notifications page remains available from its footer. No new notification backend exists.
The unread count comes from `useUnreadNotificationCount`, an exact head-only count of the caller's
unread rows, so the bell's label and the feed's heading report every unread notification rather than
the unread share of the loaded page. The feed lists the latest `NOTIFICATION_FEED_LIMIT` (100), and
the full page says so when the list reaches it.

## Visual layout and active navigation

The shell and overview consume the shared neutral palette, typography and spacing tokens in
`app/globals.css`. Non-client document pages use a 1280 px maximum wrapper and 40 px desktop gutter; client sections use the full-width layout above.
Overview metrics are individual bordered panels, with an even two-column arrangement on phones;
the date and creation action share one header group.

The sidebar shows one client workspace at a time. `client-switcher.tsx` consumes the shell's
existing authorized query and provides a searchable client picker above the global navigation.
Accounts with one client get a direct workspace link. Search is case-insensitive, the current
client is marked, and empty/error states remain actionable. Escape closes the picker and returns
focus; on mobile it leaves the containing navigation drawer open until the next Escape.

The selected route determines client context, including directly opened project links. The sidebar
retains client switching, Overview/My work, studio controls, support and account/sign out.
It uses tighter spacing in short client-workspace windows so those global actions fit without
scrolling. Client links stay in the top navigation when the sidebar is collapsed or opened as a
mobile drawer. A page can fold the sidebar while it needs the width with `useFoldSidebarWhile(active)`
(`app-shell.tsx`): it collapses on activation, can still be expanded by hand, and returns to its
previous state on deactivation or unmount. The project page's Miro mode is the one consumer.

The workspace layout also renders the briefing `@modal` slot. In-app New briefing links open the
shared editor over the current route; direct URL loads use the full page. See the
[briefing feature](../briefings/README.md) and [current verification](../../../../docs/verification/board-views-2026-09-23.md).

## Theme

`theme-toggle.tsx` adds **Theme: System / Light / Dark** to the sidebar footer, above Help &
support, for every role; each click moves to the next choice in that order. `theme.ts` keeps the
choice in this browser (`localStorage` key `dawes-theme`; System removes the key) and sets
`<html data-theme>`, which `color-scheme` in `app/globals.css` reads. Every colour token is a
`light-dark()` pair, so System needs no script. `app/layout.tsx` runs the same logic as an inline
`<head>` script, so a reload never flashes the other theme, and other open tabs follow through the
`storage` event; the head script also follows other tabs on every page. Blocked storage still applies the choice for the current page. The collapsed rail
keeps the label for assistive technology, like the other sidebar items.

## Data access

`workspace-data.ts` owns every Supabase read and write this feature's own components issue, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. It holds the
mutation relocated from `notifications-page.tsx`.

`workspace-settings.ts` is this feature's one documented exception to that rule, listed in the
contract's [Exceptions section](../../../../docs/architecture/data-access.md#exceptions): it calls
Supabase directly (`.from("workspace_settings")`) for the singleton studio-settings read,
`useWorkspaceSettings()`, instead of living in `workspace-data.ts`. It stays a separate file so the
settings editor, this shell (`useDateFormat()` above) and notifications can all consume the same
read without a workspace → settings dependency, and so that neither `workspace-data.ts` nor
`settings/settings-data.ts` has to import the other feature to reach it — see
[`features/settings/README.md`](../settings/README.md) for the full reasoning.

| Source (component)                   | Destination in `workspace-data.ts` | Table, columns, filters and order                                                                                                 | Unchanged? |
| ------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `notifications-page.tsx` — mark read | `markNotificationsRead()`          | `notifications`, `.update({ read_at })`, `.eq("user_id", ...)`, `.is("read_at", null)`, then `.eq("id", ...)` when an id is given | Yes        |

`markNotificationsRead()` is a plain `async (database, input)`
function per rule 3; `new Date().toISOString()` for `read_at` moved with the update payload it is
part of, not left behind as "trimming" under rule 4 — it is the write's data, not form input the
component validates.

### Labels and dates

`workspace-data.ts` also holds the vocabulary and the date rendering the whole product shares,
because no single feature owns them and two copies is how one record starts reading two ways:

- `statusLabels` (project status) and `versionStatusLabels` / `versionStatusLabel()` (design-version
  status). A version carries `design_versions.status` on the internal channel and
  `publication_reviews.status` on the client channel, so the map covers both sets — `draft`,
  `submitted`, `reviewed`, `pending`, `approved`, `changes_requested` — and no surface renders the
  raw token. `workspace-format.test.ts` pins the map against the two database check constraints.
- `useDateFormat()`, the only date formatter in the product. It takes the studio timezone from
  `useWorkspaceSettings()` (one shared query, so every consumer re-renders together when it
  resolves) and returns `formatDate`, `formatDateLong`, `formatDateTime`, `formatMonth` and
  `formatWeekdayDate`. `createDateFormatters(timeZone)` is the same set, exported for tests.
  Instants are read in the studio's zone; a calendar date (`2026-09-21`) is read in UTC, because it
  names a day rather than an instant. Each formatter takes the empty label to print for a null
  value, so "No due date" belongs to the due-date column rather than to the formatter.

### Why per-domain invalidation instead of one shared `workspaceQueryKeys`

Following `settings-data.ts`'s reasoning: this module's domains do not want each other's cache
invalidated by their own mutation. It exports two separate pairs instead of one:

- `notificationsQueryKeys = ["notifications"]` / `useInvalidateNotifications()` — called from
  `notification-feed.tsx`'s mark-read mutation, exactly reproducing its pre-migration
  `invalidateQueries({ queryKey: ["notifications"] })`.
- `workspaceQueryKeys = ["projects"]` / `useInvalidateWorkspace()` — see below.

A single bundled pair covering both keys would make marking a notification read also invalidate the
project list, which nothing did before this migration.

### `useInvalidateWorkspace()` and the `projects` key

`board/board-data.ts` carries a comment above `moveProjectPosition` recording that board owns no
invalidation key of its own because its single write invalidates `projects`, a key `workspace` owns,
and that the call site (`board-page.tsx`'s `moveProject` mutation) should call workspace's
invalidation helper once one exists, rather than adding a board-owned key set to describe a cache
entry board does not own.

`useInvalidateWorkspace()` now exists and covers `projects`. No write in this module touches the
`projects` table — `useProjects()` is a read only — so this pairing is the mirror image of how
`settings-data.ts` owns `clientQueryKeys`/`useInvalidateClients()` for the `clients` key even though
the read hook (`useClients()`) lives here: ownership of a key's invalidation follows whichever module
is the key's canonical source of truth, not which module happens to read or write it in a given call
site. `board-page.tsx`'s `moveProject` mutation now calls `useInvalidateWorkspace()` for that reason
instead of its former inline `queryClient.invalidateQueries({ queryKey: ["projects"] })`.

**Naming note for the next reader:** `features/settings/settings-data.ts` used to also export a
function named `useInvalidateWorkspace()`, for its own "Workspace" domain (the singleton studio
name/timezone settings screen). The two never collided at the type or build level — different
modules, different keys (`workspace-settings` there, `projects` here) — but two identically named
hooks doing different things was a trap for the next reader, so the settings one was renamed to
`useInvalidateWorkspaceSettings()` (and its key constant to `workspaceSettingsQueryKeys`). Only this
module's `useInvalidateWorkspace()` keeps the shorter name.

## CSS boundary

`workspace.css` (32 namespaces from the stylesheet split) is settled; no
namespace change was made here. Auditing every class name this feature's markup uses against
`app/globals.css` found exactly one namespace used only by this feature that still lives there:

- **`.sidebar-collapse`** moved to `workspace.css` (structural-refactor cleanup, 2026-09-23). Its
  only consumer in the whole tree is `app-shell.tsx` (`className="icon-button sidebar-collapse"`, and
  `workspace.css`'s `.sidebar-collapsed` state rules reference it). The "grouped dual-class selector"
  reason recorded here before this move described the toggle carrying `icon-button` on the same
  element, not the CSS actually grouping the two selectors into one rule — it never did;
  `.sidebar-collapse` and `.icon-button` were always separate rules. `workspace.css` already loads
  after `globals.css` on every route that renders the toggle, the same relationship `board.css` and
  `auth.css` rely on for their own `globals.css` overrides, so the move preserves every cascade
  outcome that was ever visible. The one source-order relationship the move does not preserve —
  `globals.css`'s `.icon-button` 640px override no longer comes after this rule's base declaration —
  is inert rather than a regression: `.sidebar-collapse` is `display: none` under a
  `@media (max-width: 900px)` rule that moved with it, and 900px is a superset of 640px, so the
  toggle is already unrendered before that override could ever apply to it. The full reasoning is
  recorded above `.sidebar-collapse` in `workspace.css`. `docs/architecture/design-system.md`'s
  styling-boundary section still records the pre-move reasoning and needs the same correction; that
  file is outside this feature's README and this task's write scope.

`.project-row` / `.project-table` (shared with `board`) and `.topbar` (shared with `brand`'s draft
editor) are the deliberately global namespaces named in this task's brief; both were re-verified with
a consumer grep and are unchanged. `.client-mark` (shared with `board/board-page.tsx`, which imports
the `ClientMark` component from this feature) is likewise genuinely multi-feature and untouched. The
sidebar no longer uses `.brand-logo`, which moved to `auth.css` with its one remaining consumer.

## Sidebar brand lockup

The top of the sidebar shows the animated studio mark beside the wordmark. `brand-mark.tsx` plays
`public/brand/logo-mark.webm` once when the shell mounts (muted, inline, no loop) and it rests on
the finished mark; with reduced motion, or if the video cannot play, it shows the still
`public/brand/logo-mark.webp` instead. Both are decorative: the link's label carries the name. The
wordmark is `public/brand/wordmark.webp`, cut from `logo.webp` at x = 589. `workspace.css` lays the
lockup out in `logo.webp`'s own units (`--brand-unit`), so the finished mark lands where the static
mark was, and each breakpoint changes only that unit. The web video is a 76 × 120, silent, inverted
cut of the master `brand/logo-animation.webm` (black on white), shown with `mix-blend-mode: screen`
on the dark sidebar. To regenerate it after the master changes:

```sh
ffmpeg -c:v libvpx-vp9 -i brand/logo-animation.webm -an \
  -vf "crop=760:1200:314:114,negate,colorlevels=rimin=0.06:gimin=0.06:bimin=0.06,scale=76:120:flags=lanczos,format=yuv420p" \
  -c:v libvpx-vp9 -crf 30 -b:v 0 -row-mt 1 apps/web/public/brand/logo-mark.webm
```

The crop box is the mark's full motion across every frame, and the levels step keeps the
background pure black so screening leaves the sidebar color untouched. The still is the last
frame, cropped the same way, with its opacity taken from the mark's darkness.

## Shared primitives

`notification-feed.tsx` uses `FormError` for its mutation error and `PageStatus` is used by
`home-page.tsx`. Nothing in this feature held a local copy of markup extracted into
`features/shared/`. `notification-feed.tsx`'s inline `role="alert"` block around a
`<p className="form-error">` is a deliberate non-`FormError` exception already recorded in
[`features/shared/README.md`](../shared/README.md).

## Dead code

`.workspace-status` had no component consumer anywhere in this feature (or the rest of the tree) —
no `.tsx` file ever rendered a `workspace-status` class. It was originally left in `app/globals.css`
because that file was out of this feature's write scope at the time; the final structural-refactor
fix wave re-verified the zero-consumer finding and deleted the rule from `globals.css`.

## Verification

Historical data-access migration evidence (not the current UI verification):

- `npm run check` from the repository root reaches `format:check` and fails there on a pre-existing,
  untracked file unrelated to this feature (`apps/web/tests/e2e/tmp-repro-add-design.spec.ts`, not
  part of this change and not modified here, since test files are out of this task's write scope).
  Run individually instead: `npx tsc --noEmit` (via `npm run typecheck`) passes; `npm run lint`
  reports the same 2 pre-existing warnings in `features/board` and none in `features/workspace`;
  `npm run format:check` is clean for every file this migration touched; `npm run test` (`vitest run`)
  passes 23 files / 379 tests (376 before this migration, plus 3 new tests in
  `workspace-data.test.ts`).
- `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/workspace --include='*.tsx' | grep -v 'Array\.from('`
  returns no output.
- `npm --prefix apps/web run test:e2e -- workspace.spec.ts workspace-actions.spec.ts`: 5/5 pass.

Current navigation and creation-card evidence: [verification record](../../../../docs/verification/client-menu-and-project-creation-2026-09-23.md).

## Notification surfaces

`notification-feed.tsx` owns the list, loading/retry and authenticated read mutations. The full
notifications page and compact account popover consume it. `notifications-bell.tsx` retains a link
on non-client topbars and accepts a callback/ref for the account popover. Shared feed styles live
in `app/globals.css`; popover layout stays in `workspace.css`. Backend RLS scopes the latest 100
notifications to the signed-in viewer. Opening the popover does not mark them read.

Who receives a client notification is decided in `private.notify_client`
(`supabase/migrations/202609250003_client_notification_routing.sql`): a project update reaches the
project's requester (its briefing's `requested_by`), everyone who chose **All <client> activity**
and, for a studio reply in the client conversation, the client people who wrote there. With no
requester left, or with no project (credit updates), it reaches every person at the client. The
actor and removed people never receive one.
