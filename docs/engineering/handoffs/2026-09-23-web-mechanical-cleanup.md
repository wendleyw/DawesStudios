# Web mechanical cleanup

- Updated: 2026-09-23T22:18:04Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: implemented, tested
- Objective and owned paths: behavior-preserving CSS/export cleanup from a verified audit, in this task's listed owned paths.

## Changes
- `briefings.css` — deleted 4 dead selectors: `.briefing-detail-header` half of the grouped header selector, `.briefing-editor-title`, `.briefing-form-grid` (base + media-query override), `.briefing-dialog-actions`. Zero non-CSS references confirmed for each.
- `board.css` — deleted dead `.shows-canvas .board-work-area`; `projects.css` — deleted dead `.project-panel-footer`. Both zero non-CSS references.
- `docs/architecture/data-access.md` — Exceptions section now lists the 4 files that legitimately call Supabase outside `<feature>-data.ts`, each linked to its feature README.
- `workspace/README.md` — added the `workspace-settings.ts` justification the new data-access.md link needs (previously recorded only in `settings/README.md`).
- `board-layout.ts`, `canvas-layout.ts`, `project-thumbnail.tsx`, `project-data.ts`, `media-client.ts`, `brand-model.ts`, `save-blob.ts` — dropped `export` from 19 symbols provably unused outside their own file (incl. the 4 named in the task), verified with `rg`/`grep -w` across all of `apps/web` including `*.test.ts(x)`.

## Decisions and interface changes
- Skipped task 2 (`.sidebar-collapse` → `workspace.css`) and task 3 (`.spin` → `auth.css`): both require deleting rules from `globals.css`, which already carries an uncommitted, not-mine change (a `.client-mark` comment edit) from the concurrent client-logo session. Per the coordinator's scope-change message, skipped rather than edited. `workspace/README.md`'s `.sidebar-collapse` claim and `auth/README.md`'s `.spin` claim are left as-is since the moves did not happen — they are still accurate. Retry once `globals.css` has no foreign diff.
- Dropped the `settings-data.ts` export items from task 5 per the coordinator's scope change (concurrent client-logo writer). Never edited that file; nothing to revert.

## Checks actually run
- `npx vitest run features/shared features/workspace features/auth features/briefings features/board features/projects features/settings features/brand` — 37 files / 492 tests pass.
- `npm run typecheck` — passes clean.
- `npm run lint` — passes clean.
- `npx prettier --check app features` — 1 warning, `features/playground/use-playground-close-lifecycle.ts`: owned by the concurrent playground/upload-rules agent, not touched, reported per instructions rather than fixed.

## Risks and next action
- `.sidebar-collapse`/`.spin` moves (tasks 2 and 3) remain outstanding; next action is retrying them once `globals.css` is free of the other session's uncommitted diff.
- Ownership: all paths this agent touched are released; no active writer or process left running.
