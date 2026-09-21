# Acceptance family F — measurement pass (F01–F17)

- Updated at: 2026-09-21T14:40:00Z
- Reporting agent and tool: Claude Opus 5 (1M context) / Claude Code
- State: **verified** — measurement complete, evidence written, matrix rows updated, one defect
  recorded and left unrepaired by instruction
- Objective: produce the evidence each of rows F01–F17 of
  [the acceptance matrix](../../architecture/acceptance-matrix.md) requires, against the running
  container, changing no application code
- Owned paths: `docs/verification/acceptance-family-f.md`,
  `docs/verification/screenshots/family-f-*.png`, the F rows of
  `docs/architecture/acceptance-matrix.md`, this report
- Dependencies: the container on `http://localhost:3003` (not rebuilt, restarted or stopped); the
  local Docker Supabase stack (read and fixture writes only, never reset);
  `apps/web/tests/e2e/test-support.ts` and `project-fixture.ts` (read-only);
  `apps/web/features/projects/**` (read-only — a concurrent session owns writes there)
- Acceptance criteria: each row either Verified with the evidence it names, or left open with a
  stated reason; the dataset returns to 10 clients / 25 projects; the throwaway probe is deleted so
  `npm run check` is not broken for anyone

## Completed work and changed files

| File | Change |
| --- | --- |
| `docs/verification/acceptance-family-f.md` | New. One section per row with the scenario, the measured result and a verdict; three defect/finding sections with reproduction steps; dataset-integrity and image-provenance tables |
| `docs/architecture/acceptance-matrix.md` | The 17 F rows' evidence and status cells only. 16 → `Verified — 2026-09-21 family F evidence pass`; F15 → `Unverified — Defect F-1, designer review list`. No other line touched (diff: 17 insertions, 17 deletions) |
| `docs/verification/screenshots/family-f-project-canvas.png` | New artefact: the two-deliverable canvas |
| `docs/verification/screenshots/family-f-pin-alignment.png` | New artefact: the design viewer with a placed pin |

Created and **deleted** before returning: `apps/web/tests/e2e/evidence-probe-family-f.spec.ts`
(four tests). No existing spec, application file, CSS, data module or migration was modified.
`docs/verification/screenshots/client-pinned-feedback.png`, which
`production-workflow.spec.ts` rewrites on every run, was restored to its committed bytes.

## Decisions and interface changes

No interface changes. Three decisions worth recording:

1. **A status code is not evidence of refusal.** `projects`, `designs` and `campaigns` carry
   column-level `UPDATE` grants, so a forbidden update is filtered by RLS row matching rather than
   refused by privilege, and PostgREST answers `204` with no error. Every negative check in the
   evidence record therefore asserts the **stored value**, not the response code.
2. **Role isolation was measured on payloads, not on the rendered page.** For F04 and F06 the
   evidence is a direct API read as that role plus, for F04, every REST response body the client's
   browser actually received — 15 responses, none containing the designer's name or id.
3. **F15 was left failing rather than softened.** The row asserts correct records *for the role*;
   one of the three roles is shown the opposite of what happened, so the row is Unverified.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npx playwright test production-workflow.spec.ts project-recovery.spec.ts` | container `2026-09-21T12:30:41Z`, 2026-09-21T14:24Z | 2 passed (8.8 s) | "What the existing specs already proved" in the record |
| Probe test 1 — F01, F02, F03, F05 (two-deliverable fixture, three roles) | same, 2026-09-21T14:28Z | pass, 0 FAIL markers | F01–F05 sections |
| Probe test 2 — F04, F06, F10, F11, F12 (payload and mutation negatives) | same, 2026-09-21T14:29Z | pass, 0 FAIL markers | F04, F06, F10–F12 sections |
| Probe test 3 — F07, F08, F09 (comments, pins, scope) | same, 2026-09-21T14:33Z | pass, 0 FAIL markers | F07–F09 sections |
| Probe test 4 — F13, F14, F15, F16, F17 (review control, delivery, share link) | same, 2026-09-21T14:32Z | pass, 0 FAIL markers; F15 measurements record the defect | F13–F17 sections, Defect F-1 |
| Full four-test probe run in one pass | same, 2026-09-21T14:32Z | `4 passed (47.5 s)`, 0 FAIL markers | — |
| Thirteen-table count, immediately before and after that run | `supabase_db_dawes-studios` | identical: clients 10, projects 25, campaigns 12, design_versions 44, designs 47, notifications 15, briefings 30, published_versions 18, published_designs 22, internal_comments 22, client_comments 57, delivery_files 1, project_assignments 25 | "Dataset integrity" in the record |
| `npm run format:check` (apps/web) after deleting the probe | 2026-09-21T14:36Z | `All matched files use Prettier code style!` | — |
| Seeded-data query for the F-1 defect's blast radius | `supabase_db_dawes-studios` | The two seeded `changes_requested` projects carry `design_versions.status = 'draft'`, not the `'reviewed'` the product's own publish path writes, so the seed does not reproduce the defect | Defect F-1, "Note on the seed" |

Not run: `npm run check` in full, `npm run test`, and any browser check outside the four probe tests.
Docker was not touched; the container was not rebuilt or restarted.

## Remaining risks and next action

- **Defect F-1 (High) is unrepaired**, by instruction. Once a client requests changes, the assigned
  designer's review list empties `In progress` and files the rejected version under `Approved`, and
  the decision is unreachable to that role anywhere — 0 rows from `publication_reviews` and
  `published_versions`, no notification, and the canvas's `Client feedback` panel cannot match an
  internal version id against a `publication_id`. Root causes and reproduction are in the record.
  A fix touches `apps/web/features/reviews/` and probably `supabase/migrations/`, so it needs an
  owner and a migration decision from the orchestrator — note that `features/projects/` had a
  concurrent writer during this pass.
- **Finding F-2 (Low):** every deliverable's V1 renders a button named `Add design to version 1`, so
  a multi-deliverable canvas carries duplicate accessible names.
- **Observation F-3:** no review bucket distinguishes a delivered project from an approved one.
- **Observation F-4:** silent RLS refusals mean any future pass that reads only status codes will
  record a false "ALLOWED".
- **Image provenance:** the container was built from `6bc6228`, one web commit behind head. The only
  later source change, `0b5473a`, touches `apps/web/features/board` alone, so family F's surface in
  the image is head's. A future pass should rebuild before measuring rows outside family F.
- Next concrete action for the orchestrator: decide whether Defect F-1 is fixed now or logged, and
  assign it; then F15 can be re-measured with the same five-lifecycle-point capture.

## Ownership at handoff

All paths above are released. No process, worker or browser context from this task is still running;
the probe spec is deleted and `apps/web/tests/e2e/` holds only its twelve committed files. The two
untracked files under `docs/superpowers/` belong to another session and were neither staged nor
touched. Intended recipient: the orchestrator.
