# Miro mode Task 6 — browser flows, visual check, docs

- Updated: 2026-09-26T13:12:00-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: rewrite the Miro-mode browser spec, run it plus CSP, do a visual
  check, and update docs, per the brief's Files block.

## Changes
- `apps/web/tests/e2e/miro-version-links.spec.ts` — replaced the three old `MiroBoardPanel` tests
  with the three Miro-mode tests from the brief (header entry, Conversation-beside-Miro, asset
  strip, clipboard copy, reload, Versions/Miro toggle, card entry; designer-only board; stale
  version fallback). Fixed a strict-mode locator collision ("Conversation" vs "Close conversation")
  with `exact: true`.
- `apps/web/features/projects/README.md` — replaced the `MiroBoardPanel`/full-screen-layer
  paragraph with a "Miro mode" section; updated the Verification section to cite the new spec
  behavior and `docs/verification/miro-mode-2026-09-26.md`.
- `docs/verification/miro-mode-2026-09-26.md` — new record: checks, copy-check spike finding,
  visual observations, doc-touch summary.
- No change needed: `apps/web/features/playground/README.md`, `apps/web/features/shared/README.md`
  (already describe clipboard mode/strip/own-fullscreen-layer), `docs/architecture/backend.md`,
  `docs/architecture/permissions.md` (neither ever said "panel"; access rules unchanged).

## Decisions and interface changes
- None outside owned paths.

## Checks actually run
- `cd apps/web && npx playwright test tests/e2e/miro-version-links.spec.ts tests/e2e/content-security-policy.spec.ts --output ../../outputs/playwright-miro-mode` — 4/4 passed (after the `exact: true` fix and after a prettier reformat).
- Read-only `docker exec supabase_db_dawes-studios psql`: 0 rows in `design_version_miro_links`; 0 rows in `publication_miro_links` for the SABRE project (the one remaining row is the pre-existing "Personal Alarm Product Story" link — untouched).
- `npm run check` (repo root) — typecheck, lint, format, 1197 vitest tests: all pass.
- Manual capture (throwaway script, not committed) for the visual check: 8 screenshots in `outputs/miro-mode/` (not committed — no image needed permanent citation).

## Risks and next action
- Focus-order check was informal (ad-hoc script), not asserted in the spec; see the verification
  record's caveat.
- Ownership released; no active writer or process left running by this task.
