# Miro mode Task 5: wire Miro mode into the project page

- Updated: 2026-09-26T12:30:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: wire `ProjectHeader`/`ProjectPage` to Miro mode, remove
  `MiroBoardPanel`, move `use-fullscreen-layer.ts` to Playground; files per task-5-brief.md.

## Changes
- `project-header.tsx` — added `view`, `miroAvailable`, `onView` props and the "Project view"
  segmented control.
- `project-header.test.tsx` (new) — the two tests specified in the brief; both pass.
- `project-page.tsx` — router/pathname URL sync for `ProjectView`, `enterMiro`, `MiroView` +
  `PlaygroundAssetStrip` mounted beside a hidden (`visibility:hidden`, `aria-hidden`) `ReactFlow`,
  removed `MiroBoardPanel` and `miroVersion` state.
- `projects.css` — removed `.miro-board-shell/-header/-header h2/-frame` rules.
- Deleted `miro-board-panel.tsx`/`.test.tsx`.
- Moved `features/shared/use-fullscreen-layer.ts` → `features/playground/use-fullscreen-layer.ts`
  (doc comment now Playground-only); updated imports in `playground-board.tsx` and
  `use-playground-navigation-guard.ts`.
- Moved `.fullscreen-layer` block (rules, keyframes, reduced-motion) from `app/globals.css` to the
  top of `playground.css`; updated its comment (single consumer now, no more Miro-panel mention).
- Updated `features/shared/README.md` (removed "Full-screen layer" entry, one consumer only) and
  `features/playground/README.md` (local import path) for the move.

## Decisions and interface changes
- Added a guard in the URL-sync effect: `router.replace` only fires when the computed query
  differs from `window.location.search` (ruling in the task).
- None outside owned paths; `projects/README.md` still references `MiroBoardPanel` — left for
  Task 6 per instructions.

## Checks actually run
- `cd apps/web && npx vitest run features/projects/project-header.test.tsx` — pass, 2/2, before
  wiring.
- `cd apps/web && npx vitest run features/projects features/playground features/shared` — pass,
  523/523 (43 files).
- `grep -rn "use-fullscreen-layer\|miro-board-panel\|MiroBoardPanel" apps/web --include="*.ts"
  --include="*.tsx"` (excluding node_modules/.next) — only the two Playground imports.
- `npm run check` (repo root) — typecheck, lint, format:check, and full `vitest run` (1197/1197)
  all pass. One `prettier --write` pass was needed on the two edited files before this run.

## Risks and next action
- None found; no failures in files outside this task's scope.
- Ownership: released. Staged files match the brief's list exactly (`git diff --cached --stat`,
  13 files). `login.png` deletion pre-existed and was left untouched. Committing next, per the
  one authorized commit in this task's instructions.
