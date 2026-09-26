# Miro final fixes — docs, dialog title, panel visual check

- Updated: 2026-09-26T02:25-04:00 · Agent: Claude Code · Model: Sonnet 5
- Objective and owned paths: fix reviewed-out Miro doc claims and the static miro-dialog title;
  capture and verify the open `MiroBoardPanel`. Owned: `apps/web/features/projects/README.md`,
  `project-action-dialog.tsx`, `project-action-dialog.test.tsx`, `docs/verification/
  miro-version-links-2026-09-26.md`, this report, `outputs/miro/miro-panel-*.png`.

## Changes
- `project-action-dialog.tsx` — miro dialog title is now "Add a Miro link." or "Change the Miro
  link." from `action.version.miro`, replacing the static entry (`miroTitle()` helper).
- `project-action-dialog.test.tsx` — two new tests assert each title by heading role.
- `README.md` (Miro section) — corrected: publish field is optional and skips `setMiroLink` when
  blank (link untouched, not cleared); removal only via the version dialog; `canManageMiro` is
  agency-only (removed designer/24 px/read-only-RPC/unassigned-designer claims); fixed card-button
  vs. publish-dialog-title wording; fixed the shared-lifecycle link to `../shared/README.md#full-screen-layer`.
- `docs/verification/miro-version-links-2026-09-26.md` — replaced the "could not be verified"
  finding with confirmed results from a fresh capture; added 4 screenshots.

## Decisions and interface changes
- None outside owned paths.

## Checks actually run
- `cd apps/web && npx vitest run features/projects` — 259/259 passed.
- `npm run check` (repo root) — typecheck, lint, format, vitest (1147/1147) all passed.
- One-off Playwright capture against the running `:3003` server (temp spec, deleted after use, not
  committed): panel fills viewport at 1440/390 light/dark; header doesn't overflow at 390 (`Desk…`
  truncation); focus lands on heading on open; Escape (focus outside iframe) closes and returns
  focus to **View on Miro**; Playground opened once — still full screen. Screenshots at
  `outputs/miro/miro-panel-{1440,390}-{light,dark}.png`, force-added (matches the existing
  tracked-despite-ignored pattern in that directory).
- `docker exec supabase_db_dawes-studios psql` read after capture — 0 rows in
  `publication_miro_links` for the SABRE project: the temporary link was removed.

## Risks and next action
- Miro's real embed still not exercised (blank iframe body, no live board) — same known gap as the
  original verification record's Step 3; unchanged by this task.
- Next action: none required; ready for commit
  `fix(projects): correct Miro docs and title a link change`.
- Ownership: all paths released; no background process left running.
