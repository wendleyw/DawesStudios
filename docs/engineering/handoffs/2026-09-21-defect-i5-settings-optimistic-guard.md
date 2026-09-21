# Defect I-5 — a stale settings form silently overwrites a newer save

- Updated at: 2026-09-21T12:40:00Z
- Reporting agent and tool: Defect I-5 fix worker / Claude Code
- State: blocked — reproduced and diagnosed; the repair needs a schema change the orchestrator is sequencing
- Objective: give the client-settings editor the compare-and-set guard the project-details and briefing editors already have, so a stale save is refused with an actionable message instead of silently reverting a newer one; audit the other settings surfaces for the same gap.
- Owned paths: `apps/web/features/settings/**` (not written), `docs/verification/acceptance-family-i.md`, the I06 row of `docs/architecture/acceptance-matrix.md`, and this report.
- Dependencies: the local Supabase stack (`supabase_db_dawes-studios`) and the application container on `:3003`, rebuilt from current `main` before this task. `features/projects/`, `features/shared/upload-rules.ts`, `supabase/migrations/` and `apps/web/app/globals.css` were owned by a concurrent session and were read only.
- Acceptance criteria: the defect reproduced first; the refusal actionable and the typed edit preserved; `npm run check` and `npm run test:e2e` pass; the dataset unchanged.

## Completed work and changed files

| File | Change |
| --- | --- |
| `docs/verification/acceptance-family-i.md` | New "Repair attempt, 2026-09-21" section under Defect I-5: the second reproduction, the schema finding that blocks the fix, which of the two existing patterns the repair should follow and why, a seven-row audit of every settings write plus `saveBrandSection`, the suggested single migration, and the checks run. The I06 verdict and the summary row now carry the re-assessment. |
| `docs/architecture/acceptance-matrix.md` | I06 evidence cell records the re-measurement, the schema blocker, the two further unguarded RPCs, and the green check/e2e baseline. I06 stays **Unverified**. |

**No product code, migration or test was changed.** The repair was stopped at the schema question
under the orchestrator's explicit instruction to report rather than write a migration.

## Decisions and interface changes

**Reproduced first.** Two Chromium contexts signed in as `studio@dawes.local`, both with the SABRE
editor open on `/settings/clients`, driving the real form. A saved `industry = "Editor A industry"`;
B then saved a website from the form it had opened before that. B's save reverted `industry` to
`"Personal safety"`, B's `role="alert"` list was `[""]` (the empty live region — no message), and B's
dialog closed as a success. The SABRE row was restored verbatim in the probe's `finally`.

**Why the repair stopped.** `public.clients` has no `updated_at` column. Only seven `public` tables
carry one (`brand_sections`, `briefings`, `credit_accounts`, `projects`, `service_presets`,
`template_drafts`, `workspace_settings`), confirmed against `information_schema` on the live stack
and against `202609200001_foundation.sql`. The guard both working editors use —
`.eq("updated_at", revision)` against the value the form was opened on — cannot be expressed against
`clients` without adding the column and a `before update` touch trigger, which is a migration. A
concurrent session is landing a migration for video designs; per the orchestrator this one is to be
sequenced, not merged alongside it.

**Which pattern the repair should follow: `updateProjectDetails`, not `saveTemplateDraft`.** The two
differ in one way that matters here: project details leaves the timestamp to the table's own trigger,
while the draft path writes `updated_at` from the browser clock. A column added to `clients` should
be trigger-driven for the same reason `projects` is. Project details is also the one whose refusal was
measured end to end — the sentence is raised inside the data function so there is one copy of it, the
modal stays open, `onError` invalidates the cache only, and the revision snapshot the form is keyed on
is deliberately not refreshed, so the losing session keeps what it typed. `ClientEditor` already keeps
its text on a failed save (`useState` fields, `Modal` stays mounted, `FormError` is `role="alert"`), so
only the revision snapshot and the refusal sentence are missing.

**Audit of the other surfaces.** `saveCampaign` has the same shape on a table that also lacks
`updated_at`. `update_workspace_settings` and `save_service_preset` write tables that *do* carry a
revision (`service_presets` carries both `updated_at` and `revision`) but neither RPC accepts an
expected one, so both are last-write-wins; guarding them changes a function signature, so they belong
in the same migration. `updateProfile` writes one field of the caller's own row and cannot lose a
neighbouring field. Team settings has no shared editor. Outside `features/settings/`,
`saveBrandSection` is the only same-shape write repairable with no schema change — `brand_sections`
has `updated_at`, and the upsert writes a whole section blob, so a stale save discards the other
editor's entire section. It was left untouched as outside this task's scope.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| Two-session client-settings probe | Chromium ×2 against `:3003`, 2026-09-21 12:14Z | **Defect reproduced**: A's `industry` reverted, B alerts `[""]`, B dialog closed as success | `docs/verification/acceptance-family-i.md` § Defect I-5 |
| `updated_at` column survey | `docker exec supabase_db_dawes-studios psql`, read-only | 7 tables; `clients` and `campaigns` absent | same section |
| `npm run check` | repository root, 12:21Z | **pass** — typecheck, lint, format, **449 tests / 33 files** | terminal |
| `npm run test:e2e` | against `:3003`, 12:26Z | **pass — 25/25 in 2.1 m** | terminal; the suite's 30 evidence artefacts were rewritten and restored with `git checkout -- docs/verification/` |
| Dataset counts | psql, before and after the browser suite | 10 clients, 25 projects, 12 campaigns, 30 briefings, 70 brand assets — identical | same section |

## Remaining risks and next action

I06 remains **Unverified**, now on a known and bounded blocker rather than an open question. The next
concrete step, once the video-designs migration has landed, is one migration adding
`updated_at timestamptz not null default now()` and a `before update` touch trigger to `clients` and
`campaigns`, and an expected-revision argument to `update_workspace_settings` and
`save_service_preset`; then four guards following `updateProjectDetails` — revision snapshot on open,
`.eq("updated_at", revision)`, the refusal sentence raised inside the data function — plus a unit test
per write for the stale-save refusal. `saveBrandSection` can be repaired ahead of that migration and
needs no schema change. Until they land, a settings edit made while a second agency session has the
same record open can still be lost without notice.

## Ownership at handoff

All paths released; nothing is running. No product file, test or migration was modified, so the
working tree carries only the two documentation files above and this report. `features/projects/`,
`supabase/migrations/`, `features/shared/upload-rules.ts` and `app/globals.css` were read but never
written, and the concurrent session's two untracked files under `docs/superpowers/` were not staged.
Returning to the orchestrator.
