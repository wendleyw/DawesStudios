# System refactor R2 — split the project action dialog by action

- Updated: 2026-09-26T03:43:44-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective/paths: split 646-line `project-action-dialog.tsx` into one component per action, no
  behaviour change; `apps/web/features/projects/` per `r2-brief.md`.

## Changes
- `project-action-dialog.tsx` (646→98 lines): thin `switch (action.kind)` dispatcher + closed-Modal
  fallback. `ProjectActionDialog`/`ProjectAction` unchanged (path, props, type).
- New: `project-action-shell.tsx` (Modal/form/footer/error, `useProjectActionClose`,
  `useCloseOnSuccess`); one file per kind (version/design/publish/miro/submit/review);
  `design-{text-options,upload-status}.tsx` split out of design to shrink it. `MiroField` moved into
  `miro.tsx`, imported by `publish.tsx`. Query keys, idempotency keys, call sites, error strings and
  DOM/class names copied verbatim. README retargeted + new split-explaining paragraph.
- Added `project-action-{version,review}.test.tsx` for the 2 kinds the 494-line test file never
  exercised; other 5 kinds' coverage there is untouched.
## Decisions
- `project-action-design.tsx` stays 343 lines (over ~250 guidance): owns the upload state machine;
  further splitting risked behaviour drift for little gain. Noted in README.
- Stale doc, outside owned paths, not fixed: `docs/architecture/data-access.md:19` still cites
  `project-action-dialog.tsx` for `findUnchangedDesign`/`findDesignByAsset`, now in `design.tsx`.
## Checks run
- Per extraction (×6): `vitest run project-action-dialog.test.tsx` (21/21) + scoped `tsc --noEmit`.
- `npm run check` — 108 files/1166 tests pass. Playwright, 7 specs from the brief
  (`--output=../outputs/pw-r2`) — 21/21 pass.

## Risks and next action
- None unresolved. Next: orchestrator reviews the line-count deviation and forwards the
  `data-access.md` staleness. Ownership released.
