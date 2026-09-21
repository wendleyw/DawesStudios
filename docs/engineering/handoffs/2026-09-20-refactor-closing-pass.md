# Task 16: Closing structural pass

- Updated at: 2026-09-20T23:10:00-00:00
- Reporting agent and tool: Claude (Claude Code, general-purpose agent context)
- State: implemented and tested for steps 1–4; `db:test` run but pre-existing failures observed and left unresolved (out of scope: `supabase/migrations/` off-limits, Docker untouched)
- Objective: closing structural pass over shared infrastructure the seven feature migrations could not own — wire board's invalidation to the new workspace helper, and pass over `apps/web/app`'s three non-page files, `apps/media/src`, and `supabase/scripts`/`supabase/tests` for dead code and duplication, without changing behavior
- Owned paths: `apps/web/features/board/board-data.ts`, `apps/web/features/board/board-page.tsx`, `apps/web/features/workspace/workspace-data.ts`, `supabase/scripts/fixture_media.py`, `supabase/scripts/demo_artwork.py`, and this report
- Dependencies: `apps/web/features/workspace/workspace-data.ts`'s `workspaceQueryKeys`/`useInvalidateWorkspace()` (already present before this task); the concurrent session's uncommitted `proOptions={{ hideAttribution: true }}` edits (since committed by that session as `9c38bd0` during this task, before my step-1 commit)
- Acceptance criteria: `npm run check` still 391 tests / 25 files; `npm --prefix apps/media test` still passing; the inline-Supabase-query grep in `apps/web/features` stays empty; no test file modified; `supabase/migrations/` untouched; concurrent session's edits carried through intact

## Completed work and changed files

**1. Board → workspace invalidation (implemented, tested).**
Verified before editing that `board-page.tsx:121` invalidated exactly `["projects"]` and `workspaceQueryKeys` (`apps/web/features/workspace/workspace-data.ts:114`) is exactly `["projects"]` — identical sets, so wiring is non-widening, matching the reviewer's earlier verification.

- `apps/web/features/board/board-page.tsx`: imports and calls `useInvalidateWorkspace()` in place of a local `useQueryClient()` + inline `invalidateQueries({ queryKey: ["projects"] })`. `useQueryClient` import removed as it became unused.
- `apps/web/features/board/board-data.ts`: updated the comment above `moveProjectPosition` — it no longer says "once one exists"; it now states the call site uses `useInvalidateWorkspace()`.
- `apps/web/features/workspace/workspace-data.ts`: the "Projects" section comment referenced the *not-yet-wired* state ("...is left for whoever owns that call site next"). Updated it in the same task, since it directly describes the thing just wired — leaving it would immediately be a false, stale in-repo claim. No code behavior changed, comment only.

Committed as `0015918` — `refactor(board): wire moveProjectPosition invalidation to workspace helper`.

**2. `apps/web/app`'s three non-page files (reviewed, nothing changed).**
- `apps/web/app/api/invitations/route.ts` (98 lines): read in full. No dead code, no unused variables/imports. The origin-handling block (`APP_ORIGIN` fallback, the exact-match origin check) was left completely untouched, per instruction — this is the previously-fixed container-origin defect.
- `apps/web/app/layout.tsx` (46 lines): confirmed both stylesheet imports (`./globals.css`, `@/features/shared/forms.css`) resolve to real files after the Task 5 stylesheet split.
- `apps/web/app/error.tsx` (23 lines): confirmed `.centered-state` (used by its `<main>`) still exists in `apps/web/app/globals.css`.
No changes made in this area — nothing worth changing was found.

**3. `apps/media/src` (reviewed, nothing changed).**
Read `server.js` (126), `sanitize.js` (105), `supabase.js` (69), `integration-test.js` (74) in full. Each file has one clear responsibility (HTTP layer / media sanitization / Supabase backend client / integration test script) and none mixes concerns badly enough to warrant a split at this size, matching the task's own expectation. No unused imports or dead branches found (every exported function is consumed by at least one of the other three files or by `server.js`'s CLI entry point). No changes made.

**4. `supabase/scripts` and `supabase/tests` (one genuine duplication fixed; one duplication identified and deliberately left alone).**

Read all of `build_seed.py`, `verify_seed.py`, `fixture_media.py`, `demo_artwork.py`, `provision_local_auth.py`, plus the rest: `backup_local.py`, `local_stack.py`, `provision_logo_exports.py`, `reload_auth_config.py`, `restore_drill.py`, `verify_local.py`.

- **Fixed:** `fixture_media.py`'s `png_card()` and `demo_artwork.py`'s `with_author()` each independently built the identical PNG `tEXt` "Author" marker chunk (`chunk(b'tEXt', b'Author\x00Private production designer')`) from an inline literal — the same bytes expressed twice, with no shared source of truth, so the two could silently drift out of sync. Extracted it as `fixture_media.AUTHOR_TEXT_CHUNK`, exported and used by both call sites. Verified byte-for-byte identical output (`png_card(..., internal=True)` still embeds the same chunk; `b'Author'` present/absent exactly as before). Committed as `7236def` — `refactor(fixtures): share the author-marker PNG chunk across fixture builders`.
- **Identified, left alone:** a one-line `.env`-file parse (`dict(line.split('=', 1) for line in ... if '=' in line and not line.startswith('#'))`) is duplicated across 7 files: `demo_artwork.py`, `provision_local_auth.py`, `provision_logo_exports.py`, `verify_seed.py`, `restore_drill.py`, and the two test scripts `supabase/tests/concurrent_workflows_test.py` and `supabase/tests/http_auth_storage_test.py`. The two test files are explicit safety nets this task must not modify, so full deduplication isn't achievable regardless; extracting a shared helper for only the remaining 5 files would add a new cross-file import dependency for a single line of code, for partial benefit. Judged as manufacturing work relative to the task's own "expect to change little" guidance — left as is.
- No dead code found in any of the reviewed scripts (checked for unused imports via an AST-based script across all of `supabase/scripts/*.py`; none found).

## Decisions and interface changes

- No public interface changed for consumers outside the touched files. `useInvalidateWorkspace()` already existed; only its one remaining unwired call site was pointed at it.
- `fixture_media.AUTHOR_TEXT_CHUNK` is a new export, additive only; nothing else in the codebase referenced the old inline literal in a way that required updating beyond `demo_artwork.py`.
- No cross-domain interface changes to report to another owner.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` | Local, this session, after both commits | PASS — 391 tests / 25 files, typecheck/lint/format clean (two pre-existing warnings in `board-canvas-controls.tsx` and `board-nodes.tsx`, files this task did not touch) | terminal output, this session |
| `npm --prefix apps/media test` | Local, this session | PASS — 14 tests / 2 files (`server.test.js`, `sanitize.test.js`, both untouched) | terminal output, this session |
| `npm run db:test` | Local, running Docker stack (already up before this task; not started/restarted by me), this session | FAIL — 15 subtests failed across `access_and_workflows.test.sql`, `production_integrity.test.sql`, `trusted_media_and_catalog.test.sql` (e.g. "Version not found" from `publish_version`, `42501` authorization mismatches on `post_comment`, a designer project-count mismatch). `git status --short supabase/migrations/` is clean (no uncommitted migration in the tree), so this is not caused by an in-flight migration file in this working copy, but the failures reference schema behavior (`publish_version`, channel authorization) that the most recent committed migrations (`202609200025_delivery_visibility.sql`, `202609200026_realtime_design_events.sql`) touch. I did not investigate further, did not touch `supabase/migrations/`, and did not touch Docker, per explicit instruction. This failure is **unrelated to any file this task changed** (fixture Python scripts and TS invalidation wiring do not touch SQL functions or RLS policies). | terminal output, this session |
| `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features --include='*.tsx' \| grep -v 'Array\.from('` | Local, this session | Empty (exit 1 / no matches) — confirmed still zero inline Supabase queries | terminal output, this session |
| `python3 -c "..."` sanity check that `fixture_media.AUTHOR_TEXT_CHUNK == chunk(...)` and `png_card(..., internal=True/False)` behavior unchanged | Local, this session | PASS | terminal output, this session |
| `python3 -m ast`-based unused-import scan over `supabase/scripts/*.py` | Local, this session | No unused imports found | terminal output, this session |
| `node --check` on all four `apps/media/src/*.js` files | Local, this session | Syntax OK (files unchanged) | terminal output, this session |

## Remaining risks and next action

- **Unresolved risk:** `npm run db:test` fails against the currently running local Supabase stack. This is not something this task caused or is permitted to fix (`supabase/migrations/` is off-limits, and Docker must not be touched), but it means the backend acceptance suite is currently red. Next action for whoever owns the database/migration track: investigate whether the running `supabase_db_dawes-studios` container has actually applied every committed migration through `202609200026_realtime_design_events.sql`, since the failures ("Version not found" in `publish_version`, channel-authorization mismatches) look like schema/DB drift rather than a fixture-data problem.
- No other risks identified. Steps 1–3 and the fixture dedup in step 4 are both implemented and verified via the commands above; the one identified-but-untouched duplication (the `.env` parse) is a documented decision, not an open item.

## Ownership at handoff

- All paths touched by this task (`apps/web/features/board/board-data.ts`, `apps/web/features/board/board-page.tsx`, `apps/web/features/workspace/workspace-data.ts`, `supabase/scripts/fixture_media.py`, `supabase/scripts/demo_artwork.py`) are committed and released; no active writers or background processes were started by this task.
- `supabase/migrations/` was not read for refactoring purposes, not touched, and not "tidied" — confirmed via `git status --short supabase/migrations/` showing no changes from this task at any point.
- The concurrent session's uncommitted lines were not reverted, staged, or committed by this task. They were already committed by that session (as `9c38bd0`, "feat(canvas): hide the React Flow attribution badge") partway through this task's work, before my own step-1 commit (`0015918`) landed on top of them. `git diff` on `board-page.tsx` immediately before committing showed only my own three-hunk change with no trace of their `proOptions` line, confirming clean separation.
- Docker was not started, stopped, or restarted at any point; the dev server on port 3003 was not touched.

## Commits

- `0015918` — `refactor(board): wire moveProjectPosition invalidation to workspace helper`
- `7236def` — `refactor(fixtures): share the author-marker PNG chunk across fixture builders`
