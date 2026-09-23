# Web mechanical cleanup

- Updated: 2026-09-23T22:24:18Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: implemented, tested (all 5 tasks complete; tasks 2/3 landed in this follow-up)
- Objective and owned paths: behavior-preserving CSS/export cleanup from a verified audit, in this task's listed owned paths.

## Changes
- Committed as `80cfe7e`: `briefings.css`/`board.css`/`projects.css` — deleted 6 dead selectors (zero non-CSS references each); `data-access.md` — Exceptions section links the 4 files that legitimately call Supabase outside `<feature>-data.ts`; `workspace/README.md` — added the `workspace-settings.ts` justification that link needs; 7 files — dropped `export` from 19 file-private symbols, verified with `rg -w` incl. tests.
- This follow-up (uncommitted): moved `.sidebar-collapse` (base, hover, `@media (max-width:900px)` display:none) from `globals.css` to `workspace.css`; moved `.spin`/`@keyframes spin` from `globals.css` to `auth.css`. Updated both READMEs' CSS-boundary sections to match.

## Decisions and interface changes
- `.sidebar-collapse`'s move flips source order against `globals.css`'s `.icon-button` 640px override (width/height/flex-basis) for one property tie: previously `.sidebar-collapse` won it in-file; `.icon-button` would now if contested. Verified inert, not a regression: `.sidebar-collapse` is `display:none` at ≤900px (a superset of 640px), so the toggle is unrendered before that override could ever apply — no rendered pixel depends on the losing side. Full reasoning is in the comment above `.sidebar-collapse` in `workspace.css` and in `workspace/README.md`. `workspace.css`/`auth.css` were confirmed to load after `globals.css` (the same pattern `board.css` already relies on) before moving anything.
- `docs/architecture/design-system.md`'s styling-boundary section still documents the pre-move "stays in globals.css" reasoning for both rules; out of this task's write scope, needs the same correction.
- `settings-data.ts` export items remain deferred per the earlier scope change (concurrent client-logo writer); untouched.

## Checks actually run
- `npx vitest run features/shared features/workspace features/auth` — 9 files / 74 tests pass (incl. `stylesheet-boundary.test.ts`).
- `npm run typecheck` — clean. `npm run lint` — clean. `npx prettier --check app features` — clean (the earlier playground warning is gone; not from this agent's changes).

## Risks and next action
- None outstanding for this task's scope. Not committed, per instructions — orchestrator to review and commit.
- Ownership: all paths this agent touched are released; no active writer or process left running.
