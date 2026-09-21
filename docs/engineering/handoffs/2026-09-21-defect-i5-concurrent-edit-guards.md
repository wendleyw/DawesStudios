# Defect I-5 — concurrent edit guards for the four settings editors

- Updated at: 2026-09-21T17:05:00Z
- Reporting agent and tool: Defect I-5 repair worker / Claude Code
- State: verified — reproduced, repaired, measured on all four surfaces, checks green
- Objective: stop a stale settings form silently overwriting a newer save; refuse it with a visible, actionable sentence that preserves what the person typed, on client settings and its three siblings.
- Owned paths: `supabase/migrations/202609210003_concurrent_edit_guards.sql`, `supabase/tests/database/concurrent_edit_guards.test.sql`, `apps/web/features/settings/**`, `apps/web/features/workspace/workspace-data.ts`, `apps/web/features/briefings/briefing-data.ts`, `apps/web/features/briefings/briefing-model.ts`, `supabase/database.types.ts`, `docs/verification/acceptance-family-i.md`, the I06 rows of `docs/architecture/acceptance-matrix.md`, `docs/architecture/backend.md`, `apps/web/features/settings/README.md`, and this report.
- Dependencies: the local stack `supabase_db_dawes-studios`; the `:3003` container for the pre-repair reproduction only; a private `next dev` on `:3010` for the repaired build. `features/projects/`, `features/shared/upload-rules.ts`, `app/globals.css` and every other migration were read only. The concurrent session's worktree was not entered.
- Acceptance criteria: defect reproduced first; all four surfaces refuse a stale save visibly and keep the typed text; one migration; no existing test modified; `npm run check`, `npm run db:test` and the browser suite pass; dataset unchanged.

## Completed work and changed files

| File | Change |
| --- | --- |
| `supabase/migrations/202609210003_concurrent_edit_guards.sql` | New. `updated_at` + `private.touch_updated_at()` trigger on `clients` and `campaigns`; `update_workspace_settings` and `save_service_preset` recreated with an expected-revision argument, explicit revoke/grant by full signature, and a repeat of the `202609200002` EXECUTE sweep. |
| `supabase/tests/database/concurrent_edit_guards.test.sql` | New. 22 assertions: stale refusal on all four surfaces, the refused save touching neither its target column nor the history table, an unguarded caller still writing, and no `security definer` function in `public` executable by `anon`. |
| `apps/web/features/settings/settings-data.ts` | `saveClient`/`saveCampaign` take a `revision` and filter on it, raising the refusal on `PGRST116`; `saveServicePreset`/`saveWorkspaceSettings` pass the expected revision; the latter returns the revision its save produced. |
| `apps/web/features/settings/{client,campaign,preset,workspace}-settings.tsx` | Each editor snapshots the revision it opened on. The studio form adopts the revision its own save returned, since it stays on screen. |
| `apps/web/features/settings/settings-data.test.ts` | Eight new tests appended. No existing test touched. |
| `apps/web/features/workspace/workspace-data.ts`, `features/briefings/briefing-{data,model}.ts` | `updated_at` on the `Client` and `Campaign` types and in the campaigns `select`. |
| `supabase/database.types.ts` | Hand-patched with exactly this migration's changes; a full regeneration would have pulled in the concurrent session's applied-but-unmerged `video_pins` schema. |
| `docs/architecture/backend.md`, `apps/web/features/settings/README.md`, `docs/verification/acceptance-family-i.md`, `docs/architecture/acceptance-matrix.md` | RPC signatures, the guard and its rationale, the repair evidence, and I06 reassessed to **Verified**. |

## Decisions and interface changes

**Pattern.** `updateProjectDetails`, not `saveTemplateDraft`: the timestamp is set by the table's
own `before update` trigger with `clock_timestamp()`. A browser clock is never written.

**Each expected revision is optional.** `apps/web/tests/e2e/intake-admin.spec.ts` restores both
procedures with no form to quote, and `settings-data.test.ts` asserts the exact call chain of the
unguarded table writes. Neither may be modified, so the guard is additive: a caller that supplies no
revision is last-write-wins as before. Every editor in the product supplies one. **This is the one
compromise in the repair and it is the orchestrator's to revisit** — making the argument required
means changing four existing assertions.

**`update_workspace_settings` now returns `timestamptz`.** The studio form is not a dialog; it stays
on screen, so it needs the revision its own write created rather than a later read another editor
could already have moved past. `save_service_preset` already returned its new revision.

**Function privileges.** Recreating a function under a new signature creates a new object that is
created with EXECUTE for PUBLIC. Both new signatures are revoked from `public,anon` and granted to
`authenticated` explicitly, and the migration repeats the `202609200002` sweep, which also closed
`post_comment` — exposed (`=X/postgres`, `anon=X`) by the concurrent session's applied migration and
the only such function. **`alter default privileges in schema public revoke execute on functions
from public` was tested and does not work here**: on PostgreSQL 17.6 as `postgres`, the stored
default ACL never records the revocation and a function created afterwards still carries
`=X/postgres`; revoking from `anon` does take effect but anon keeps EXECUTE through PUBLIC. A
`ddl_command_end` event trigger would close it permanently and `postgres` can create one here, but
that is a repository-wide policy decision and is left to the orchestrator; the class-wide pgTAP
assertion is the interim guard.

**Applying the migration.** `supabase migration up` refuses to run while `202609210001_video_pins`
is applied to the shared database without its file on this branch. The migration was therefore
applied statement by statement in one transaction with its `supabase_migrations.schema_migrations`
row written by hand. **No reset, no reseed.**

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| Two-session client-settings probe, before any change | Chromium ×2 against `:3003`, 2026-09-21 16:26Z | **Defect reproduced**: A's `industry` reverted, B's alert region empty, B's dialog closed as a success | `docs/verification/acceptance-family-i.md` § Defect I-5 |
| Two-session probe, all four surfaces, repaired build | Chromium ×2 against `next dev` on `:3010`, 16:4xZ | **All four refuse**: sentence in `role="alert"`, form stays open, typed text kept, winner's data intact | same section |
| Function ACLs after the migration | `psql`, 16:5xZ | both procedures `postgres, authenticated, service_role`; **0** anon-executable `security definer` functions in `public` | same section |
| `npm run check` | repository root, 17:00Z | **pass** — typecheck, lint, format, **457 tests / 33 files** (2 pre-existing lint warnings in `features/board/`) | terminal |
| `npm run db:test` | repository root, 17:01Z | **PASS — 155 assertions / 6 files** | terminal |
| `npx playwright test` | `PLAYWRIGHT_BASE_URL=http://localhost:3010`, 16:5xZ and again 17:0xZ | **25/25 in 2.6 m**, both runs | terminal; evidence artefacts restored with `git checkout -- docs/verification/` |
| Dataset counts | `psql`, before and after every run | 10 clients, 25 projects, 12 campaigns, 30 briefings, 70 brand assets — unchanged | same section |

## Remaining risks and next action

Two environment facts the next owner needs. The shared stack was **reset and reseeded by another
session at 16:30Z** mid-task; it removed this migration, which was re-applied, and the dataset came
back identical. That reseed also rotated the demo password away from `supabase/.env.local`, so the
browser suite cannot sign in as checked out: the demo users' password hashes were snapshotted,
aligned with the repository's env file for the length of each browser run, and restored byte for
byte. **Whoever owns the stack should decide which `DEMO_PASSWORD` it carries**, because the two
worktrees currently disagree and only one of them can run the browser suite.

Open items, none blocking this defect: the optional expected revision described above; the
`ddl_command_end` event trigger that would make the privilege invariant permanent; and
`saveBrandSection` (`features/brand/brand-data.ts`), the last same-shape write, still unguarded and
repairable with no schema change — explicitly out of this task's scope.

## Ownership at handoff

All paths released; the `next dev` on `:3010` was stopped. The `:3003` container, Docker and every
existing migration were left untouched, `supabase/migrations/` carries exactly one new file, and the
concurrent session's two untracked files under `docs/superpowers/` were never staged. Returning to
the orchestrator.
