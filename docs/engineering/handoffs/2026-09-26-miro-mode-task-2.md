# Miro mode Task 2: Playground album and image clipboard

- Updated: 2026-09-26T12:00:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: add a Playground album source and a clipboard-copy helper, on `apps/web/features/playground/playground-albums.ts`, `playground-albums.test.ts`, `album-clipboard.ts`, `album-clipboard.test.ts`.

## Changes
- `playground-albums.ts` — added `AlbumFileSource` kind `"playground"` (`assetPath`, optional `previewUrl`), `Album["group"]` now includes `"playground"`, `buildPlaygroundAlbum(items)` (images newest-first, id `"playground"`), `CLIPBOARD_ONLY_IMAGES`, `clipboardDisabledReason(file)`.
- `playground-albums.ts` — `copyAlbumFilesToBoard`'s download branch throws `"A Playground file is already on the board."` for the new kind, keeping the existing `source.kind` narrowing exhaustive/type-safe.
- `playground-albums.test.ts` — added `buildPlaygroundAlbum` and `clipboardDisabledReason` test suites per the brief, plus the new imports.
- `album-clipboard.ts` (new) — `ClipboardEnvironment`, `toPng`, `copyImageToClipboard(download, environment?)` per the brief, verbatim.
- `album-clipboard.test.ts` (new) — the brief's four `copyImageToClipboard` tests, verbatim.

## Decisions and interface changes
- Checked `playground-albums-panel.tsx`'s `source.kind` ternaries (lines 183/191): each falls back to `null`/`"internal"` rather than reading the other branch's field, so adding the `"playground"` kind/group compiles unchanged. No edit needed outside owned paths.
- Prettier reformatted `playground-albums.ts`, `playground-albums.test.ts` and `album-clipboard.test.ts` (whitespace only) after pasting the brief's exact snippets; `album-clipboard.ts` needed no reformatting.

## Checks actually run
- `cd apps/web && npx vitest run features/playground/playground-albums.test.ts features/playground/album-clipboard.test.ts` — pass, 34 tests.
- `cd apps/web && npx vitest run features/playground` — pass, 99 tests (7 files).
- `npm --prefix apps/web run typecheck` — pass, no errors.
- `cd apps/web && npx eslint features/playground/playground-albums.ts features/playground/playground-albums.test.ts features/playground/album-clipboard.ts features/playground/album-clipboard.test.ts` — pass, no output.
- `cd apps/web && npx prettier --check <same 4 files>` — pass after `--write` reformat.

## Risks and next action
- Task 3 (album strip clipboard mode) can consume `buildPlaygroundAlbum`, `clipboardDisabledReason`, `CLIPBOARD_ONLY_IMAGES`, `copyImageToClipboard` as specified; no UI wiring done here.
- Ownership: paths released; no active writer.
