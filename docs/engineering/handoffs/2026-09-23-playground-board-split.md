# Playground board split (hooks) + shared upload vocabulary

- Updated: 2026-09-23T22:25:04Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: verified
- Objective and owned paths: split playground-board.tsx into colocated hooks; unify playground's MIME/extension vocabulary with features/shared/upload-rules.ts. Owned: apps/web/features/playground/**, apps/web/features/shared/upload-rules.ts (+ README section), this report.

## Changes
- playground-board.tsx: 964 -> 800 lines. Extracted 3 colocated hooks; item drafts/persistence/selection/remove/download stay (cross-cutting, read/written by nearly every action).
- use-playground-close-lifecycle.ts (new, 80 lines): dialog phase, focus/scroll lock+restore, beginExit, handleAnimationEnd.
- use-playground-navigation-guard.ts (new, 97 lines): beforeunload, same-tab link guard, Escape, requestClose gate.
- use-playground-drop.ts (new, 120 lines): canvas/flow/fileInput refs, origin(), addFiles() bounded-queue upload, objectUrls cleanup.
- playground-model.ts (159 lines): added exported `messageOf`; `playgroundFormats` now sources extensions from shared `uploadExtensions` instead of duplicating them.
- playground-types.ts (56 lines): allow-lists now `satisfies readonly UploadMime[]` against the shared vocabulary; documented the bucket-limit match.
- upload-rules.ts (236 lines): extended `uploadExtensions`/`mimeLabels` with playground-only types (gif, txt, csv, rtf x2, doc, xls, ppt, docx, xlsx, pptx). No existing allow-list (`standardUploadMimes` etc.) changed.
- README updates: playground/README.md (file layout + vocabulary/bucket-limit note), shared/README.md (new `upload-rules.ts` table row + explanatory paragraph, upload-rules section only).

## Decisions and interface changes
- ReactFlow's onInit now calls hook-returned `setFlowInstance` instead of inline `flow.current = instance` — required by `react-hooks/immutability` (refs from a custom hook must be mutated inside it); no behavior change.
- Verified 25 MiB `PLAYGROUND_MAX_FILE_BYTES` matches `playground-assets` bucket's effective `file_size_limit=26214400` in 202609230003_playground.sql; 202609230007_project_playground.sql touches only project scoping, not the bucket (grepped, no match).
- No change to accepted/rejected files or any user-facing message.

## Checks actually run
- `npx vitest run features/playground features/shared features/projects` — 239/239 passed.
- `npm run typecheck`, `npm run lint` — both clean, 0 errors.
- `npx prettier --check features` — clean after `--write` on formatting in 1 new hook file and shared/README.md's table reflow.

## Risks and next action
- No new unit tests added for the 3 hooks individually; coverage is via existing playground-board.test.tsx (49 tests, unmodified) exercising them through the component — consistent with "pure move."
- Ownership: paths released, no active writer. Confirmed upload-rules.ts had no concurrent uncommitted changes before and after editing.
