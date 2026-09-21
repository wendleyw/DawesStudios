# Acceptance family I evidence pass

- Updated at: 2026-09-21T16:20:00Z
- Reporting agent and tool: acceptance evidence worker / Claude Code
- State: tested — measurement complete, one of six rows Verified, five left open against measured failures
- Objective: produce acceptance evidence for the six open rows of family I (I01, I02, I04, I05, I06, I07) of `docs/architecture/acceptance-matrix.md`. Measure only; repair nothing.
- Owned paths: `docs/verification/acceptance-family-i.md`, the family I rows and the backend-handoff browser-suite sentence in `docs/architecture/acceptance-matrix.md`, and this report
- Dependencies: the running local `dawes-studios` Supabase stack; the disposable `dawes-studios-restore-drill` stack on `55521` for the concurrency suite; a production build of `e6b4fe8` served on port `3010` (allowlisted by the media service), started and stopped inside this pass
- Acceptance criteria: each row either marked Verified against evidence actually produced, or left open with a reproducible defect and a stated reason; the canonical dataset identical before and after

## Completed work and changed files

Two documents written, no code touched.

- **`docs/verification/acceptance-family-i.md`** (new) — one section per row plus five defect sections with reproduction steps.
- **`docs/architecture/acceptance-matrix.md`** — the six I rows now carry what was measured; I07 moves to Verified, the other five stay Unverified with a defect link each. The 2026-09-20 backend handoff paragraph claimed the browser suite "passes 25 of 25 against the current dataset"; that is no longer true and was corrected to 24 of 25 with the cause.

No application code, script, migration or existing test was changed. The throwaway probe
`apps/web/tests/e2e/zz-evidence-probe-family-i.spec.ts` was deleted; the working tree carries only
these two documents plus the two untracked `docs/superpowers/` files that belong to another session.

## Decisions and interface changes

No interface changed. Three judgement calls worth recording.

- **The `db:start` failure is charged to I01 rather than explained away.** The stack is repeatably startable — measured across a full stop/start with the data intact — so the guard, not the stack, is what is wrong. But the guard aborts the whole start, and it aborts between applying thirteen Auth passwords and persisting them, and before `start_media()`. A row that requires a clean documented startup cannot be marked on a command that always exits 1.
- **Permission loss and unavailable-resource share one message by design**, so existence is not disclosed to someone not allowed to read it. Recorded as an intentional adaptation, not counted against I04. I04 fails on something else: the offline state of every form is a raw `TypeError: Failed to fetch`.
- **The one remaining canonical mutation was restored and its side effect removed.** Re-creating the revoked SABRE assignment raised a `New project assignment` notification; it was residue of this pass, not fixture data, and was deleted by id so `notifications` returns to 15.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `local_stack.py status`, `npm run db:start` (live), `npm run db:stop`, `npm run db:start` (cold), `status` | local stack, 2026-09-21 | status 0 / **start 1** / stop 0 / **start 1** / status 0; ten containers healthy, data intact, three logins 200 | family-i.md § I01, Defect I-1 |
| `python3 supabase/scripts/verify_seed.py` | local stack | **fail at line 153**, the documented artwork-byte failure after `db:artwork:photos`; every structural assertion before it passed | family-i.md § I01 |
| `npm run check` | repo root | **pass**, 0 type errors, 0 lint errors (2 warnings), 444 unit tests | family-i.md § I02 |
| `npm run build` | repo root | **pass**, 27 routes | family-i.md § I02 |
| `npx playwright test` (whole suite) | `PLAYWRIGHT_BASE_URL=http://localhost:3010` | **24 passed, 1 failed** — `brand-guidance.spec.ts:161` | Defect I-2 |
| `python3 supabase/tests/concurrent_workflows_test.py` | disposable `55521` stack | **4 tests pass**, 0.59 s | family-i.md § I06 |
| Loading / empty / missing-id / malformed-id browser cases | probe on `:3010` | all distinct, each with recovery | family-i.md § I04 |
| `/rest/v1/**` aborted, open board and reload, 40 s | probe | stale cards with no cue; failure screen with `Try again` from ~7 s; no self-heal | family-i.md § I04 |
| `revoke_design_assignment` with the designer's session open | probe | write refused **"Internal channel access required"**, 0 rows; reload → "Project unavailable." | family-i.md § I04 |
| Aborted, retried and **interrupted** `post_comment`, with database inspection | probe on a throwaway project | failed write clean; **interrupted write commits, reports failure, and duplicates on retry** | Defect I-4 |
| Two sessions on the project-details dialog | probe | conflict refused with the correct sentence, newer data intact | family-i.md § I06 |
| Two sessions on the client-settings editor | probe | **second save silently reverts the first, no alert** | Defect I-5 |
| Ten boards, busiest canvas, five searches, five surfaces, thirty client switches, role change | probe | ≤ 700 ms everywhere, 0 long tasks, flat heap, 0 leaks, console `[]` | family-i.md § I07 |
| Thirteen-table count before and after the whole pass | `psql` | identical, including the known 44/47 drift | family-i.md § Dataset integrity |

## Remaining risks and next action

- **Five rows stay open.** I01 on Defect I-1, I02 on I-2, I04 on I-3, I05 on I-3 and I-4, I06 on I-5. Every one has reproduction steps; none was repaired here.
- **Defect I-2 is the cheapest and most urgent**: a stale assertion has kept the browser suite red since `54645f1`, which means no pass since then has had a green suite to point at. It is a test edit, not a product change.
- **Defect I-1 has a latent consequence not exercised here**: on a machine without `supabase/.env.local`, `db:start` sets thirteen Auth passwords and then aborts before saving them. Anyone about to reset or move this fixture should know that before they do.
- **No restore drill was run.** `restore_drill.py` is isolated and never touches the source stack, but I03 is already Verified against `docs/operations/restore-evidence.json` and nothing in this pass needed a second run. Left as it was found.
- Next concrete action for the orchestrator: decide whether the five open rows are repaired now or recorded as accepted risk, starting with I-2.

## Ownership at handoff

All paths released. The probe is deleted, the port-3010 server was stopped and the port is closed,
the local stack is up and healthy with the dataset at its documented counts, and the disposable
drill stack is left running as it was found. `features/projects/` was never written to. The two
untracked files under `docs/superpowers/` belong to another session and were not touched.
