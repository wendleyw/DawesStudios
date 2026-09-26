# System refactor R4 — e2e spec repair (removed search, real competitors, animated mark)

- Updated: 2026-09-26T05:49:15-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective/paths: repair 3 stale specs after 2026-09-24 product changes, test files only;
  `apps/web/tests/e2e/{brand-accessibility,competitor-ads,video-loading}.spec.ts`.

## Changes
- `brand-accessibility.spec.ts`: mobile-nav test clicks the drawer's "Overview" link (Search
  retired 2026-09-24), scoped to the `navigation` dialog locator — unscoped, it's ambiguous with
  the client workspace's own "Overview" links, still role-queryable while `.workspace` is inert.
- `competitor-ads.spec.ts`: reads SABRE's non-"Acceptance competitor%" rows via `localAdmin` first;
  asserts the empty state only if none exist, else each pre-existing name in the widget. Real
  fixture "Sabre Pepper Spray" (studio, 2026-09-24 14:34 UTC) confirmed untouched after both runs.
  Every later assertion (counts, designer/client views, RLS) is name/role-scoped, none assumed 1 row.
- `video-loading.spec.ts`: `beforeOpen` video/metadata-preload count scoped to `.project-canvas
  video`, excluding the sidebar's `video.brand-mark` (310efb3). Also fixed a 2nd staleness hidden
  behind the first: the board now opens as List for a first-time viewer (1cd8a6c, also 2026-09-24),
  so the board-thumbnail check now selects "Canvas view" first, as `competitor-ads.spec.ts` does.
  `mediaRequests` confirmed already scoped to `.mp4` GETs only, unaffected.

## Decisions: none outside the three test files; no product code touched.

## Checks actually run
- Each spec green twice: `npx playwright test tests/e2e/<spec> --output=../../outputs/pw-r4-fix` —
  brand-accessibility 3/3 x2, competitor-ads 1/1 x2, video-loading 1/1 x2.
- `npx prettier --write` on the 3 specs: unchanged. `npm run check`: 109 files/1168 tests pass.

## Risks and next action
- None unresolved. Left `login.png` deletion and untracked `docs/verification/system-audit-2026-09-26.md` alone (not owned here). Ownership released.
