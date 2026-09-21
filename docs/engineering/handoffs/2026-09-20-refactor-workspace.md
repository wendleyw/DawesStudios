# Refactor the workspace feature onto the data-access contract (Task 13)

- Updated at: 2026-09-20T22:50:00-03:00
- Reporting agent and tool: Task 13 worker / Claude Code (Claude Sonnet 5)
- State: implemented, tested, verified
- Objective: relocate the 5 measured inline Supabase call sites in `apps/web/features/workspace/` onto the data-access contract, add unit tests for the extracted write(s), adopt shared primitives, report the `globals.css` boundary, split only where safe, remove dead code — behavior-preserving, without disturbing the app-shell topbar/portal/chrome-measurement area
- Owned paths: `apps/web/features/workspace/`, `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-13-report.md` (full detail), this report
- Dependencies: `docs/architecture/data-access.md`; `features/credits/credit-data.ts`, `features/settings/settings-data.ts`; `features/projects/project-data.test.ts`'s Proxy stub; a dev server on port 3003
- Acceptance criteria: `npm run check`'s component pieces pass with no test file modified; the `.from(`/`.rpc(`/`.storage.` grep on `*.tsx` returns no output; `workspace`/`workspace-actions` Playwright specs pass unmodified
- Commit: `0c37c800578a1e5b8eaca67270a4d49d4e39acd6` on `refactor/repository-structure`

## Completed work and changed files

All 5 measured call sites relocated into `workspace-data.ts` (4 in `search-page.tsx`'s combined
search query, 1 in `notifications-page.tsx`'s mark-read mutation). Full per-call-site table is in
the task report and in `apps/web/features/workspace/README.md`.

- `apps/web/features/workspace/workspace-data.ts` (150 → 305 lines): added `useWorkspaceSearch()`,
  `markNotificationsRead()`, `notificationsQueryKeys`/`useInvalidateNotifications()`,
  `workspaceQueryKeys`/`useInvalidateWorkspace()`; reorganized into domain-grouped sections.
- `apps/web/features/workspace/workspace-data.test.ts` (new): 3 tests for `markNotificationsRead`
  (call chain without an id, call chain with an id, database-error surfacing).
- `apps/web/features/workspace/search-page.tsx` (135 → 75 lines): now calls
  `useWorkspaceSearch(search)`; dropped its `useAuth` import and inline Supabase calls.
- `apps/web/features/workspace/notifications-page.tsx` (118 → 114 lines): now calls
  `markNotificationsRead()` and `useInvalidateNotifications()`; dropped `useQueryClient`/
  `assertResult` imports.
- `apps/web/features/workspace/README.md` (new): documents the relocation, the per-domain
  invalidation decision, the `useInvalidateWorkspace()`/`projects` reasoning, the CSS-boundary
  finding, the app-shell discrepancy below, the shared-primitives check and the dead-code check.

Untouched: `app-shell.tsx`, `client-mark.tsx`, `notifications-bell.tsx`, `home-page.tsx`,
`workspace-settings.ts` (already contract-compliant), `workspace.css`, `activity.css`,
`app/globals.css`, `board/board-data.ts`, `board/board-page.tsx`.

## Decisions and interface changes

- `useWorkspaceSearch()` is a genuine `use<Thing>()` hook (the original `useQuery` was already
  called at component top level) — not a "read that cannot be a hook."
- Per-domain invalidation, not one bundled key set: `useInvalidateNotifications()` (`notifications`
  only, reproducing the mutation's exact pre-migration invalidation) is separate from
  `useInvalidateWorkspace()` (`projects` only), so marking a notification read does not newly
  invalidate the project list.
- **`useInvalidateWorkspace()` now exists and covers the `projects` key** that
  `board/board-data.ts`'s comment above `moveProjectPosition` names as workspace-owned. `board-data.ts`
  and `board-page.tsx` were **not edited** — wiring `board-page.tsx`'s `moveProject` mutation to call
  this helper (replacing its inline `invalidateQueries(["projects"])`) is left for that feature's
  owner.
- **Naming collision, flagged not fixed**: `features/settings/settings-data.ts` already exports its
  own, unrelated `useInvalidateWorkspace()` for the singleton studio-settings domain. No code
  collision (different modules), but confusing for a future reader.
- `workspace-settings.ts` was left alone: it is a separate, already-contract-compliant `.ts` module,
  and the mandate named `workspace-data.ts` as the destination, not this file.

## Critical finding: the app-shell topbar consolidation is missing from the tree

This task was cautioned to protect a topbar consolidation (client brand mark/name in the topbar,
board header/toolbar folded into the topbar via a `topbar-tools.tsx` portal, a `--workspace-chrome`
measured-height variable, a reserved second tool row below 1100px) described as already landed.
**It is not present anywhere in the current working tree.** It shipped in commit `198e3c9`
(`client-identity.tsx`, `topbar-tools.tsx`), but a later commit, `31a2f7a` ("chore: commit the
in-flight workspace and board work as a refactor baseline"), replaced `app-shell.tsx` with an
earlier shape lacking both files while keeping unrelated accessibility work from the same period.
`git log --all` finds `client-identity.tsx`/`topbar-tools.tsx` only in `198e3c9`; there is no
`--workspace-chrome` anywhere in the tree; `board/board-page.tsx` currently renders its own
`board-identity` header with `board-tools` inline, commented "The topbar above carries nothing but
the global actions" — the reverse of the described state. `docs/engineering/handoff.md`'s "Workspace
topbar consolidation" entry documents the work as implemented, so this looks like a real regression
from the baseline commit, not stale instructions.

I did not touch `app-shell.tsx` (nothing to disturb) and did not attempt to restore the lost work —
that is a product decision and a behavior change outside a behavior-preserving refactor. **This
needs orchestrator reconciliation**: either re-apply `198e3c9`'s work on top of the current tree, or
accept the current simpler topbar as the new baseline and correct downstream instructions/handoffs
that still describe the consolidation as present.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | Local, 2026-09-20 | Pass | Session output |
| `npm run lint` | Local | 0 errors; 2 pre-existing warnings in `features/board`, none in `features/workspace` | Session output |
| `npx prettier --check` on all touched files | Local | Clean | Session output |
| `npm run check` | Local | Stops at `format:check` on a pre-existing untracked file unrelated to this feature (`tests/e2e/tmp-repro-add-design.spec.ts`) | Session output |
| `npx vitest run` | Local | 23 files / 379 tests passing (376 before this task, +3 new) | Session output |
| `.from(`/`.rpc(`/`.storage.` grep on `*.tsx` in `features/workspace` | Local | No output | Session output |
| `npm --prefix apps/web run test:e2e -- workspace.spec.ts workspace-actions.spec.ts` | Local, dev server on port 3003 (not restarted) | **5/5 passed** (26.3s) | Full output in the task report |

## Remaining risks and next action

1. App-shell topbar consolidation gap (above) — needs an explicit orchestrator decision.
2. `useInvalidateWorkspace()` exists but nothing calls it yet; `board-page.tsx`'s `moveProject`
   mutation still invalidates `["projects"]` inline. One-line wiring change, out of this task's
   scope.
3. Two unrelated `useInvalidateWorkspace()` exports now exist in the codebase (settings and
   workspace) — worth a rename pass later.
4. `npm run check` cannot pass end-to-end as one command until `tmp-repro-add-design.spec.ts` is
   resolved by whoever owns it; every step was verified individually instead.

## Ownership at handoff

`apps/web/features/workspace/` is released, clean, committed
(`0c37c800578a1e5b8eaca67270a4d49d4e39acd6`). No other writer active on these paths as observed in
this session. Recommended next owner: whoever reconciles the app-shell/topbar discrepancy, and
whoever wires `board-page.tsx` to `useInvalidateWorkspace()`.
