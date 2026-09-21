# Workspace shell, overview, search and notifications

This feature holds the application chrome (`app-shell.tsx`), the home overview
(`home-page.tsx`), the global cross-entity search page (`search-page.tsx`), and notifications
(`notifications-page.tsx`, `notifications-bell.tsx`). `client-mark.tsx` renders a client's approved
brand mark and is used by both this feature's shell and `features/board`.

## Data access

`workspace-data.ts` owns every Supabase read and write this feature's own components issue, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. It relocated the
four queries that built `search-page.tsx`'s cross-entity result list and the one mutation in
`notifications-page.tsx`.

| Source (component)                     | Destination in `workspace-data.ts`        | Table, columns, filters and order                                                                                                      | Unchanged? |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `search-page.tsx` — clients query      | `useWorkspaceSearch()` (clients branch)   | `clients`, `.select("id,name,industry")`, `.eq("archived", false)`, `.ilike("name", pattern)`, `.limit(30)`                            | Yes        |
| `search-page.tsx` — projects query     | `useWorkspaceSearch()` (projects branch)  | `projects`, `.select("id,title,description")`, `.ilike("title", pattern)`, `.limit(40)`                                                | Yes        |
| `search-page.tsx` — briefings query    | `useWorkspaceSearch()` (briefings branch) | `briefings`, `.select("id,title,client_id,status")`, `.ilike("title", pattern)`, `.limit(30)`, gated on `profile?.role !== "designer"` | Yes        |
| `search-page.tsx` — brand assets query | `useWorkspaceSearch()` (assets branch)    | `brand_assets`, `.select("id,name,client_id,category")`, `.ilike("name", pattern)`, `.limit(30)`                                       | Yes        |
| `notifications-page.tsx` — mark read   | `markNotificationsRead()`                 | `notifications`, `.update({ read_at })`, `.eq("user_id", ...)`, `.is("read_at", null)`, then `.eq("id", ...)` when an id is given      | Yes        |

The four search branches still run with `Promise.all` and their results are still concatenated in
the same clients → projects → briefings → brand-assets order the page always produced; that order is
user-visible and no test asserts it, so it was preserved rather than "improved." `search-page.tsx`
previously issued this `useQuery` directly (it was already a hook, called at the top of a component
that renders it); it is now `useWorkspaceSearch()`, a proper `use<Thing>()` hook, and the page no
longer imports `useAuth` at all. `markNotificationsRead()` is a plain `async (database, input)`
function per rule 3; `new Date().toISOString()` for `read_at` moved with the update payload it is
part of, not left behind as "trimming" under rule 4 — it is the write's data, not form input the
component validates.

### Why per-domain invalidation instead of one shared `workspaceQueryKeys`

Following `settings-data.ts`'s reasoning: this module's domains do not want each other's cache
invalidated by their own mutation. It exports two separate pairs instead of one:

- `notificationsQueryKeys = ["notifications"]` / `useInvalidateNotifications()` — called from
  `notifications-page.tsx`'s mark-read mutation, exactly reproducing its pre-migration
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
site. Wiring `board-page.tsx`'s `moveProject` mutation to call `useInvalidateWorkspace()` instead of
its inline `queryClient.invalidateQueries({ queryKey: ["projects"] })` is **not done here** —
`board-data.ts` and `board-page.tsx` are outside this task's write scope — and is left for whoever
owns that call site next.

**Naming note for the next reader:** `features/settings/settings-data.ts` also exports a function
named `useInvalidateWorkspace()`, for its own "Workspace" domain (the singleton studio name/timezone
settings screen). The two are unrelated — different modules, different keys (`workspace-settings`
there, `projects` here) — and neither imports the other, so there is no collision at the type or
build level. It is still worth a reader's attention before adding a third.

## CSS boundary

`workspace.css` (32 namespaces from the stylesheet split) and `activity.css` are settled; no
namespace change was made here. Auditing every class name this feature's markup uses against
`app/globals.css` found exactly one namespace used only by this feature that still lives there:

- **`.sidebar-collapse`** — its only consumer in the whole tree is `app-shell.tsx`
  (`className="icon-button sidebar-collapse"`, and `workspace.css`'s `.sidebar-collapsed` state rules
  reference it). It stays in `globals.css` for a documented reason, not an oversight: commit
  `af9acf1` ("refactor(styles): move feature rules out of the global stylesheet") records that
  `.sidebar-collapse` stays there because the shared 640px `.icon-button` breakpoint rule
  (`globals.css:952`) must keep winning over it in source order. This is out of this task's write
  scope (`globals.css` is not touched by this feature), so it is reported rather than moved.

`.project-row` / `.project-table` (shared with `board`) and `.topbar` (shared with `brand`'s draft
editor) are the deliberately global namespaces named in this task's brief; both were re-verified with
a consumer grep and are unchanged. `.brand-logo` (shared with `auth/login-page.tsx`) and `.client-mark`
(shared with `board/board-page.tsx`, which imports the `ClientMark` component from this feature) are
likewise genuinely multi-feature and untouched.

## App shell caution — and a discrepancy found while honoring it

This task's brief describes a topbar consolidation that must not be disturbed: the client's brand
mark and name in the topbar in place of a studio/client breadcrumb, the board's header and toolbar
folded into the topbar, a portal slot in `topbar-tools.tsx`, a `--workspace-chrome` measured-height
variable, and a reserved second tool row below 1100px.

**That consolidation does not exist in the current working tree.** It was implemented in commit
`198e3c9` ("feat(workspace): carry the client identity and board controls in one topbar row"), which
added `client-identity.tsx` and `topbar-tools.tsx` and folded the board's header into the topbar. A
later commit, `31a2f7a` ("chore: commit the in-flight workspace and board work as a refactor
baseline"), replaced `app-shell.tsx` with an earlier shape that has neither file and a plain
`topbar-identity`/`NotificationsBell` topbar, while keeping unrelated accessibility work from the
same period (the mobile-sidebar focus trap, `useProjectClient`). Neither `topbar-tools.tsx` nor
`client-identity.tsx` exists anywhere in the current tree (`git log --all` finds them only in
`198e3c9`), there is no `--workspace-chrome` variable anywhere in the codebase, and
`board/board-page.tsx` currently renders its own `board-identity` header with `board-tools` inline,
with a comment reading "The topbar above carries nothing but the global actions" — the reverse of
what the brief describes.

Given this, `app-shell.tsx` was left exactly as found: no topbar/portal/chrome-measurement structure
was touched because none is present to disturb, and the file was not split (see below). This is
flagged for the orchestrator to reconcile — restoring or re-implementing the lost consolidation is a
product decision and a behavior change, outside a behavior-preserving data-access refactor.

### Why `app-shell.tsx` (416 lines) was not split

Independent of the discrepancy above, the file holds one export whose largest piece — the
mobile-sidebar focus trap `useEffect` — is a single cohesive, carefully-commented stateful unit
(focus containment, `MutationObserver`, `focusout`/`focusin` listeners, media-query close-on-desktop,
cleanup) that reads and writes several `ref`s and pieces of local state together. Splitting it into a
separate hook or component is mechanically possible, but the two required Playwright specs
(`workspace`, `workspace-actions`) exercise this exact shell (sign-in, sidebar navigation, the mobile
menu is not exercised by them but the desktop chrome is on every page they touch), and the explicit
instruction for this task is: if a split would touch the topbar/portal/chrome-measurement area, don't
— and the safest reading of that caution, given the shell is more fragile than its behavior
description suggests, is to leave the whole file alone rather than split around a consolidation that
turned out to be missing.

## Shared primitives

`search-page.tsx` already uses the shared `SearchField` (`@/features/shared/search-field`);
`notifications-page.tsx` already uses `FormError` for its mutation error and `PageStatus` is used by
`home-page.tsx`. Nothing in this feature held a local copy of markup extracted into
`features/shared/`. `search-page.tsx`'s and `notifications-page.tsx`'s inline `role="alert"` blocks
around a `<p className="form-error">` are the two deliberate non-`FormError` exceptions already
recorded in [`features/shared/README.md`](../shared/README.md).

## Dead code

`.workspace-status` (`app/globals.css`) has no component consumer anywhere in this feature (or the
rest of the tree) — but the CSS rule itself is out of this feature's write scope (`globals.css`).
There is no corresponding dead component code in `apps/web/features/workspace/` to remove: no `.tsx`
file in this feature ever rendered a `workspace-status` class.

## Verification

Executed for this migration:

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
