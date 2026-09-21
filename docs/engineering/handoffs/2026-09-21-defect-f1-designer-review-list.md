# Defect F-1 — a designer never learns the client requested changes

- Updated at: 2026-09-21T13:55:00Z
- Reporting agent and tool: Defect F-1 fix worker / Claude Code
- State: verified
- Objective: fix the two causes recorded for Defect F-1 in `docs/verification/acceptance-family-f.md`, add a regression test for each, and re-drive the three-role journey that defines the defect.
- Owned paths: `apps/web/features/projects/project-data.ts`, `apps/web/features/reviews/**`, their tests, `docs/verification/acceptance-family-f.md`, the F15 row of `docs/architecture/acceptance-matrix.md`, and this report.
- Dependencies: the local Supabase stack (`supabase_db_dawes-studios`) and `dawes-studios-app-media-1`; a dev server on one of the media service's allowlisted origins.
- Acceptance criteria: `npm run check` passes; a test per cause fails against the previous code and passes against the fix; the assigned designer sees a rejected version in the in-progress bucket with the client's decision; the seeded dataset is unchanged.

## Completed work and changed files

| File | Change |
| --- | --- |
| `apps/web/features/projects/project-data.ts` | Cause 1. The version mapping moved into an exported pure `toCanvasVersions(versions, reviews, clientChannel)`; a `publication_reviews` row is matched only on the client channel, where the canvas' versions *are* `published_versions` rows and `version.id` *is* the `publication_id`. The internal channel attempts no lookup. The channel test, computed once as `clientChannel`, replaces three inline copies of the same expression. |
| `apps/web/features/reviews/reviews-page.tsx` | Cause 2. `isFinished` is now `status === "approved"` and is exported for test. `reviewed` records that a version was published, not accepted. |
| `apps/web/features/reviews/review-data.ts` | Dependent correction: new exported `publishedVersionStatus`, which reads a published internal version's outcome from `projects.status` — the only projection of the client's decision a designer can read. |
| `apps/web/features/projects/canvas-versions.test.ts` | New. Four cases for cause 1. |
| `apps/web/features/reviews/review-status.test.ts` | New. Six cases for cause 2, asserted over `Object.keys(versionStatusLabels)`. |
| `docs/verification/acceptance-family-f.md` | New "Defect F-1: resolution" section; the pre-fix F15 verdict and the defect heading now point to it. |
| `docs/architecture/acceptance-matrix.md` | F15 → Verified, with what was demonstrated and what remains out of scope. |
| `docs/verification/screenshots/family-f-designer-review-list.png` | New artefact. |

No existing test was modified. No migration was written. The review feature was not restructured.
`media-client.ts`, `artwork-files.ts`, `project-page.tsx` and the canvas components were not touched.

## Decisions and interface changes

**The join, established from the schema rather than guessed.** `publication_reviews.publication_id`
references `published_versions.id`. `published_versions` deliberately carries no internal id. The one
record joining the channels is `private.publication_sources(publication_id, internal_version_id)`,
and `supabase/config.toml` exposes `public` alone, so no API caller can read it; `publication_reviews`
itself is limited to the agency and the client by `reviews_read` → `private.can_client_channel`.
`(deliverable_id, version_number)` is not a substitute, because `publish_version` sequences the
published number independently. **The relationship exists and the API cannot reach it**, so the fix
scopes the lookup to the channel where it is real instead of inventing a join.

**Consequence left open for the orchestrator.** The client's feedback *text* is unreadable by a
designer. Surfacing it would mean exposing `private.publication_sources` or relaxing `reviews_read` —
a schema and role-boundary decision above this task. The product's own intended route (F14) is the
agency relaying the request in the internal conversation, and the fix uses the decision signal a
designer *can* read: `projects.status`, written by `review_publication` in the same transaction.

**Consumers.** `publishedVersionStatus` only ever rewrites `reviewed`, so the agency's and client's
rows — whose status comes from `publication_reviews` — are unaffected. `toCanvasVersions` is
behaviour-identical for every real input; the old comparison never matched.

**Note for the duplication pass.** `isFinished` was created the previous day by extracting
`["approved", "reviewed"]`, written three times, into one helper. That extraction was
behaviour-preserving and correct, and it faithfully preserved the bug — giving the rule one name and
one docstring is what made a wrong rule visible. This is an argument for consolidation that has
nothing to do with tidiness.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` | working tree, 2026-09-21 | pass — typecheck, lint (2 pre-existing warnings in `features/board`), format, **442 tests / 32 files** (was 432 / 30) | terminal |
| Both new tests against the pre-fix logic, temporarily restored in place | working tree, 2026-09-21 | **3 failed / 7 passed**: internal version picked up the client's feedback; `isFinished("reviewed")` was `true` | terminal |
| Three-role browser journey: agency publishes, client requests changes, assigned designer reads the list | `next dev` on `http://localhost:3010`, live Supabase, three browser contexts, 2026-09-21 | pass — designer `In progress` holds the project reading `Changes requested` with `channel=internal`; `Approved` empty; correct at all five lifecycle points; agency and client unchanged; project heading reads `Changes requested` for the designer; no page error in any context | [`acceptance-family-f.md#defect-f-1-resolution`](../../verification/acceptance-family-f.md#defect-f-1-resolution), [screenshot](../../verification/screenshots/family-f-designer-review-list.png) |
| Dataset counted before and after the run | `supabase_db_dawes-studios`, 2026-09-21 | identical: 10 clients, 25 projects, 12 campaigns, 44 design_versions, 47 designs, 18 published_versions, 18 publication_reviews, 15 notifications, 30 briefings; 0 `Acceptance %` leftovers | terminal |

The probe (`tests/e2e/evidence-probe-f1.spec.ts`) was deleted after the run, as was
`test-results/`. The `http://localhost:3003` container was not rebuilt, restarted or stopped, and
Docker was not touched.

## Remaining risks and next action

- A designer still cannot read the client's feedback text. Whether to expose it is a schema decision
  for the orchestrator; it is recorded in the resolution section, not worked around.
- [Observation F-3](../../verification/acceptance-family-f.md#observation-f-3-the-review-list-does-not-distinguish-a-delivered-project)
  is untouched: a delivered project is still labelled `Approved` in the review list.
- The container serving `http://localhost:3003` predates this fix, so any further evidence pass
  against it will still reproduce the pre-fix behaviour. It needs rebuilding before it is used again.
- Next action: orchestrator review and integration of the commit.

## Ownership at handoff

All owned paths released. No process left running: the dev server on port 3010 was stopped and the
port is free; no Playwright or Docker process was started or stopped by this work. Intended
recipient: the orchestrator.
