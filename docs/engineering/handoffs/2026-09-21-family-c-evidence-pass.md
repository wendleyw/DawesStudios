# Acceptance family C evidence pass

- Updated at: 2026-09-21T15:30:00-04:00
- Reporting agent and tool: Family C evidence agent / Claude Code
- State: verified (measurement complete; one row deliberately left open)
- Objective: produce acceptance evidence for the ten open rows of section C of the acceptance matrix, changing no application code, policy, migration or existing test.
- Owned paths: `docs/verification/acceptance-family-c.md`, the section C rows of `docs/architecture/acceptance-matrix.md`, and this report.
- Dependencies: the running `dawes-studios-app-web-1` container on `http://localhost:3003` (image built from `6bc6228`), the local Supabase stack on `127.0.0.1:55421`, and the disposable restore-drill stack on `127.0.0.1:55521`.
- Acceptance criteria: every row marked Verified has the evidence its matrix cell names, produced in this session, with the refusal observed and attributed to a named policy, grant, constraint, trigger or command guard.

## Completed work and changed files

- `docs/verification/acceptance-family-c.md` — new, 866 lines. One section per row, the defects and observations in their own sections, the dataset-integrity table, and an upfront explanation of the three refusal shapes in this installation and the exact column-level `UPDATE` grant map they follow from.
- `docs/architecture/acceptance-matrix.md` — the ten open C rows restated. **Nine Verified, C07 left Unverified.** C08 and C10 were already Verified and were not reopened.

No application code, RLS policy, migration or existing test was touched. `supabase/tests/**` is unchanged.

## Decisions and interface changes

None. This was a measurement pass; two defects were found and recorded rather than repaired.

- **C07 is not Verified.** Its assertion names *stale authorization* explicitly, and that clause fails: a signed storage URL minted while a designer holds an assignment keeps serving the internal object after the assignment is revoked, anonymously, for its full TTL. Everything else in the row passes.
- **C01 is Verified with Defect C-1 recorded against it.** Sign-out destroys the session and revokes the refresh token; an access token already in someone else's hands keeps working at PostgREST for up to an hour. That is a token-revocation weakness, not a failure of any of the four clauses C01 states, and it is written up in full so no later reader takes "sign-out works" for "the token stops working".
- Two observations are recorded that are not defects: the canonical seed assigns both designers in all ten clients, which makes the designer/client read boundary indistinguishable from an absent one by counting alone; and the storage origin serves SVG inline with no `nosniff` and no `Content-Disposition`, which is inert today only because the application never navigates to a storage URL.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run db:test` | local stack, 2026-09-21 | **pass — 133 assertions, 5 files** | terminal |
| `node supabase/tests/realtime_boundary_test.mjs` ×9 | local stack, 2026-09-21 | **8 pass, 1 fail on the first invocation of the session** (cold replication worker; failing assertion not captured, recorded as such) | `acceptance-family-c.md` §C09 |
| Anonymous REST / RPC / storage sweep (30 tables, 10 commands, 5 buckets × 5 shapes, 4 forged bearers) | `127.0.0.1:55421` | all refused; `42501` or `PGRST301` | §C01 |
| Browser sign-in/out journey, 8 protected deep links, back-navigation | `localhost:3003`, Playwright | redirect with `returnTo`, return to the deep link, token count 1 → 0, all routes re-blocked | §C01 |
| Cross-tenant sweep: 24 families read both directions, 25 `PATCH`, 20 `DELETE`, 11 `INSERT`, 8 commands, each write re-read with the service role | `127.0.0.1:55421` | all refused; **9 `UPDATE`s and 4 `DELETE`s answered `204`/`200` with zero rows changed** and the stored value unmoved | §C02 |
| Client payload scan: 32 tables, 15 embeds, CSV, count headers, targeted internal rows | `127.0.0.1:55421` | 138,259 bytes, 52 forbidden strings, 1 hit — an explained false positive | §C03 |
| Client browser capture, 15 routes | `localhost:3003`, Playwright | 713 responses, 23,594,452 bytes, 126 forbidden strings, **0 hits** | §C03 |
| Designer-vs-designer scope, 7 families, 5 commands, `PATCH` + re-read, storage download/sign/info/list | `127.0.0.1:55421` | disjoint; the unassigned designer refused everywhere | §C04 |
| Assignment revocation over HTTP, same unexpired token, then restored | `127.0.0.1:55521` (disposable) | read, write and storage access all closed immediately; assignments restored 10/10 | §C04 |
| Designer boundary: 15 families, 17 commands, 5 administrative writes with re-read, rendered navigation, 7 deep links | `127.0.0.1:55421` + `localhost:3003` | all refused; no admin entry in the sidebar | §C05 |
| Designer browser capture, 31 routes | `localhost:3003`, Playwright | 1,315 responses, 61,353,954 bytes, 170 forbidden strings, **0 hits**, 0 `credit_*` requests | §C05 |
| Privilege forging: role patch, 2 forged sign-ups, 10 relocations with re-read, 7 forged inserts, 4 channel forgeries, 3 transport forgeries | `127.0.0.1:55421` | all refused; both sign-ups stored as `client` | §C06 |
| Storage scope: 6 guessed/mistyped keys × 5 callers, 5 bucket listings × 5 callers, metadata endpoint, 9 uploads, signature substitution | `127.0.0.1:55421` | all correctly refused | §C07 |
| Signed-URL reuse after revocation | `127.0.0.1:55521` (disposable) | **`200`, 2,726 bytes served anonymously after revocation** — Defect C-2 | §C07, Defect C-2 |
| Search under 4 sessions × 7 terms; the designer's skipped briefings query issued directly; notifications and exact counts across 10 families | `127.0.0.1:55421` | scope matches a plain read everywhere; a client finds 0 of another tenant's rows | §C09 |
| 23 cross-tenant parent combinations as the table owner + 5 through the API commands, in one rolled-back transaction | `supabase_db_dawes-studios` psql | every one refused by a named FK, CHECK or immutability trigger; 0 probe rows left | §C11 |
| 3 injection payloads through the product's own comment control; source sink audit; 1.45 MB bundle scan; `/api/invitations` × 6 | `localhost:3003` | escaped, nothing executed; no secret, no role selector; every non-agency request refused | §C12 |
| Dataset counts, 23 tables + `auth.users` + `storage.objects` | `supabase_db_dawes-studios`, after the pass | **10 clients / 25 projects / 12 campaigns / 30 briefings / 70 brand assets**; all other figures at baseline | §Dataset integrity |

## Remaining risks and next action

- **C07 stays open.** Closing Defect C-2 needs a product decision, not a patch to this evidence: either short, fixed TTLs on every `createSignedUrl` call site (the board's 3600 s is the outlier), or serving private bytes through an authorising route instead of a bare signature. `features/board/board-data.ts` and `features/projects/project-data.ts` are owned by a concurrent session and were not touched.
- **Defect C-1** is a Supabase default (`JWT_EXPIRY` 3600 with no session check at PostgREST). It needs an explicit decision — shorten the expiry, or have PostgREST validate `session_id` — rather than a code change in `apps/web`.
- The single cold-start realtime failure was not reproduced in eight subsequent runs and its assertion was not captured. If C09 is ever re-audited, run that test from a cold stack first and capture the diff.
- Three probe writes reached the canonical backend during the pass (one comment from the C01 token reproduction, three from the C12 injection test) and were all reversed by identifier; the dataset table in the evidence document is the proof.

## Ownership at handoff

All paths released. No background process was started and none is running: the Playwright spec and every scratch HTTP and SQL probe were deleted, and `apps/web/tests/e2e/` holds only the twelve files it held before. The `localhost:3003` container and both Supabase stacks were left exactly as found — not rebuilt, restarted or stopped. Recipient: the orchestrator.
