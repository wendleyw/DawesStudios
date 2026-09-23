# Playground and board widgets

Status: original feature implemented and verified, 2026-09-23. The current project-only layer revision is tracked in [the active plan](project-playground-and-video-optimization.md); verification below is historical. Owner: Codex orchestrator. All eight feature acceptance checks are evidenced in the [integrated verification report](../verification/playground-and-widgets-2026-09-23.md); the broader product release audit remains separate.

The widget presentation described by the original verification is superseded by the [five-view board](../../apps/web/features/board/README.md). Legacy widget preference records remain preserved.

## Required behavior

Every supported role (agency, designer, client) can open **Playground** from an accessible project/design board. It opens a fullscreen canvas sliding down over the entire viewport, covering app navigation and the project header, with pan, zoom, draggable/resizable items, notes, and multi-file drag/drop for images and documents. Content persists across closing, navigation and reload. Closing returns to the exact underlying surface. In particular, opening it from the design upload dialog must retain the form and selected file and return to that dialog.

The playground is a brainstorming space, separate from project production assets and immutable client publication. Each project has a separate board for each role. Existing workspace-only records are archived and preserved, with authenticated access denied. Backend authorization enforces role and workspace/project access; clients never receive agency/designer boards, files or identities. Removed users lose access. This is a role collaboration space, not a cross-role publication channel.

The main board now exposes five mutually exclusive icon views: Canvas, List, Timeline, Kanban and Calendar, with per-user/client persistence. This supersedes the original independent-widget behavior without changing Playground or project permissions.

## Current implementation contract

`PlaygroundBoard({ clientId, projectId, onClose, returnLabel? })` lives in `playground-board.tsx` and mounts only while open from a project. Its native dialog escapes canvas clipping and fills the viewport. It owns framing, animation, validation and retry state. `ProjectPage` owns entry points and the upload return flow. The board feature owns its five-view selector and has no Playground entry. The [active revision plan](project-playground-and-video-optimization.md) records current integration ownership; the original feature report below remains historical evidence.

The UI/backend boundary uses `PlaygroundScope = { clientId: string; projectId: string }` and `PlaygroundItem` fields `id`, `board_id`, `kind` (`note`, `image`, `file`), `title`, `body`, `asset_path` (nullable), `mime_type` (nullable), `x`, `y`, `width`, `height`, `revision` (number), plus optional `url` for signed previews. Input omits `board_id`, `revision` and `url`.

`playground-data.ts` exports:

- `usePlayground(scope)` → query data `{ boardId: string; items: PlaygroundItem[] }`; creates/resolves the authenticated role's board, reads its items and signs image previews.
- `useInvalidatePlayground()` → invalidation callback for playground queries.
- `savePlaygroundItem(database, { boardId, item, expectedRevision: number | null })` → saved item; null inserts, matching revision updates; stale/conflicting writes fail visibly.
- `deletePlaygroundItem(database, { boardId, itemId, expectedRevision, assetPath: string | null })` → deletes the item and its associated file, with retryable cleanup semantics.
- `uploadPlaygroundFile(database, { path, file })` → upload to private `playground-assets`, never overwrite unrelated objects. The UI creates a stable path per attempt: `<board UUID>/<item UUID>/<safe filename>`.
- `discardPlaygroundFile(database, path)` → clean an unattached staged upload.
- `getPlaygroundDownload(database, path)` → signed download URL.

All database/Storage access stays in the feature data module. The backend verifies scope, role, payload bounds and file ownership independently of UI checks. Item-level revision guards protect simultaneous edits; inserts/retries use stable item IDs. Scope isolation and private Storage need direct database/HTTP verification, not only hidden controls.

## Acceptance evidence required

1. All three roles can open their own playground from project surfaces; direct cross-role/tenant access and removed-member access fail.
2. Multiple images and documents enter through real drop/file selection; previews/downloads work and persist after reload.
3. Notes, drag, resize, deletion and failed-save retry work; conflicts do not silently overwrite newer work.
4. Upload → Playground → close returns to the same form with text/file intact and final project upload still succeeds.
5. Original widget acceptance is historical. The superseding board revision verifies five exclusive icon views, including monthly Calendar, with per-viewer/client persistence and responsive sizing.
6. Meaningful unit, database, HTTP/browser and accessibility checks pass against rebuilt services; desktop/mobile screenshots are manually inspected.
7. Final dataset remains exactly 10 clients and 25 projects; temporary artifacts are cleaned; docs/checkpoint record actual results and limitations.
8. Keep the Mac awake during execution using the existing `caffeinate` assertion, without changing permanent power settings.

The earlier Team/startup work remains uncommitted and must be preserved. Existing video follow-ups are outside this feature unless a confirmed defect blocks the requested flows.

## Original verification checkpoint (historical)

Final source gate: 558 tests / 45 files, TypeScript, formatting and lint with no errors (one existing warning). Production build passed. Database: 316 assertions / 15 files; HTTP: six Playground plus nine existing tests; media: 34 unit tests plus 15 integration checks. Full browser run: 49/49 passed against the final rebuilt image. Desktop/mobile screenshots were manually inspected. Warm/cold restart preserved 35 public tables and 117 stored-file hashes; the final dataset remains exactly 10 clients / 25 projects with no temporary Playground resources. Worker ownership is released to the orchestrator; reports remain under `docs/engineering/handoffs/`.
