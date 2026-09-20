# Seeded project schedules

- Updated at: 2026-09-20T14:40:00-03:00
- Reporting agent and tool: Seed schedule worker / Claude Code
- State: verified
- Objective: Stagger the seeded project schedules so the planning calendar carries information, without changing any row count or any non-schedule column.
- Owned paths: `supabase/seed.sql`, `supabase/scripts/build_seed.py`, and this report.
- Dependencies: local Docker stack (`supabase_db_dawes-studios`), the documented reset in `docs/operations/README.md`, and `docs/ref/00-guia/CATALOGO-DE-SERVICOS.json` read by the generator.
- Acceptance criteria: many distinct start dates, durations that vary and match project status, overlapping work inside a campaign, several windows short enough to sit whole inside one fortnight, `start_date <= due_date`, every window inside its campaign window, and an unchanged eight-table baseline.

## Completed work and changed files

`supabase/scripts/build_seed.py` gained a `schedules` table keyed by project index, holding one
inclusive `(start_date, due_date)` window per seeded project, and the briefing and project inserts
now read that window instead of the previous `start_date='2026-09-20'` plus
`due_date=f'2026-10-{min(28,pi+2):02d}'` pair. `supabase/seed.sql` was regenerated from it with
`python3 supabase/scripts/build_seed.py`. `supabase/fixtures.json` is byte-identical after
regeneration (md5 `1fa4a065237f737f54ee5df259875ee1` before and after), because the manifest carries
no dates.

The seed diff touches exactly forty statements: twenty `public.projects` inserts and twenty
`public.briefings` inserts. Per-table insert counts across all twenty-six seeded tables are
identical to `HEAD`, so no row count can move.

Windows are placed against each project's status, with 2026-09-20 as the reference day and every
campaign running 2026-09-01 to 2026-10-31.

| Status | Rows | Placement | Span range |
| --- | --- | --- | --- |
| delivered | 1 | closes before the reference day | 11 days |
| approved | 3 | closes before the reference day | 14–15 days |
| changes_requested | 2 | straddles the day, due immediately after | 14–18 days |
| client_review | 5 | straddles the day, due within a week | 5–13 days |
| internal_review | 2 | straddles the day, due within a week | 10–17 days |
| in_progress | 4 | straddles the day, runs into October | 14–30 days |
| planned | 3 | starts after the day | 4–19 days |

## Decisions and interface changes

- The generator, not `seed.sql`, is the source of truth: `seed.sql` carries the header "Regenerate
  with python3 supabase/scripts/build_seed.py", so the schedule lives in the generator and the SQL
  was rebuilt from it. Editing `seed.sql` alone would have been erased by the next regeneration.
- A literal table was chosen over a formula. The windows encode judgement about status, campaign
  overlap and calendar legibility that no arithmetic expression states clearly.
- `briefings.due_date` moved with the project it was accepted into. `accept_briefing`
  (`supabase/migrations/202609200002_workflows.sql`) copies the briefing due date onto the new
  project, so the seeded pair must stay equal to remain consistent with what the application
  produces. This is the only change outside `public.projects`; it alters no row count and no other
  column. Nothing sorts or asserts on that column: the briefing list orders by `updated_at`, and the
  only end-to-end assertions on a target due date belong to a draft the test itself creates.
- Nine of the ten campaigns now have an overlapping pair. Vela Skincare deliberately does not, so the
  calendar shows both contention and clear separation.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss` | local Docker stack, 2026-09-20 | pass — "Deterministic fixture reset completed" | terminal |
| Eight-table baseline count after reset | `supabase_db_dawes-studios`, 2026-09-20 | clients 10, projects 20, notifications 12, design_versions 33, designs 38, campaigns 10, briefings 23, Auth users 13 | terminal |
| Per-table insert counts, `HEAD` seed vs regenerated seed | working tree, 2026-09-20 | pass — no mismatch across 26 tables | terminal |
| Schedule spread query | `supabase_db_dawes-studios`, 2026-09-20 | 19 distinct start dates, starts 2026-09-01→2026-10-12, dues 2026-09-11→2026-10-30 | terminal |
| Campaign containment and ordering query | `supabase_db_dawes-studios`, 2026-09-20 | 0 rows violate `start_date <= due_date` or the campaign window | terminal |
| `npm run check --prefix apps/web` | repository root, 2026-09-20 | pass — typecheck, ESLint (3 pre-existing warnings in `features/board`, 0 errors), Prettier, Vitest 208/208 | terminal |
| `npm run db:test` | local stack, 2026-09-20 | pass — Files=5, Tests=133, Result: PASS | terminal |
| `python3 supabase/scripts/verify_seed.py` | local stack, 2026-09-20 | PASS — 10 clients, 20 projects, 79 verified downloads | terminal |
| Playwright end-to-end suite | — | not run, reserved to the orchestrator | — |

## Remaining risks and next action

- The acceptance matrix records a baseline of notifications 11, design_versions 35 and designs 41
  (`docs/architecture/acceptance-matrix.md`, row B10). A pristine documented reset produces
  notifications 12, design_versions 33 and designs 38. The gap predates this task: the seed contains
  11 notification inserts and provisioning adds the delivery notification, and the recorded 35/41
  figures were measured on a database that already carried browser-run residue. The orchestrator
  should decide whether to restate that row.
- The reset applied two untracked migrations that were already in the working tree,
  `202609200025_delivery_visibility.sql` and `202609200026_realtime_design_events.sql`, together with
  an uncommitted change to `supabase/tests/realtime_boundary_test.mjs`. None of them belong to this
  task.
- No migration, row-level security policy or pgTAP test asserts a specific seeded date. The only
  date-sensitive database test,
  `supabase/tests/database/production_integrity.test.sql`, pushes `project-2` to 2020-01-01 and
  expects the check constraint to reject it; `project-2` now starts 2026-09-14, so the test still
  holds. The end-to-end specs supply their own dates.
- Next action: the orchestrator runs the Playwright suite against the freshly reset baseline.

## Ownership at handoff

`supabase/seed.sql` and `supabase/scripts/build_seed.py` are released. No process of this task is
still running. The local stack is up and reset, and the database holds the deterministic baseline.
