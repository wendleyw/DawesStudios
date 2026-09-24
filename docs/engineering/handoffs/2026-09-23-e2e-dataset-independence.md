# E2E dataset independence: 4 scenarios + 2 same-class fixes

- Updated: 2026-09-24T00:08:49Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective and owned paths: make 4 Playwright scenarios dataset-independent without weakening assertions. Owned: `apps/web/tests/e2e/{client-pages-layout,project-feedback,workspace-actions}.spec.ts`.

## Changes
- client-pages-layout.spec.ts — the private-draft test now inserts its own agency-owned `template_drafts` row via `localAdmin` (same columns `useTemplateDraft`/`updateTemplateDraft` in `features/brand/brand-data.ts` use), instead of `.single()`-selecting a SABRE draft only the local overlay seeds (canonical has 0). Deletes it in `finally`. Ownership assertion unchanged.
- project-feedback.spec.ts (2 tests) — replaced `.eq("title","Retail Partner Introduction")` (overlay-only project) with `createPlaygroundFixture()` plus the same `create_design_version`/`add_design`/`publish_version`/`review_publication` RPCs test 1 in this file already uses, reproducing the same shape (2 published versions, v1 `changes_requested`). Updated the literal feedback string the test checks for to the fixture's own text ("Acceptance revision request…" instead of the overlay's "Demo revision request…") — same assertion, just no longer copying overlay-only copy.
- workspace-actions.spec.ts — close the "Find a project" panel and `grip.hover()` (proves non-occlusion via Playwright actionability) before the raw-mouse grip drag, per the verified root cause. Applied the identical panel-close before the single-click card test, which had the same occlusion bug even on unmodified code (confirmed via `git stash`) — same file/bug class, not one of the 3 named causes, zero assertion change. Also pinned the timeline to "Fortnight" before asserting Quarter changes the window: locally the 50-project SABRE overlay (Jan–Dec span) pushes the default scale to Quarter already, making the click a no-op; canonical's 7 SABRE projects (Sep 17–25) don't. Assertion still proves the same behavior, now from a known baseline.

## Decisions and interface changes
- Left `.react-flow__node-project` `toHaveCount(8)` untouched: it's explicitly "7 seeded SABRE + 1 fixture". CLAUDE.md forbids reconciling overlay (50) vs canonical (7) SABRE counts, so this line is expected to keep failing locally under the overlay and pass on canonical (confirmed below) — not part of my 3 assigned root causes.
- No application code, shared fixtures, or `test-support.ts` touched.

## Checks actually run
- Local (SABRE overlay, :3003, one worker): 9/10 passed; 1 expected fail (the count(8) line above) — `/tmp/dawes-e2e-local-final2`
- Staging (canonical, :3103, `dawes-staging-db`): 10/10 passed — `/tmp/dawes-e2e-staging`
- `npx eslint tests/e2e` and `npx prettier --check tests`: both clean
- `select count(*) from clients where name like 'Acceptance%'`: 0 on local db; also 0 on staging db (read-only check)

## Risks and next action
- None outstanding on the 3 owned files for the 4 assigned scenarios; no commit made.
- Ownership: released, no active writer/process.
