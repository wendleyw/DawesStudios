# Project details extraction

- Updated: 2026-09-27T16:48:41-0400 · Agent: Codex implementer · Model: workhorse
- State: tested
- Objective: Separate independent project detail actions without changing UI, access, or retry behavior.
- Owned paths: `apps/web/features/projects/project-details*.tsx`, `apps/web/features/projects/README.md`, this report.

## Changes
- `project-details.tsx` — now composes Drive and credit actions; edit revision, assignment, and role gates remain here.
- `project-details-drive-link.tsx` — moved both channel controls, validation, mutation, and dialog unchanged.
- `project-details-credits.tsx` — moved move/settlement dialogs, retry keys, shortfall handling, and credit copy unchanged.
- `README.md` — documented boundaries and corrected the existing move key and summary-hook location claims.

## Decisions and interface changes
- Only colocated component exports were added; no cross-domain interface or data-access change.
- Existing project-details tests cover the rendered actions and role visibility; no mirrored extraction tests added.

## Checks actually run
- `npx vitest run features/projects/project-details.test.tsx` — pass, 27 tests.
- `npm run typecheck` — pass.
- Targeted `npx eslint` on three TSX files — pass.
- Targeted `npx prettier --check` on three TSX files — pass after formatting the new files.
- `git diff --check` — pass.

## Risks and next action
- Full application, browser, and release gates were outside this bounded task; orchestrator owns integration verification.
- Next: integrate these paths with other work and run the repository gate before committing.
- Ownership: all listed paths released; no active process.
