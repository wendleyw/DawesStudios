# Audit fixes — J01/J02/J06 layout, long-data, accessibility (batch 1)

- Updated at: 2026-09-21T05:00:31Z
- Reporting agent and tool: Claude (Claude Code)
- State: verified
- Objective: Fix the six findings recorded in `docs/verification/audit-j01-j02-j06.md` — unbroken-token
  heading overflow (J02-1), the design-viewer toolbar breakpoint gap (J02-2), the board list row
  missing `title` (J02-3), the 320px board button spill (J01-1), the 390px board search input
  (J06-1), and focus resetting to `<body>` after sign-in (J06-2). Terminology, copy, tokens,
  duplication and empty states are out of scope (later batches).
- Owned paths: `apps/web/features/briefings/briefings.css`, `apps/web/features/projects/projects.css`,
  `apps/web/features/board/board.css`, `apps/web/features/board/board-page.tsx`,
  `apps/web/features/auth/login-page.tsx`, `apps/web/features/auth/post-sign-in-focus.ts` (new),
  `apps/web/features/workspace/app-shell.tsx`, this report.
- Dependencies: `docs/verification/audit-j01-j02-j06.md` (source findings); local Supabase (already
  running, shared with the frozen `dawes-studios-app-web-1` container) for fixture-based verification.
- Acceptance criteria: `npm run check` passes at the pre-existing 405/27 count; the committed
  `design-audit` and `brand-accessibility` e2e specs pass; each finding's specific failing measurement
  now passes; the throwaway probe spec is deleted; the 10-client/25-project fixture is intact.

## Completed work and changed files

The container serving `:3003` (`dawes-studios-app-web-1`) is a frozen standalone build (`node
apps/web/server.js`, no mounts) — it predates these fixes and cannot reflect them without a rebuild,
which the task forbids. To get real proof against the actual fixed code rather than reasoning about
CSS in the abstract, I started a second, independent `next dev` process on port 3005 (a plain host
process, not a Docker action) pointed at the same already-running local Supabase, verified every fix
against it, then stopped that process. `:3003` and the Docker daemon were never touched.

1. **J02-1 (headline defect).** Added `overflow-wrap: anywhere` to the three heading selectors named
   in the finding: `.briefing-summary h2` (`briefings.css:283`), `.briefing-list-row h2`
   (`briefings.css:34`), `.project-heading h1` (`projects.css:19`). All three are titles a user needs
   to read in full and none had a clipping ancestor or `title` fallback, so wrapping (matching the 21
   existing uses of the same property) was the right call over truncation — nothing is hidden.
2. **J02-2 (design-viewer toolbar).** Moved `min-width: 0` and `overflow-wrap: anywhere` from the
   `max-width: 700px`-ish (`720px` in source) media rule onto the base
   `.design-viewer-toolbar > div:not(.viewer-mode-switch)` rule; the media query now only overrides
   `max-width` and `font-size` for the mobile size.
3. **J02-3 (board list row title).** Added `title={project.title}` to
   `.board-list a.project-row strong`, matching the existing pattern in `board-kanban.tsx`,
   `board-nodes.tsx` and `project-timeline.tsx`.
4. **J01-1 + J06-1 (board header, same root cause).** Both come from the same `.board-tools` row
   running out of space below 640px. Added `flex-wrap: wrap` (plus `row-gap: 8px`) to `.board-tools`
   and `min-width: 140px; flex: 1 1 auto` to `.board-tools .search-field` inside the existing
   `@media (max-width: 640px)` block in `board.css` — one change fixes both findings: below 640px the
   search field and filter button keep the first line, and the view switcher plus the primary "New
   briefing" action wrap to a second line instead of squeezing the search field to unusable width or
   spilling 4px past the viewport at 320px.
5. **J06-2 (focus after sign-in).** Added `apps/web/features/auth/post-sign-in-focus.ts`
   (`markPostSignInFocus` / `consumePostSignInFocus`, a `sessionStorage` flag). `login-page.tsx` sets
   the flag immediately before both of its `router.replace(destination)` calls (form submit and the
   already-authenticated redirect effect). `AppShell` reads and clears it once, the first time
   `!loading && session` is true (which is also the first time `<main id="main-content">` exists),
   then focuses that landmark. This is scoped to the sign-in transition only — it does not fire on a
   direct/hard reload of an authenticated page, and does not refire on later in-app navigation (guarded
   by a `focusHandled` ref plus the one-time flag), so it does not change focus behaviour anywhere else
   in the app (verified: after sign-in, a subsequent click into `/search` leaves focus on that page's
   own search input, not stolen back to `<main>`).

## Decisions and interface changes

- Did **not** touch `.board-toolbar` (a dead selector in `board.css` that matches no rendered class —
  `.board-tools` is what's actually in the DOM). Removing dead CSS is duplication cleanup, out of scope
  for this batch; the real fix targets the selector that is actually rendered.
- Did **not** generalize the sign-in focus fix into "always focus `<main>` on every route change."
  That would have been a bigger, undocumented behavior change (it would make the "Skip to content" link
  unreachable via the very first Tab press on a direct page load — a behavior the audit's own keyboard
  journey explicitly verified as passing). The sessionStorage-flag approach fixes exactly the reported
  transition without touching that.
- No terminology, copy, token, or duplication changes were made anywhere in this diff.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` | Local, 2026-09-21 ~05:00 UTC | Pass — typecheck, lint (2 pre-existing warnings, 0 errors), format:check, 405/27 vitest | Command output in session |
| `npm --prefix apps/web run test:e2e -- design-audit brand-accessibility` | `PLAYWRIGHT_BASE_URL=http://localhost:3005` (local `next dev`, fixed code) | 5/5 passed | Command output in session |
| Board `/clients/{id}/board` at 320px, fresh mount | Local `:3005` | `scrollWidth 320` / `clientWidth 320` (was `324`/`320` on the frozen `:3003` build, matching the audit exactly) | Manual Playwright MCP measurement |
| Board search field at 390px, List view, fresh mount | Local `:3005` | `299×41.5px` (was `68×41.5px` on `:3003`; audit reported `18×40`) — no document overflow | Manual Playwright MCP measurement |
| Board list row `strong` title attribute | Local `:3005` | `title` now equals full project title | Manual Playwright MCP evaluate |
| `.briefing-summary h2`, `.project-heading h1`, design-viewer toolbar, unbroken 96-char token | Local `:3005`, throwaway fixture (`Acceptance <token>` briefing/project title, long design title) at 1600/1200/1100/900/768/390/320 | Zero document overflow at every measured width | Throwaway `tests/e2e/layout-fix-probe.spec.ts`, run and passed, then deleted before finishing |
| Focus after sign-in | Local `:3005` | `document.activeElement` is `<main id="main-content">` immediately after redirect (was `BODY`) | Manual Playwright MCP evaluate |
| Focus after later in-app navigation (regression check) | Local `:3005` | Focus lands on the destination page's own control (e.g. `/search`'s input), not re-stolen to `<main>` | Manual Playwright MCP evaluate |
| `docs/verification/design-audit.json` diff | After the e2e run above | Only `capturedAt` changed; no `overflow`/`violations` figure changed | `git diff docs/verification/design-audit.json` |
| Fixture integrity | Before and after all work | `clients` = 10, `projects` = 25 throughout; zero leftover `title like 'Acceptance %'` rows | `docker exec supabase_db_dawes-studios psql …` |

## Remaining risks and next action

- The frozen `:3003` container still serves the pre-fix build. Whoever owns the rebuild should rebuild
  it against this branch head so the "official" verification surface reflects these fixes; nothing
  further is needed from this batch to do that.
- J06-2's fix does not restore focus if `useAuth` lands on its `error || !profile` branch right after
  sign-in (the flag is consumed but `<main>` isn't mounted yet in that branch). This is an existing rare
  error-path edge case, consistent with the finding's "Low" severity and "optionally" phrasing; not
  fixed further here to avoid widening scope.
- Terminology, copy wording, button hierarchy, tokens, empty states, and duplication (including the
  dead `.board-toolbar` selector noted above) are explicitly out of scope — left for later batches.

## Ownership at handoff

All owned paths above are complete and released. No background process was left running (the
verification `next dev` on :3005 was stopped). The frozen `:3003` container and the Docker daemon were
never stopped, restarted, rebuilt, or otherwise touched.
