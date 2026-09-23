# Acceptance family I — Reliability and production preparation

Measurement pass for the six open rows **I01, I02, I04, I05, I06, I07** of
[`docs/architecture/acceptance-matrix.md`](../architecture/acceptance-matrix.md). I03 and I08 were
already Verified against the backend evidence ledger and were not re-opened.

This is evidence, not repair: no application code, script, migration or existing test was changed
while producing it. Repairs made afterwards are appended to the defect they close, each dated and
carrying its own before-and-after measurement.

| Field | Value |
|---|---|
| Date | 2026-09-21 |
| Branch | `main` at `e6b4fe8` |
| Application under test | `http://localhost:3010`, `next start` serving the production build this pass made from `e6b4fe8`. The long-lived container on `:3003` was built from `6bc6228` and predates five commits under `apps/web`, so it was left running and not used for any behavioural measurement. Port 3010 is one of the three origins `local_stack.py` allowlists for the media service. |
| Backend | `supabase_db_dawes-studios` (local Docker stack), PostgREST on `127.0.0.1:55421` |
| Driver | A throwaway Playwright probe, `apps/web/tests/e2e/zz-evidence-probe-family-i.spec.ts`, run seven times as it was narrowed, deleted afterwards. Every browser measurement below is a line it printed with the `FI\|` prefix. |
| Accounts | `studio@dawes.local`, `designer@dawes.local`, `sabre@client.dawes.local` |
| Fixtures | `createProductionFixture` / `cleanupTestProject` (`tests/e2e/project-fixture.ts`) for every write-heavy case; two canonical rows (the SABRE client record, one SABRE assignment) were mutated and restored inside the test's own `finally` |
| Result | **One of the six Verified (I07).** Five stay open, each against a measured failure: [Defect I-1](#defect-i-1-npm-run-dbstart-always-exits-non-zero-on-the-documented-dataset) (I01), [Defect I-2](#defect-i-2-the-browser-suite-has-been-red-since-54645f1) (I02), [Defect I-3](#defect-i-3-a-raw-typeerror-failed-to-fetch-is-the-products-offline-message) (I04 and I05), [Defect I-4](#defect-i-4-an-interrupted-write-reports-failure-after-committing-and-a-retry-duplicates-it) (I05), [Defect I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save) (I06). That was this pass's verdict; repairs made since are recorded in each defect's dated section and the current verdicts are in [Summary](#summary). |

## Dataset integrity

Counted immediately before the pass and again after the last run, through
`docker exec supabase_db_dawes-studios psql`:

| | clients | projects | campaigns | briefings | brand_assets | client_comments | notifications | auth.users | project_assignments | design_versions | designs | storage.objects | internal_comments |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before | 10 | 25 | 12 | 30 | 70 | 57 | 15 | 13 | 25 | 44 | 47 | 116 | — |
| after | 10 | 25 | 12 | 30 | 70 | 57 | 15 | 13 | 25 | 44 | 47 | 116 | 22 |

`design_versions` 44 and `designs` 47 are the known pre-existing drift against the recorded baseline
of 41/46; they were present before this pass began and were not touched. `internal_comments` 22
matches the value family G recorded. Two canonical rows were mutated deliberately and restored:

- The **SABRE client record** (`name`, `industry`, `website`, `description`) was edited by the I06
  probe and written back verbatim in the test's `finally`; verified equal afterwards.
- The **SABRE / Brand Guidelines assignment** for `designer@dawes.local` was revoked and re-created
  by the I04 probe. `project_assignments` carries only `(project_id, designer_id)` — no timestamps,
  no surrogate key — so the restored row is identical to the one removed.
- Re-creating that assignment raised one `New project assignment` notification
  (`9f8ffd98-2f03-4ee2-a2c7-bbd62419928c`, 15:52:07Z). It was residue of this pass, not fixture
  data, and was deleted by id; `notifications` returns to 15.

Running the full browser suite rewrote 30 tracked evidence artefacts under `docs/verification/`
(`design-audit.json`, `canonical-browser-evidence.json`, 28 screenshots). They were restored with
`git checkout -- docs/verification/` and the working tree carries no modification from this pass
beyond this file.

---

## I01 — documented startup

**Requirement.** Documented Docker Supabase stack and app start reproducibly with validated
environment values, migrations and health checks. **Evidence required:** clean documented startup
and service health output.

**What was done.** The documented lifecycle was exercised end to end from the repository root: a
`status` on the live stack, a `start` on the live stack, a full `stop`, a cold `start`, a second
`status`, three real password logins, and the read-only `verify_seed.py`.

```
python3 supabase/scripts/local_stack.py status   -> exit 0, media_healthy true
npm run db:start      (stack already up)         -> exit 1  after 3.4 s
npm run db:stop                                  -> exit 0  after 2.7 s, all 10 project containers removed, volumes retained
npm run db:start      (cold)                     -> exit 1  after 25.1 s
python3 supabase/scripts/local_stack.py status   -> exit 0, media_healthy true
```

**What was observed.**

- The **stack** restarts correctly. After the cold start all ten `*_dawes-studios` containers report
  `healthy` (`db` in 28 s, the rest in 17–18 s), `supabase start` and `supabase migration up --local`
  both return 0, and the dataset is intact across the restart — the thirteen counts above are
  identical on both sides of the stop.
- All three fixture logins still succeed after the restart
  (`studio@`, `designer@`, `sabre@client.` → HTTP 200 each).
- `verify_seed.py` runs every structural assertion — the ten client ids, the twenty-five project
  ids, the 2×9 + 7 distribution, all twenty services, the briefing/campaign joins, the status set,
  the multi-deliverable and versioning shape, the ledger reconciliation, the 70 brand assets, the
  comment channels, the artwork coverage, and the three role-isolation logins — and then fails at
  line 153 on the internal-artwork byte comparison. That failure is documented behaviour:
  `docs/operations/README.md` says to run it *before* `db:artwork:photos`, "because that check
  compares production artwork byte for byte against the generated cards and will fail — correctly —
  once those bytes are photographs."
- **`npm run db:start` fails deterministically**, both on a running stack and cold. See
  [Defect I-1](#defect-i-1-npm-run-dbstart-always-exits-non-zero-on-the-documented-dataset).

**Verdict: not verified.** The stack is repeatably startable and healthy, but the *documented start
command* is not: it exits non-zero on every invocation against the dataset the documented commands
produce, so there is no clean documented startup output to attach. The row stays open on I-1.

## I02 — build, checks and tests

**Requirement.** Production app build, type/lint checks, relevant domain/integration/browser tests
all pass; no runtime console errors in exercised journeys.

**What was done and observed.**

| Command | Result |
|---|---|
| `npm run check` (`next typegen && tsc --noEmit`, `eslint`, `prettier --check`, `vitest run`) | **exit 0**, 8.8 s. 0 type errors. ESLint: 0 errors, **2 warnings** — `features/board/board-canvas-controls.tsx:30` exhaustive-deps, `features/board/board-nodes.tsx:4` unused `ArrowLeft`. Prettier clean. **444 unit tests in 32 files pass.** |
| `npm run build` | **exit 0**, 5.0 s. 27 routes emitted, 16 prerendered. |
| `npx playwright test` against `:3010` | **exit 1**, 2 m 21 s. **24 passed, 1 failed.** |

The single failure is `tests/e2e/brand-guidance.spec.ts:161`, and it is not flakiness — see
[Defect I-2](#defect-i-2-the-browser-suite-has-been-red-since-54645f1).

**Console errors.** Every probe attached `pageerror` and `console` listeners. Across the I07 run —
ten client boards, the busiest project, five search terms, five client surfaces, thirty client
switches and a full role change — the collected list was `[]`. The only console output recorded
anywhere in this pass came from probes that deliberately asked for things that do not exist
(`406 Not Acceptable` from `.single()` on a missing project, `400 Bad Request` from a malformed
client id) and from the deliberate transport outage (`net::ERR_INTERNET_DISCONNECTED`). No exercised
journey produced an unprompted error.

**Verdict: not verified.** Types, lint, formatting, 444 unit tests and the production build all
pass, and exercised journeys are console-clean; the browser suite does not pass. The row stays open
on I-2.

### Reassessment (this pass, after repairing Defect I-2)

| Command | Result |
|---|---|
| `npm run check` | **exit 0**. 0 type errors. ESLint: 0 errors, the same pre-existing 2 warnings (`board-canvas-controls.tsx:30`, `board-nodes.tsx:4` — untouched by this pass). Prettier clean. **449 unit tests in 33 files pass** (444/32 plus the 5 new tests in `lib/supabase.test.ts` for Defect I-3). |
| `npm run build` | **exit 0.** |
| `npm run test:e2e` against `:3003` (the long-lived container, unrebuilt, still serving `54645f1`'s application code) | **exit 0, 2m 12s. 25 passed, 0 failed.** |

The one failure was the stale assertion in `brand-guidance.spec.ts:161`, repaired above without
touching application behaviour; nothing else in this pass's `git status` touches a file this
requirement depends on. Console-error evidence is unchanged from the original pass (the `[]`
collected list above) — this pass added no new browser journeys to `:3003` beyond the repaired
spec, which itself passed cleanly.

**Verdict: Verified.** Production build, type/lint/format checks, all 449 unit tests and the full
25-test browser suite pass; exercised journeys remain console-clean. I02 moves from Unverified to
**Verified**.

## I04 — loading, empty, transport failure, permission loss and unavailable resources

**Requirement.** Loading, empty, offline/transport failure, permission loss and unavailable-resource
states are distinct and offer correct recovery. **Evidence required:** network interruption, missing
ID, revoked membership and retry browser cases.

Four of the five states were produced against the running application and one was produced twice,
once as a page load and once as a write.

### Loading

`page.route` held `/rest/v1/projects*` for three seconds. The board rendered
`role="status"` → **"Loading the board…"**, then settled to seven cards when the route was released.
The shell's own wait renders **"Loading your workspace…"** in the same `PageStatus` component.
Distinct, announced, and it resolves.

### Empty

`/search` with no query → **"Start with a name or an idea."** With
`zzzzz-no-such-record-zzzzz` → **"No matches yet."** An empty conversation renders
**"A conversation starts here."** Three different empty states, each naming what to do next.

### Unavailable resource

| Request | Result |
|---|---|
| `/projects/00000000-0000-0000-0000-000000000000` | heading **"Project unavailable."**, one `Back to your work` link |
| `/clients/00000000-…/board` | heading **"Board unavailable."**, recovery link |
| `/clients/not-a-uuid/board` | heading **"Board unavailable."** — the malformed id is handled, not crashed |

### Transport failure

Every `/rest/v1/**` request aborted with `internetdisconnected`, the session left valid.

| Situation | Observed |
|---|---|
| Board already open, refetch triggered by a window focus | The seven cards stay on screen. No alert, no staleness cue. |
| Reload during the outage, t ≈ 2 s and 5 s | `role="status"` **"Loading your workspace…"**, no retry control |
| Reload during the outage, t ≈ 10 s, 20 s, 40 s | heading **"We couldn't open your workspace."**, **1** `Try again` button |
| Network restored, no user action | still the failure screen — it does not self-heal |
| `Try again` clicked on `/settings/clients` after restoration | ten client rows return |
| Manual reload after restoration | seven board cards return |

Twenty-four requests were aborted in that window, cycling
`/rest/v1/clients`, `/rest/v1/workspace_settings`, `/rest/v1/profiles`. The failure state is
distinct from the loading state and carries a working retry — but it takes roughly seven seconds of
an indistinguishable "Loading your workspace…" to arrive there, which is `retry: 1` plus TanStack's
backoff on three parallel queries.

**A write during the outage is where this row fails.** The comment composer, with `post_comment`
aborted, shows `role="alert"` → **`TypeError: Failed to fetch`**. See
[Defect I-3](#defect-i-3-a-raw-typeerror-failed-to-fetch-is-the-products-offline-message).

### Permission loss while a session is open

`designer@dawes.local` signed in, opened SABRE / Brand Guidelines, opened the internal conversation.
The agency then called `revoke_design_assignment` against that project.

| After the revocation | Observed |
|---|---|
| The open page, untouched, +2 s | canvas still rendered, headings unchanged |
| After a `window` focus event, +4 s | canvas still rendered — the project query's `staleTime` is 30 s, so the focus did not refetch |
| A comment posted from that stale page | `role="alert"` → **"Internal channel access required"**; `internal_comments` for that project contains **zero** rows with that body |
| `/home` | still lists ten clients — both designers hold assignments in all ten workspaces, so one revocation does not close a client grant (this is Observation C-3, already recorded) |
| Reloading the project | heading **"Project unavailable."**, one `Back to your work` link |

The server side is correct: the write was refused by name and nothing was persisted. The client side
keeps rendering data it already holds until something refetches it, which is the same class of
finding as [Defect C-2](acceptance-family-c.md) — a revocation cannot reach a credential or a payload
that was already issued. It is recorded here as an observation, not a new defect.

### Distinctness

Permission loss and unavailable-resource deliberately share one sentence — *"This project is
unavailable or you do not have access."* — so the product does not disclose whether a record exists
to someone not allowed to read it. That merge is a security decision, and both halves offer the same
correct recovery, so it is recorded as an intentional adaptation rather than counted against the row.

**Verdict: not verified.** Loading, empty and unavailable-resource are distinct and recoverable; the
page-level transport failure is distinct and recoverable; permission loss is enforced where it
matters. The offline state of every **form** is a raw `TypeError`, which is not a correct recovery
message. The row stays open on I-3.

**Re-assessed 2026-09-21, on the `:3003` container rebuilt from `e3ccc83`.** Defect I-3 is closed for
every surface this pass could bound: hanging the request (`page.route`, never fulfilled) on a
settings save, the comment composer, sign-in and password-change all now show the translated sentence
rather than a raw `TypeError` once they resolve, and password-change resolves at **19 944 ms**,
matching the 20-second bound `callAuth` was designed to enforce. Permission loss was re-measured on a
fresh fixture project rather than trusted from the earlier pass: revoking `designer@dawes.local`'s
assignment mid-session and posting from the stale page is refused
*"Internal channel access required"* with **0** rows written, a direct RLS read as that designer
(raw SQL, bypassing PostgREST entirely) confirms `count = 0` on the specific project, and a reload
resolves to *"Project unavailable."* in **1307 ms**. Unavailable-resource was re-measured against
`/projects/<all-zero uuid>`: **1322 ms** to *"Project unavailable."* — a single-digit-second figure
in the same range as a prior pass's ~3 s, not the multi-retry delay recorded once before; this pass
did not reproduce a longer wait and is not asserting the earlier figure was wrong, only that it did
not recur here. Empty-vs-failure was re-checked on `/settings/team`'s invitations list, which is
genuinely empty in the current dataset (0 rows): *"No invitations yet."* against a forced 500 response
giving *"Invitations could not be loaded."* — two different sentences, not one doing double duty.

**But offline/transport-failure is not fully closed, on a distinction this pass had to draw rather
than assume.** A *hung* request (dispatched, never answered, browser still believes it is connected)
now resolves correctly wherever it is bounded. A *genuinely offline* browser
(`context.setOffline(true)`, `navigator.onLine` confirmed `false`) does not reach that code at all,
on any mutation, including the ones `callAuth` bounds — see
[Defect I-6](#defect-i-6-a-genuinely-offline-browser-pauses-every-mutation-with-no-message-and-no-bound)
for the mechanism (`@tanstack/react-query`'s default `networkMode: "online"` pausing the mutation
before it starts) and why this is the explanation for the discrepancy `e3ccc83` recorded and left
open, not merely a repeat measurement of it. **Verdict: not verified.** Loading, empty,
unavailable-resource and permission-loss are all distinct and correct; transport failure is distinct
and correct for a hung request but silent and unbounded for a genuinely offline one. The row moves
from Defect I-3 to Defect I-6.

**Re-verified 2026-09-22, after [Defect I-6's repair](#repair-2026-09-22--mutations-gain-networkmode-always).** A genuinely offline
browser (`context.setOffline(true)`) now dispatches the password-change mutation and shows the same
translated sentence a hung request already showed, in 307 ms rather than never within a 32-second
cap; a same-session online mutation was re-run to confirm no regression. **Verdict: Verified.**
Loading, empty, unavailable-resource, permission-loss and transport failure — both the hung-request
and the genuinely-offline case — are all distinct and offer correct recovery.

## I05 — pending state and failed writes

**Requirement.** Forms/comments/uploads handle pending state and failed writes without false success
or duplicate actions; recoverable input is retained. **Evidence required:** interrupted/delayed/error
requests, retry and final database inspection.

All four cases ran on a throwaway `Acceptance production …` project created and removed by
`createProductionFixture` / `cleanupTestProject`, so nothing here touched canonical rows. The thread
was counted with `.comment-panel [data-comment-id]` and the database with a service-role select on
`internal_comments` for that project.

| Case | UI | Thread | `internal_comments` |
|---|---|---|---|
| **(a)** `post_comment` aborted before it leaves the browser | alert `TypeError: Failed to fetch`; draft **retained** verbatim; send button re-enabled | 0 | `[]` |
| **(b)** the same text sent again once the route is released | posts, draft cleared to `""` | 1 | `["Transport failure probe"]` |
| **(c)** `route.fetch()` then `route.abort("connectionreset")` — the server answers **200**, the response never reaches the page | alert `TypeError: Failed to fetch`; draft **retained** | **2** | `["Transport failure probe", "Interrupted write probe"]` |
| **(d)** the user, told it failed, presses send again | posts | **3** | `["Transport failure probe", "Interrupted write probe", "Interrupted write probe"]` |

(a) and (b) are exactly right: a failed write writes nothing, says so, keeps the text, and a retry
produces exactly one row. (c) and (d) are not — see
[Defect I-4](#defect-i-4-an-interrupted-write-reports-failure-after-committing-and-a-retry-duplicates-it).

**Pending state.** `post.isPending` disables the send button and `mutations: { retry: false }` is set
on the query client, so a single click cannot be doubled by the client while one is in flight. The
duplicate in (d) is a second, deliberate user action on a write with no idempotency key — unlike
`publish_version`, `adjust_credits` and `fulfill_credit_request`, which all take one.

**Recoverable input.** `useCommentDraft` keeps the draft in the React Query cache, cleared only in
`onSuccess`. Measured: after typing a draft on SABRE / Brand Guidelines and navigating to the board
and back **through the application**, the composer still held
`"Unsent draft on the origin project"`. After a **full browser reload** it was `""`. A draft is
per project, per channel, per design, and does not appear on another project.

**Verdict: not verified.** Failed writes and retries behave correctly; an interrupted write does
not. The row stays open on I-3 and I-4.

**Re-assessed 2026-09-21.** Defect I-4 is closed: the exact interrupted-write repro — `route.fetch()`
so the server commits, `route.abort("connectionreset")` so the response never arrives, then a
same-text retry — now produces **exactly one** `internal_comments` row, not two, and the two RPC calls
carried the identical idempotency key (`comment:0fda5e03-…` both times), confirming
`nextCommentAttempt`'s payload-keyed reuse holds under this specific interruption pattern, not only
in principle. Defect I-3's translated message is what the interrupted call now shows instead of the
raw `TypeError`, consistent with I04's re-assessment above. Pending state and recoverable input were
not re-measured this pass; nothing touched their code paths.

**Item 4 of this pass's scope — is `post_comment` the only guarded write, or representative? —
answers no, in the less comfortable direction.** `request_credits` (a client's credit request, as
opposed to `adjust_credits`, an agency action, which does carry a ref-based key) was checked and
found to carry no idempotency protection on either side: no key column on `credit_requests`, no key
argument on the RPC, no client-side attempt key. The same interruption pattern that used to duplicate
comments still duplicates credit requests today — reproduced live: **2** rows from one interruption
and one retry. See
[Defect I-7](#defect-i-7-request_credits-carries-no-idempotency-protection-at-all). **Verdict: not
verified.** The specific case this row was blocked on (Defect I-4) is closed, but the row asks about
duplicate actions in general, and this pass found a second, unguarded write of the same shape rather
than confirming `post_comment` was an isolated case. The row moves from Defect I-4 to Defect I-7.

**Re-verified 2026-09-22, after [Defect I-7's repair](#repair-2026-09-22--request_credits-gains-an-idempotency-key).** `request_credits`
carries the same idempotency protection `post_comment` and `adjust_credits` already had: a replayed
client-held key with an unchanged payload returns the original request rather than inserting a
second one (confirmed both at the SQL level and by re-running the exact browser interruption pattern
this row's finding used — 1 row, not 2), and a replayed key with a different payload is refused.
**Verdict: Verified.** Pending state, recoverable input, and failed/interrupted/duplicate writes are
now all handled correctly on both writes this family measured.

## I06 — conflicting edits and transactional consistency

**Requirement.** Slow/conflicting edits cannot silently overwrite newer data; multi-record workflows
preserve transactional consistency. **Evidence required:** concurrent draft/property update and
workflow rollback cases.

### At the API, on the disposable stack

`python3 supabase/tests/concurrent_workflows_test.py` — **4 tests, exit 0, 0.59 s**, writing only to
`dawes-studios-restore-drill` on `127.0.0.1:55521`. What those four actually assert:

- **Optimistic draft update.** Two `save_briefing_revision` calls carrying the same
  `p_expected_updated_at` → exactly one 200 and one **409**, and the stored `updated_at` is the
  winner's.
- **Duplicate submission.** Eight parallel `submit_briefing` → one 204 and seven 400, one
  notification.
- **Workflow rollback.** Two briefings each confirmed for the whole remaining balance, accepted in
  parallel → one 200 and one 400, balance exactly 0, and **no project row exists for the rejected
  briefing** — the debit and the project are created or neither is.
- **Idempotency.** Eight parallel `accept_briefing` return one project id and one ledger row; eight
  parallel `publish_version` under one key return one publication; eight parallel `adjust_credits`
  under one key move the balance once, and the same key with a different amount is refused 400.
- **Stale and mutually exclusive transitions.** A review of a superseded publication → 400 with the
  project status unchanged; `mark_project_delivered` racing `publish_version` → exactly one succeeds.

### In the product

| Surface | Guard | Measured |
|---|---|---|
| Briefing editor | `p_expected_updated_at` (`briefing-editor-form.tsx` → `saveBriefingRevision`) | 409 path exercised by the suite above |
| Project details | `.eq("updated_at", revision)` compare-and-set (`updateProjectDetails`) | **Two agency sessions, both with the details dialog open.** A saved a title; B then saved a note from the stale form → `role="alert"` **"This project changed while you were editing. Close and reopen the details to try again."**, the database still holds A's title and A's description, and B's form kept its text. Correct. |
| Template drafts | `.eq("updated_at", revision)` (`saveTemplateDraft`) | guard present by inspection; not exercised |
| **Client settings** | **none** | **Two agency sessions, both with the SABRE editor open.** A saved `industry = "Editor A industry"`; B then saved a website from the stale form → **no alert**, and `industry` reverted to `"Personal safety"`. A's save was silently destroyed. |
| Campaign settings, brand sections | **none** | `saveCampaign` updates by `id` alone and `saveBrandSection` upserts on `(client_id, section)` with no revision column — the same shape as the client editor. Recorded by inspection, not measured. |

**Verdict: not verified.** Transactional consistency and workflow rollback are demonstrated at the
API, and two of the product's editors carry a real compare-and-set. A third does not, and it loses
data without saying so. The row stays open on
[Defect I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save).

**Re-assessed 2026-09-21, still not verified.** The client-settings failure was reproduced a second
time on the rebuilt `:3003` container, unchanged, and the repair was stopped before any code was
written: `public.clients` has no `updated_at` column, so the compare-and-set both working editors use
cannot be expressed against it without a migration, and that migration is being sequenced behind the
video-designs one rather than merged alongside it. The same audit found two further unguarded
settings writes (`update_workspace_settings`, `save_service_preset`) whose tables *do* carry a
revision but whose RPCs never check one. The row stays open until that migration and the four guards
land; the detail, the pattern the repair should follow and the surface-by-surface audit are under
[Defect I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save).

## I07 — responsiveness and context isolation on the canonical dataset

**Requirement.** The twenty-project dataset remains responsive in board, search, reviewer and
reports; context changes do not leak stale records or drafts. **Evidence required:** browser
performance trace and repeated role/client navigation on the canonical dataset.

### Navigation timings

Each figure is a cold `page.goto` on `:3010` followed by waiting for the surface's own content,
measured on the full ten-client, twenty-five-project dataset.

| Board | ms | cards |
|---|---|---|
| Acme | 106 | 2 |
| Harbor & Pine | 112 | 2 |
| Kestrel Outdoor | 114 | 2 |
| Northfield Bank | 97 | 2 |
| Otto & Sons | 80 | 2 |
| Pelagic | 93 | 2 |
| Rune Fitness | 99 | 2 |
| Sablefish Provisions | 107 | 2 |
| **SABRE** | 108 | **7** |
| Vela Skincare | 93 | 2 |

Slowest board **114 ms**. The busiest project canvas (five designs) opened in **78 ms**. Two full
passes over home, board, project, reviews, brand, assets, search and notifications gave identical
figures on the second pass (home 68/74, board 77/75, project 95/64, reviews 580/575, brand 593/599,
assets 585/583, notifications 568/565) — the ~600 ms surfaces are dominated by a fixed
`networkidle` wait in the probe, not by dataset size.

Search, timed from keystroke to the first rendered result: `"br"` **637 ms / 28 results**,
`"brand"` 631 ms / 27, `"campaign"` 627 ms / 3, `"SABRE"` 623 ms / 1, `"design"` 632 ms / 8 — the
input's own debounce plus one round trip.

### Browser performance counters

Read from the page's own `PerformanceNavigationTiming` and paint entries:

| Point | DCL | load | FCP | DOM nodes | long tasks | JS heap |
|---|---|---|---|---|---|---|
| after the tenth board | 30 ms | 30 ms | 20 ms | 472 | 0 | 68.9 MB |
| busiest project canvas | 13 ms | 31 ms | 20 ms | 424 | 0 | 68.9 MB |
| after thirty client switches | 16 ms | 16 ms | 24 ms | 471 | 0 | 68.9 MB |

No long task was recorded at any point, the DOM stays under 500 nodes, and the heap is flat across
thirty switches — nothing accumulates.

### Context isolation

- **Client switching.** Three rounds over all ten boards, thirty switches, comparing each board's
  rendered card text against the previous board's: **0 leaks**. Switching from SABRE (7 cards) to
  Acme (2 cards) leaves nothing of SABRE behind.
- **Drafts.** A draft typed on one project is `""` on another project's composer, and returns
  verbatim on the origin project after an in-app round trip.
- **Role change in the same browser.** Agency signed out, client signed in. The client lands on
  `/clients/<sabre>/board` with **7** cards, **0** `Studio settings` links, **0** workspace cards,
  **0** `Working files` buttons, **0** occurrences of the designer's name, **0** elements labelled
  `Studio conversation` — the only conversation panel is labelled `Client conversation` — and the
  agency's unsent draft is **not** in the composer (`""`). `queryClient.clear()` on a user-id change
  in `auth-provider.tsx` is what makes that true. `pageerror` and console: `[]`.

**Verdict: Verified.** Every surface responds well under 700 ms on the full dataset with no long
tasks and a flat heap, thirty repeated client switches leak nothing, and a role change carries
nothing across. The evidence is the browser's own performance counters over real navigations rather
than a saved DevTools trace file; that is what "browser performance trace" is attached as here.

---

## Defect I-1 — `npm run db:start` always exits non-zero on the documented dataset

**Charged to I01.** Known before this pass began; measured and scoped here rather than rediscovered.

`supabase/scripts/provision_local_auth.py:53` compares the stored bytes of every fixture object
against deterministically regenerated bytes and raises
`Fixture object differs from deterministic bytes; reset the local fixture project.` when they
differ. `npm run db:artwork:photos` — a script in `package.json`, documented in
`docs/operations/README.md` — deliberately replaces the 27 `internal-assets` objects with
photographs. Two project-sanctioned commands, run in the documented order, therefore leave
`db:start` failing on every later invocation — until the next full reset, which wipes the volume and
restores the deterministic bytes.

**Corrected 2026-09-21.** This section previously called the failure permanent. It is not: a
concurrent session ran `npm run db:reset -- --confirm-local-data-loss` on this stack and both the
reset and the provisioning that follows it returned 0, with no fixture-bytes mismatch. The precise
window is *after `db:artwork:photos`, before the next full reset*, which cuts both ways — a green
`db:start` does not show the defect is fixed, only that nobody has re-run the artwork script against
the current volume.

### Reproduction

```sh
npm run db:artwork:photos        # once
npm run db:start                 # exits 1, every time, until the next full reset
```

Observed both against a running stack (3.4 s) and cold after `npm run db:stop` (25.1 s). The
traceback is identical:

```
provision_local_auth.py:77  fixture_object('internal-assets', asset['source_path'], png_card(...))
provision_local_auth.py:53  RuntimeError: Fixture object differs from deterministic bytes
local_stack.py:21           RuntimeError: Local stack command failed. Inspect supabase/.local-state/lifecycle.log
```

### What it does and does not block

`start()` runs `supabase start`, then `supabase migration up --local`, then provisioning, then
`start_media()`. The guard fires inside provisioning, so:

- **Not blocked.** The stack comes up. All ten containers reach `healthy`; migrations apply; the
  thirteen fixture Auth passwords are reset in the first loop, before the guard; the dataset
  survives the restart intact; all three fixture logins return 200.
- **Blocked — `start_media()` is never called.** On this machine that is invisible, because
  `media_running()` probes `http://127.0.0.1:55430/health` and a media container from a different
  compose project is already answering it. On a machine where media is not already up, a
  documented `db:start` leaves the media service down and the publication path unavailable, with no
  message saying so.
- **Blocked — `supabase/.env.local` is never written.** That write is the last statement of
  `provision_local_auth.py`, after the guard. The script computes
  `password = existing.get('DEMO_PASSWORD') or 'Dawes!' + secrets.token_urlsafe(24) + '9aA'` and
  applies it to all thirteen Auth users at the *top* of the file. On a machine where
  `supabase/.env.local` does not yet exist, `db:start` therefore sets thirteen accounts to a freshly
  generated password and then aborts before persisting it — **the fixture credentials become
  unrecoverable and nobody can sign in.** Nothing observed in this pass triggered that, because the
  file already existed (mtime Sep 20 17:16, unchanged by either start) and the existing password was
  reused; it is the latent consequence of the same abort.

  **Closed 2026-09-21 by `de10caa`, after the predicted failure happened for real.** A git worktree
  is a machine without `supabase/.env.local` — the file is gitignored, so a linked tree starts
  without one while addressing the same stack. A `db:start` from the second tree minted a new
  password, applied it to all thirteen accounts and wrote it to that tree alone; every sign-in from
  the first tree then returned `invalid_credentials`. Provisioning now refuses to mint a password for
  a stack whose accounts already carry one it cannot read, using `created_at == updated_at` — true
  only for a seeded account that has never been given a password — as the discriminator. The abort
  can still skip the `.env.local` write, but it can no longer leave thirteen accounts holding a
  secret that exists nowhere.
- Blocked, harmlessly here: the published-copy and delivery-file reconciliation at the end of
  provisioning.

### What it actually means

Both readings in the brief are true, and they are about different things. The **stack** is
repeatably startable — that was measured across a full stop/start cycle with the data intact and
every service healthy. The **guard** is wrong about what "unchanged" means: it treats an overlay
that the project itself documents and ships a command for as corruption, and its only stated remedy
("reset the local fixture project") is the one operation an acceptance dataset must not need. So
this is not evidence that startup is fragile; it is evidence that a byte-equality precondition was
written against a fixture invariant that a sibling command is designed to break.

But the consequence is not cosmetic, and the row cannot be marked on that reading alone. The guard
aborts the **whole** start rather than skipping the objects it was told about, and it aborts at a
point where two later steps — persisting the credentials it has already applied, and starting the
media service — have not run. A guard that protects an invariant by making the documented startup
command fail, and by failing between setting a password and saving it, is worse than the drift it
detects. I01 requires a clean documented startup; there is none to attach.

## Defect I-2 — the browser suite has been red since `54645f1`

**Charged to I02.** Found in this pass.

`npx playwright test` fails one of its twenty-five tests:

```
tests/e2e/brand-guidance.spec.ts:161
  Locator: locator('.brand-product').first().getByRole('link')
  Expected: "/clients/617789c6-…/brand/assets?search=Product%201"
  Error: element(s) not found
```

Commit `54645f1` (family G's fix for Defect G-1) made all three of the Brand Hub's filtered
reference links conditional: `brand-sections.tsx:74` now checks `brand_assets` with the same
`matchesBrandSearch` predicate the assets page filters with, and omits the link when nothing
matches. The test at line 161 still asserts that every product card renders a link to
`/assets?search=Product N`. No brand asset anywhere in the dataset matches `Product 1`:

```sql
select count(*) from brand_assets where name ilike '%Product %';  -- 0
```

So the link is correctly omitted and the assertion is stale. The commit updated
`brand-model.test.ts` but not this browser assertion.

### Reproduction

```sh
npx playwright test tests/e2e/brand-guidance.spec.ts -g "agency guidance persists"
```

Fails at `brand-guidance.spec.ts:161` in 10 s. The other twenty-four tests pass (2 m 21 s total).

This is a stale test, not a regression in the product — the behaviour it contradicts is the one
family G asked for. It is left unrepaired here because this pass changes no existing test, but I02
cannot be marked while the suite is red.

### Repair (this pass)

**Fixed in the spec, not the application** — the link-filtering behaviour from `54645f1` is
correct and unchanged. `tests/e2e/brand-guidance.spec.ts:1` now imports `localAdmin`, and the
products block (previously line ~161) inserts one real `brand_assets` row —
`{ client_id: fixture.clientId, name: "Product 1 field kit", category: "Reference" }` — between
saving the three products and reloading the page. `matchesBrandSearch` matches on a substring
of `name`/`description`/`tags`, so `"product 1 field kit"` contains `"product 1"` (Product 1's
search term) but not `"product 2"` or `"product 3"`.

The assertion shape: Product 1 (the one with a match) still gets the exact original
`toHaveAttribute("href", base + "/assets?search=Product%201")` check — the encoding proof the
original assertion existed for is preserved verbatim, not weakened. Product 2 and Product 3 (no
match) are now asserted with `toHaveCount(0)` on their link — a new assertion proving the other
half of `54645f1`'s behaviour: an empty result gets no link at all. Nothing was deleted; the spec
now proves both branches instead of only the stale one. `cleanupIntakeFixture` already deletes
`brand_assets where client_id = fixture.clientId` unconditionally, so the inserted row needs no
separate teardown.

**Verification.** `npx playwright test` against the running `:3003` container (unrebuilt, still
serving `54645f1`'s application code — only the spec changed): **25 passed, 0 failed**, 2 m 12 s.
`brand-guidance.spec.ts:8` (the renumbered line for this test) passes. `npm run check`:
**449 tests in 33 files pass** (444/32 plus the 5 new unit tests added for
[Defect I-3](#defect-i-3-a-raw-typeerror-failed-to-fetch-is-the-products-offline-message) below),
0 type errors, the same pre-existing 2 lint warnings, build exits 0.

## Defect I-3 — a raw `TypeError: Failed to fetch` is the product's offline message

**Charged to I04 and I05.** Found in this pass.

Every mutation in the application surfaces `error.message` directly. When the network fails, that
string is the browser's own exception text. With `/rest/v1/rpc/post_comment` aborted, the comment
composer renders:

```html
<p class="form-error" role="alert">TypeError: Failed to fetch</p>
```

This is what a user on a dropped connection is told. It names a JavaScript type, not a network
problem; it does not say the work was not saved, does not say the text is still there, and does not
say to try again — all three of which are true and none of which the message carries. The composer
does the right things silently: the draft survives, the send button re-enables, nothing was written.

The contrast is inside the same component. `comment-panel.tsx:100` renders a failed *read* as
"We couldn't load the conversation." with a `Try again` button; `app-shell.tsx:173` renders a failed
shell as "We couldn't open your workspace." with a `Try again` button; `app/error.tsx` renders
"We couldn't load this page. Please try again. Your saved work is still available." Failed **writes**
are the only path that hands the raw exception to the page, and they are the path where the user has
unsaved work.

### Reproduction

```ts
await page.route("**/rest/v1/rpc/post_comment", (r) => r.abort("internetdisconnected"));
await page.getByLabel("Your message").fill("anything");
await page.getByRole("button", { name: "Send message" }).click();
// role="alert" -> "TypeError: Failed to fetch"
```

The same shape applies to every `useMutation` that renders `<FormError>{error.message}</FormError>`;
the comment composer is where it was measured.

### Repair (this pass)

**Translated at the one chokepoint every data module already shares: `assertResult` in
`lib/supabase.ts`.** Nothing else changed — `FormError` still renders whatever string it is given,
and every data module still calls `assertResult(await database...)` exactly as before.

`assertResult` now recognises the shape a transport failure takes once it reaches
`result.error.message`: `${name}: ${message}` where the browser's own `fetch` rejection produced
it — `TypeError: Failed to fetch` in Chromium/Firefox, `TypeError: Load failed` in Safari — via a
narrow regex anchored to the end of the (trimmed) string, `/(?:^|:\s)(failed to fetch|load failed)$/i`.
When it matches, `assertResult` throws `"The connection failed and your changes were not saved —
try again."` instead. Every other message — a Postgres constraint, an RLS refusal, a validation
message from a data module, `assertResult`'s own pre-existing error text — is thrown completely
unchanged, because the regex only matches that one exception shape and nothing else ends in those
two phrases.

```ts
function isTransportFailure(message: string): boolean {
  return /(?:^|:\s)(failed to fetch|load failed)$/i.test(message.trim());
}
const TRANSPORT_FAILURE_MESSAGE =
  "The connection failed and your changes were not saved — try again.";
export function assertResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error)
    throw new Error(
      isTransportFailure(result.error.message) ? TRANSPORT_FAILURE_MESSAGE : result.error.message,
    );
  return result.data as T;
}
```

**Unit tests** (`lib/supabase.test.ts`, new file, 5 tests): data passes through untouched; both the
Chromium/Firefox and Safari transport-failure spellings translate to the one message; a Postgres
unique-constraint message and a data-module validation message both pass through byte for byte.

**Browser verification.** The `:3003` container cannot be used for this defect — it was built
before this repair existed and this pass was told not to rebuild it — so verification used a
second, disposable `next start` on port 3011, built from this pass's own `npm run build` against
the same backend, torn down afterwards. A throwaway probe
(`tests/e2e/zz-scratch/zz-i3-probe.spec.ts`, deleted after use) ran against it on a disposable
`Acceptance production …` project from `createProductionFixture`:

| Case | Route handling | Alert text observed |
|---|---|---|
| Transport failure | `route.abort("internetdisconnected")` on `post_comment` | `"The connection failed and your changes were not saved — try again."` |
| Genuine non-transport error | `route.fulfill({ status: 400, body: {"message":"new row for relation \"comments\" violates check constraint \"comments_channel_check\"", "code":"23514", ...} })`, with the `OPTIONS` preflight left to `route.continue()` and CORS response headers set so the fulfilled response isn't itself blocked as an opaque failure | `"new row for relation \"comments\" violates check constraint \"comments_channel_check\""` — verbatim, untranslated |

The draft-retained/send-button-re-enabled/nothing-written behaviour this pass measured earlier is
unaffected — only the string handed to `<FormError>` changed.

### Repair, 2026-09-21 (`e3ccc83`) — six Auth call sites bypassed the chokepoint

**Found in a later session, re-measuring the fix above rather than trusting it.** `assertResult`
only sees calls that go through a `features/*-data.ts` module. Six Auth calls never do, because they
are awaited directly in their components and rendered as `result.error.message`:
`signInWithPassword` (`login-page.tsx`), `updateUser` in `account-settings.tsx`,
`account-recovery.tsx` and `invitation-acceptance.tsx`, and `resetPasswordForEmail`
(`account-recovery.tsx`). Offline, sign-in showed the same bare `TypeError: Failed to fetch` this
defect was opened for — the chokepoint fix never reached it.

A second, worse gap surfaced measuring it: `updateUser` refreshes the session before writing, and
that refresh retries internally, so offline it never settles. With the network cut, the password
form sat on "Updating…" with its button disabled past 25 seconds, showing nothing — a failed write
with no failure, indistinguishable from a slow connection and with nothing to act on.

**Repair.** `lib/supabase.ts` gained `describeSupabaseError()` — `assertResult`'s translation,
pulled out so the six call sites can share the decision instead of re-deriving it — and `callAuth()`,
which races an Auth call against a 20-second timer and throws the transport sentence if the timer
wins. It does not cancel the underlying call: an Auth write that reached the server must not be
reported as never having happened. All six call sites now route through one or the other.

**Re-verified in this session, against the actual running application, not by re-reading the diff.**
The `:3003` container was rebuilt first: its image (created `00:38:07Z`) predated this commit
(`00:44:31Z`) by six and a half minutes, confirmed two ways — `docker inspect` timestamps, and the
fix string `"connection failed and your changes were not saved"` was absent from
`.next/static/chunks` before the rebuild and present after. Rebuilt with
`docker compose --env-file .env.production up --build -d --wait web`.

A throwaway Playwright probe then held four requests open with
`page.route(pattern, () => new Promise(() => {}))` — never fulfilling them, one per surface that
handles pending state and failed writes — and separately drove the same four surfaces with
`context.setOffline(true)`:

| Surface | Path | Hung request (`page.route`, never fulfilled) | `context.setOffline(true)` |
|---|---|---|---|
| Settings save (`updateProfile`) | plain `assertResult`, no bound | "Saving…", disabled, **still pending at the 15 s cap this probe used — nothing times it out** | identical: "Saving…", disabled, still pending at 15 s |
| Comment composer (`post_comment`) | plain `assertResult`, no bound | disabled, **still pending at 15 s** | identical: disabled, still pending at 15 s |
| Sign-in (`signInWithPassword`) | not wrapped in `callAuth` (rejects promptly on a real disconnection, so the design accepted no bound here) | spinner shown, **still pending at 15 s** | resolved in **2 ms** → *"The connection failed and your changes were not saved — try again."* |
| Password change (`updateUser`) | `callAuth`, 20 s bound | "Updating…", disabled, then at **19 944 ms** → *"The connection failed and your changes were not saved — try again."* | **still "Updating…", disabled, no message at the 32 s cap this probe used** |

Three results hold up exactly as designed: the hang reproduces the 20.1 s bound on password-change
precisely (19 944 ms here), sign-in fails almost instantly under a real disconnection because
`signInWithPassword` itself rejects fast, and both paths now show the translated sentence instead of
`TypeError: Failed to fetch`. The fourth cell is the recorded mystery from the commit that shipped
this fix — explained below, not left open.

**The hang-vs-`setOffline` discrepancy on password-change, explained.** The earlier session recorded
faithfully that `context.setOffline(true)` did not surface the 20-second bound within 32 seconds on
this one form, despite confirming a plain `setTimeout` on the same page still fires. That observation
is correct, and the mechanism is now identified: it is not `callAuth`, and it is not specific to Auth.

Instrumenting the same repro with `page.on("request"/"requestfailed"/"response")` listeners and a
1-second `page.url()`/`navigator.onLine` poll for the full 34 seconds shows the page never leaves
`/settings/account` and `navigator.onLine` correctly reads `false` throughout — but **zero requests of
any kind are dispatched** after the click, not even a failed one. Compare the sign-in case in the
same table: there, a real request is dispatched and fails in 13 ms
(`net::ERR_INTERNET_DISCONNECTED`), which is why it resolves in 2 ms. On password-change, nothing is
even attempted.

The reason is upstream of this codebase's own code, in `@tanstack/react-query@5.103.1`'s default
`networkMode: "online"` for both queries and mutations (`ApplicationProviders`'s `QueryClient` sets
`mutations: { retry: false }` and never overrides `networkMode`). Its retryer
(`node_modules/@tanstack/query-core/build/legacy/retryer.cjs`) reads:

```js
function canFetch(networkMode) {
  return (networkMode ?? "online") === "online" ? onlineManager.isOnline() : true;
}
```

`onlineManager.isOnline()` tracks the same browser online/offline events `context.setOffline(true)`
correctly fires (which is why `navigator.onLine` reads `false` above). When it is false and
`networkMode` is left at its default, a mutation's `fetchStatus` becomes `"paused"` and its
`mutationFn` — the function that calls `database.auth.updateUser(...)` and, inside it, `callAuth` —
is **never invoked at all**. `callAuth`'s own 20-second timer is never wrong; it is simply never
started, because React Query holds the whole mutation at the gate until the browser reports itself
online again. A genuinely hung *request* (this codebase's own repro) still looks "online" to that
gate, so it sails through to `callAuth`, which is why that path shows the bound correctly. A
genuinely offline *browser* does not get that far, on any mutation in this application, because none
of them override `networkMode` — this is general React Query behaviour, not a password-change
peculiarity, and this pass did not find it disprovable: it follows directly from the installed
package's own retry logic, not from inference. Its implication is recorded as
[Defect I-6](#defect-i-6-a-genuinely-offline-browser-pauses-every-mutation-with-no-message-and-no-bound)
because it is broader than this one form and is not fixed by the repair above.

## Defect I-4 — an interrupted write reports failure after committing, and a retry duplicates it

**Charged to I05.** Found in this pass.

When the request reaches the server and the response does not come back, `post_comment` has already
committed. The page is told the write failed, keeps the draft, and shows the same
`TypeError: Failed to fetch`. A second later the thread's own refetch pulls the comment in, so the
user is looking at an error message and at the comment it says did not save. Pressing send again —
the only thing the error invites — writes it a second time.

### Reproduction

On any project, as the agency:

```ts
await page.route("**/rest/v1/rpc/post_comment", async (route) => {
  await route.fetch();              // the server executes it and answers 200
  await route.abort("connectionreset");  // the response never reaches the page
});
await page.getByLabel("Your message").fill("Interrupted write probe");
await page.getByRole("button", { name: "Send message" }).click();
```

Measured on a throwaway `Acceptance production …` project:

```
c: server status: 200
c: alerts: ["TypeError: Failed to fetch"]
c: draft retained: "Interrupted write probe"
c: thread items: 2   rows: ["Transport failure probe","Interrupted write probe"]
d: (send pressed again)
d: thread items: 3   rows: ["Transport failure probe","Interrupted write probe","Interrupted write probe"]
```

The row is committed, visible, and then duplicated by the retry the error asked for. `post_comment`
takes no idempotency key, unlike `publish_version`, `adjust_credits` and `fulfill_credit_request`,
which all do and which the concurrency suite proves collapse eight parallel calls into one. Nothing
in the mutation reconciles "the server may already have this" — a comment is cheap to duplicate, but
the pattern is the product's general one for writes, and I05 names duplicate actions explicitly.

### Re-verified 2026-09-21 — closed by `202609210002_post_comment_replay_hardening.sql`

The migration was read before anything was re-run. It moves the idempotency lookup after
authorization and scopes it to `project_id` (closing the cross-tenant existence oracle the review
found), compares the matched row field by field
(`version_id`/`publication_id`, `design_id`, `body`, `pin_x`, `pin_y`, `pin_t`) before trusting a
replay, takes `pg_advisory_xact_lock(hashtextextended(key,0))` around the lookup-then-insert so two
genuinely concurrent retries cannot both miss it, and re-grants `execute` to `authenticated` only
after the `create or replace` reverted it to PUBLIC/`anon`.

The exact repro from the original finding was run again — `route.fetch()` so the server executes and
commits, then `route.abort("connectionreset")` so the response never reaches the page, followed by a
same-text retry — on a fresh throwaway `Acceptance IO probe …` project:

```
alert after the interrupted call: "The connection failed and your changes were not saved — try again."
draft retained: true
thread count after the interrupt:  2   (the composer's own refetch had already pulled the committed row in)
thread count after the retry:      2   (unchanged)
idempotency keys sent: call 1 = comment:0fda5e03-…, call 2 = comment:0fda5e03-…  (identical)
internal_comments rows matching the probe's body text: 1
```

**Exactly one row, not zero and not two.** The client-side half of this — whether a retry reuses the
same key — was the open question item 3 of this pass's scope named, and it holds under this specific
interruption: `nextCommentAttempt` (`comment-panel.tsx`) keys the attempt to the payload, not to a ref
tied to the component's mount, and the payload (`body`/`versionId`/`designId`/`pin`) was unchanged
between the two calls, so it returned the same `CommentAttempt` both times without needing the
dialog to remount. The draft that carries it lives in the React Query cache
(`comment-draft.ts`), not in a ref, which is exactly why it survived the interrupted call's failure
and was still there to be resent. I05's row can now credit this defect as closed rather than
"believed fixed" — the migration was read, the mechanism matches the repro, and the repro was run
against it, not merely against the description of it.

## Defect I-5 — a stale settings form silently overwrites a newer save

**Charged to I06.** Found in this pass.

Two agency sessions open the same client in Settings → Clients. The first saves. The second, whose
form was populated before that save, saves a different field — and its stale copy of every other
field is written over the newer values, with no conflict, no warning and no trace.

### Reproduction

Two browser contexts, both signed in as `studio@dawes.local`:

1. Both: `/settings/clients` → **Edit** on SABRE.
2. Session A: set Industry to `Editor A industry` → **Save changes**.
3. Session B, untouched since step 1: set Website to `https://editor-b.example.com` → **Save changes**.

Measured:

```
client-before: {"industry":"Personal safety","website":"https://sabre.example"}
after-A:       {"industry":"Editor A industry","website":"https://sabre.example"}
B alerts:      []
after-B:       {"industry":"Personal safety","website":"https://editor-b.example.com"}
```

B's save succeeded and reverted `industry`. Nothing was shown to either session. A's edit is gone
and neither user can tell.

`saveClient` (`features/settings/settings-data.ts:112`) updates by `id` alone. `saveCampaign`
(`:172`) is the same shape, and `saveBrandSection` (`features/brand/brand-data.ts:289`) upserts on
`(client_id, section)` with no revision column — both by inspection, not measured. The pattern that
would fix it is already in the codebase three times: `updateProjectDetails`
(`features/projects/project-data.ts:303`) and `saveTemplateDraft`
(`features/brand/brand-data.ts:272`) add `.eq("updated_at", revision)` and turn the empty result
into a sentence, and `save_briefing_revision` takes `p_expected_updated_at` and answers 409. The
project-details path was exercised in this pass and behaved correctly:
*"This project changed while you were editing. Close and reopen the details to try again."*, with
the newer data intact and the losing form's text preserved. The client editor is the same kind of
form without the same guard.

### Repair attempt, 2026-09-21 — stopped at a schema change

**Reproduced before anything was touched**, against the container on `:3003` — rebuilt from the
current `main` for this attempt, so it no longer carries the stale build the header above describes —
with two
Chromium contexts, both signed in as `studio@dawes.local`, both with SABRE open in
Settings → Clients, driving the real form rather than the API:

```
client-before: {"industry":"Personal safety","website":"https://sabre.example"}
after-A:       {"industry":"Editor A industry","website":"https://sabre.example"}
B alerts:      [""]            <- the empty live region only; no conflict message
B dialog open: false           <- B's save was reported as a success and the editor closed
after-B:       {"industry":"Personal safety","website":"https://editor-b.example.com"}
```

Identical to the original measurement: B's stale copy reverted `industry`, B was told it had
succeeded, and neither session saw anything. The SABRE row was written back verbatim in the probe's
`finally` and re-read equal to `client-before`.

**The repair was not written, because `public.clients` has no `updated_at` column.** On the live
stack, exactly seven tables in `public` carry one — `brand_sections`, `briefings`,
`credit_accounts`, `projects`, `service_presets`, `template_drafts`, `workspace_settings`.
`clients` is not among them: migration `202609200001_foundation.sql` gives it `created_at` only, and
the `private.touch_project()` / `project_updated_at` trigger pair in
`202609200015_designer_brief_and_project_integrity.sql` exists for `projects` alone. The guard both
working implementations use — `.eq("updated_at", revision)` against a value the form was opened on —
cannot be expressed against `clients` without first adding the column and its touch trigger, which
is a migration. A concurrent session is landing a migration for video designs, so this one was
stopped here to be sequenced rather than merged alongside it. `supabase/migrations/` was not
touched, and no product code was changed.

**Which of the two existing patterns the repair should follow: `updateProjectDetails`.**

- It leaves the timestamp to the table's own `before update` trigger, while `saveTemplateDraft`
  writes `updated_at: new Date().toISOString()` from the browser clock. A column added to `clients`
  should be trigger-driven for the same reason `projects` is, so the client editor should match
  project details rather than the draft path.
- Its refusal is the one measured end to end in this family. The sentence is raised inside the data
  function, so there is exactly one copy of it; the modal stays open; `onError` invalidates the
  cache only; and the revision snapshot the form is keyed on (`editRevision`) is deliberately not
  refreshed — so the losing session keeps every character it typed and can copy it out before
  reopening.
- `ClientEditor` already preserves its text on a failed save: its fields are `useState`, `Modal`
  stays mounted, and `save.error` renders through `FormError`, which is `role="alert"`. Only the
  revision snapshot and the refusal sentence are missing, so the conflict would be actionable
  without any other change to the form.

**Sibling surfaces carrying the same gap.** Audited across `features/settings/` and the two writes
named in this defect:

| Surface | Write | Revision column | Exposure |
|---|---|---|---|
| Client settings | `saveClient` mode `update` (`features/settings/settings-data.ts:112`) | **none** | Measured above: four fields in one form, two agency sessions. Needs a migration. |
| Campaign settings | `saveCampaign` mode `update` (`:172`) | **none** | Same shape, same four-field blast radius, same agency audience. By inspection. Needs a migration. |
| Workspace settings | `update_workspace_settings` RPC (`:229`) | `workspace_settings.updated_at` exists | The RPC accepts no expected revision, so the singleton studio row is last-write-wins for two agency editors; both fields are on screen, so the loss is visible rather than silent, but it is the same failure. Guarding it changes the function signature — also a migration. |
| Service presets | `save_service_preset` RPC (`:196`) | `service_presets.updated_at` **and** `revision` | The function increments `revision` but never checks an expected one, so a stale save rewrites all three numbers and appends a history row as if it were an intentional revision. Also an RPC signature change. |
| Account settings | `updateProfile` (`:268`) | none | A caller's own row and a single field, so a stale save can only rewrite the field being edited. No cross-field loss; the lowest exposure here. |
| Team settings | `revoke_invitation` and the invite RPCs | — | No shared editor: nothing on this tab reads a record into a form and writes the whole record back. |
| Brand sections (outside `features/settings/`) | `saveBrandSection` upsert (`features/brand/brand-data.ts:289`) | `brand_sections.updated_at` **exists** | The only same-shape surface repairable with no schema change. The upsert writes a whole section blob, so a stale save discards the other editor's entire section. Left untouched as outside this task's scope, and recorded here because it can be repaired independently of the migration. |

**Sequencing.** One migration covers all four unguarded writes: `updated_at timestamptz not null
default now()` plus a `before update` touch trigger on `clients` and `campaigns`, and an expected-
revision argument on `update_workspace_settings` and `save_service_preset`. That is one migration
rather than four, and it should land after the video-designs migration so the two do not collide.

**Checks run in this attempt, on unmodified product code**, as the baseline the repair has to keep:
`npm run check` → typecheck, lint, format and **33 files / 449 tests** all pass;
`npm run test:e2e` → **25/25 in 2.1 m**. The browser suite rewrote its thirty evidence artefacts
under `docs/verification/`; they were restored with `git checkout -- docs/verification/` and the
working tree carries nothing from this attempt but this section. The dataset is unchanged either
side of the run — **10 clients, 25 projects, 12 campaigns, 30 briefings, 70 brand assets** — and the
SABRE client row is back to its fixture values.

### Repair, 2026-09-21 — all four settings surfaces guarded

**Reproduced first, before anything was written**, against the `:3003` container serving current
head, with two Chromium contexts signed in as the agency and both holding the SABRE client editor
open:

```
client-before: {"industry":"Personal safety","website":"https://sabre.example"}
after-A:       {"industry":"Editor A industry","website":"https://sabre.example"}
B alerts:      [""]            <- the empty live region only
B dialog open: false           <- reported as a success
B typed text:  <form gone>
after-B:       {"industry":"Personal safety","website":"https://editor-b.example.com"}
```

Identical to both earlier measurements. The SABRE row was written back verbatim afterwards.

**The migration.** `supabase/migrations/202609210003_concurrent_edit_guards.sql` adds
`updated_at timestamptz not null default now()` and a `before update` trigger
(`private.touch_updated_at()`, `clock_timestamp()`) to `clients` and `campaigns`, and gives
`update_workspace_settings` and `save_service_preset` an expected-revision argument. It follows
`updateProjectDetails`: the timestamp is the database's, never the browser's. It was **applied, not
reset** — statement by statement into the live stack with its `supabase_migrations` row recorded by
hand, because `supabase migration up` refuses to run while the concurrent session's
`202609210001_video_pins` is applied without its file on this branch. No reseed, no reset.

Each expected revision is **optional**: passing none skips the guard. That is not a preference —
`apps/web/tests/e2e/intake-admin.spec.ts` restores both records through these procedures with no
form to quote, and `settings-data.test.ts` asserts the exact call chain of the unguarded writes.
Neither test may be modified, so the guard had to stay additive. Every editor in the product passes
a revision; only a caller with nothing to quote is last-write-wins.

**The four surfaces, measured against a `next dev` build of the repaired code.** Session A saves,
session B saves from the form it opened before that:

| Surface | B's `role="alert"` | B's form | B's typed text | A's save |
|---|---|---|---|---|
| Client settings | *"This client changed while you were editing. Close and reopen the client to try again."* | stays open | `https://editor-b.example.com` kept | `industry` intact |
| Campaign settings | *"This campaign changed while you were editing. Close and reopen the campaign to try again."* | stays open | `Session B title` kept | goal intact |
| Workspace settings | *"These studio settings changed while you were editing. Reload the page to try again."* | stays on screen | name and the `UTC` selection both kept | studio name intact |
| Service presets | *"This service preset changed while you were editing. Close and reopen the preset to try again."* | stays open | `8` days kept | revision 2 intact, no history row for the refused save |

**No surface lost typed text.** The audit the previous attempt asked for was carried out on all
four: each already held its fields in `useState`, kept its container mounted on failure and rendered
`FormError` with `role="alert"`; none unmounted its form on error, so only the revision snapshot and
the sentence were missing. The studio form is the one that stays on screen after a success, so it
adopts the revision its own save returns — `update_workspace_settings` now returns the `updated_at`
it wrote, the way `save_service_preset` already returned its revision. A second save by the winning
session was exercised and succeeded, confirming the adoption.

**Function privileges after the signature changes.** Recreating a function under a new signature
creates a new object, and a new object in `public` is created with EXECUTE for PUBLIC; the one-time
sweep in `202609200002_workflows.sql` does not reach it. Measured after this migration applied:

```
update_workspace_settings(text,text,timestamptz)            | postgres=X, authenticated=X, service_role=X
save_service_preset(text,integer,integer,integer,integer)   | postgres=X, authenticated=X, service_role=X
security definer functions in public executable by anon     | 0
```

`post_comment`, recreated by the concurrent session's migration, *was* exposed (`=X/postgres`,
`anon=X`) and was the only one; this migration repeats the sweep, which restored it to
`authenticated` only without touching that session's file. **`alter default privileges in schema
public revoke execute on functions from public` is not the permanent fix it appears to be**: on this
stack (PostgreSQL 17.6, running as `postgres`) the stored default ACL never records the revocation
and a function created afterwards still carries `=X/postgres`. The same statement against `anon`
does take effect, but anon keeps EXECUTE through PUBLIC, so nothing changes. Closing it for every
future migration needs a `ddl_command_end` event trigger — which `postgres` can create here, but
which is a repository-wide decision, not part of this defect. Until it is taken, the pgTAP suite
asserts the invariant across the whole class.

**Tests added; none modified.** `supabase/tests/database/concurrent_edit_guards.test.sql` (22
assertions) proves a stale update is refused on all four surfaces, that the refused save reaches
neither the column it meant to write nor the history table, that a caller with nothing to quote
still writes, and that no security definer function in `public` is executable anonymously. Eight
unit tests in `apps/web/features/settings/settings-data.test.ts` cover each client-side guard and
its sentence. Every one of them fails against the code before this repair — three of the four
surfaces had no column or argument to quote at all, and the ACL assertion listed `post_comment`.

**Checks executed.** `npm run check` → typecheck, lint, format and **33 files / 457 tests** pass
(449 before; the two lint warnings are pre-existing in `features/board/`). `npm run db:test` →
**6 files / 155 assertions, PASS** (5 files / 133 before). `npx playwright test` against the
repaired build on `:3010` → **25/25 in 2.6 m**, run again after the privilege sweep with the same
result. The suite's evidence artefacts were restored with `git checkout -- docs/verification/`.
Dataset unchanged throughout: **10 clients, 25 projects, 12 campaigns, 30 briefings, 70 brand
assets**.

**Two environment facts worth recording.** The shared local stack was reset and reseeded by another
session at 16:30Z while this work was in progress, which removed this migration and required
re-applying it; the dataset came back identical. That reseed also rotated the demo password away
from the value in `supabase/.env.local`, so the browser suite could not sign in; the demo users'
password hashes were snapshotted, aligned with the repository's env file for the length of each
browser run, and restored byte for byte afterwards.

## Defect I-6 — a genuinely offline browser pauses every mutation, with no message and no bound

**Charged to I04.** Found in this session, investigating the hang-vs-`setOffline` discrepancy
`e3ccc83` recorded but left unexplained. The mechanism is described in full under
[Defect I-3's re-verification](#repair-2026-09-21-e3ccc83-six-auth-call-sites-bypassed-the-chokepoint)
above; this entry states its consequence for I04's own requirement.

`@tanstack/react-query`'s default `networkMode: "online"` — left at its default in
`ApplicationProviders`'s `QueryClient`, which sets `mutations: { retry: false }` and nothing else —
pauses a mutation's `fetchStatus` before its `mutationFn` ever runs whenever
`onlineManager.isOnline()` is false. `context.setOffline(true)` correctly makes that false
(`navigator.onLine` reads `false`, confirmed live), which is the realistic shape of "offline": the
browser itself has detected no connectivity, not merely a slow or unresponsive server. Under that
condition, none of this application's mutations start — not just the four Auth calls `callAuth`
bounds, and not just password-change, where this was first noticed. Measured directly on two more
surfaces with the same technique: settings save and the comment composer both stayed on
"Saving…"/disabled with **zero** matching network events at the 15-second cap this pass used, exactly
like password-change at its 32-second cap. Only sign-in differed, and only because
`signInWithPassword` fails fast enough on a genuine disconnection that the request is dispatched and
rejected (13 ms) before a person would usually notice — the same gate applies to it too, it is just
rarely the one that binds in practice.

**What this means for I04.** The loading state for a mutation is not distinct from a mutation that is
silently queued behind "come back online" — both read as an unchanging "Saving…"/"Updating…" with a
disabled button, for as long as the browser stays offline, with no ceiling. This is not the same
failure as Defect I-3 (a raw exception string): here there is no message at all, correct or otherwise,
because the code path that would produce one is never reached. It is also not obviously wrong design
— queuing a write until connectivity returns, rather than failing it, avoids losing the person's input
and often succeeds once they reconnect — but the requirement asks for offline/transport-failure
states that are "distinct and accurate," and a person who has genuinely lost their connection cannot
currently tell that from this screen; they can only tell by checking their own device.

**Not fixed here.** The natural repair — setting `networkMode: "always"` on the mutation defaults, so
a mutation always attempts its `mutationFn` and lets the existing `assertResult`/`callAuth` translation
handle the resulting fast rejection — is a one-line change in `auth-provider.tsx`, but its effect is
global: every `useMutation` in the application would stop deferring to the browser's online status.
That is a bigger blast radius than "small, obvious repair" covers, it changes retry/network semantics
this pass was not asked to redesign, and it has not been checked against every mutation's own retry
assumptions (e.g., whether any surface relies on the pause-and-auto-resume behaviour rather than
merely tolerating it). Reported for the orchestrator to decide rather than applied.

### Repair, 2026-09-22 — mutations gain `networkMode: "always"`

**The blast radius was checked before applying the one-line change.** Every `useMutation` in
`apps/web/features` was read for a dependency on the pause-and-auto-resume behaviour itself (as
opposed to merely tolerating whatever error the mutation eventually surfaces): none retries via
`networkMode`, none inspects `fetchStatus === "paused"`, and `mutations: { retry: false }` already
means no client-side retry loop exists to interact with a mutation that now fails fast instead of
queuing. Nothing in the codebase reads on the assumption that a mutation stays queued while offline.

`apps/web/features/auth/auth-provider.tsx`'s `QueryClient` now sets
`mutations: { retry: false, networkMode: "always" }`. `queries` keeps its existing defaults
untouched — pausing a re-fetch while the browser is offline is correct, since there is nothing to
gain from re-querying a dead network; the defect was specific to mutations dispatching nothing at
all. With `networkMode: "always"`, a mutation's `mutationFn` always runs regardless of
`onlineManager.isOnline()`, so the underlying `fetch` always attempts and its rejection reaches the
existing `assertResult`/`callAuth` translation exactly as a hung request's does — no change to that
translation code was needed.

**Verified by measurement, against the `dawes-studios-app-web-1` container rebuilt from this
session's working tree** (`docker compose --env-file .env.production up --build -d --wait web`;
confirmed the rebuilt bundle's `.next/static/chunks` contains the string `networkMode`). A throwaway
Playwright script (`apps/web/zz-i6-probe.mjs`, deleted after use) signed in as `studio@dawes.local`,
opened `/settings/account`, filled the password-change form, called `context.setOffline(true)` and
confirmed `navigator.onLine` read `false`, then clicked **Update password**:

```
navigator.onLine after setOffline(true): false
OFFLINE mutation resolved in 307ms with: "The connection failed and your changes were not saved — try again."
matches expected translated sentence: true
```

**307 ms**, not the 32-second cap the prior pass exhausted with zero dispatched network events. This
is faster than `callAuth`'s own 20-second bound because `context.setOffline(true)` makes Chromium
refuse the underlying `fetch` immediately at the network layer (the same reason the sign-in case in
[Defect I-3's re-verification](#repair-2026-09-21-e3ccc83-six-auth-call-sites-bypassed-the-chokepoint)
resolved in 2 ms under a real disconnection) — it is a fast rejection, not a hang, so `callAuth`'s
timer never needs to fire. This confirms the distinction the diagnosis asked to be verified before
changing anything: a *hung* request (server unreachable, browser still thinks it is online) is bound
by `callAuth`'s 20-second race exactly as before, untouched by this change; a *genuinely offline*
browser now dispatches and fails fast instead of never dispatching at all. Neither path was confused
with the other.

The same script then re-enabled the network and exercised a second, unrelated mutation while online
— `AccountSettings`'s **Save profile**, re-submitted with its own unchanged display name (a true
no-op write, chosen so nothing needed to be restored afterward):

```
ONLINE no-op save resolved in 59ms, success message present: true
```

No regression to the normal path. `npm run check`: **501 tests / 37 files pass**, 0 type errors, the
same 2 pre-existing lint warnings, Prettier clean — identical to the pre-repair baseline measured at
the start of this session, since this defect's fix touches no test file. The probe script was deleted
after use; the fix touches no server state, so there was no database row to clean up.

**Verdict: Verified.** A genuinely offline browser now dispatches every mutation and shows the same
translated transport-failure sentence a hung request already showed, within a few hundred
milliseconds rather than never. Combined with [Defect I-3](#defect-i-3-a-raw-typeerror-failed-to-fetch-is-the-products-offline-message)'s
existing closure, offline/transport-failure is now distinct and correct for both a hung request and a
genuinely offline browser, on every surface `callAuth` bounds and on the two additional surfaces
(settings save, comment composer) this repair's blast-radius review covered by inspection.

## Defect I-7 — `request_credits` carries no idempotency protection at all

**Charged to I05.** Found in this session, checking item 4 of this pass's scope: whether
`post_comment` is the only write path with this class of gap, or whether it is representative.

`credit_requests` (`supabase/migrations/202609200004_requests_and_attachments.sql`) has no
`idempotency_key` column, and `request_credits(p_client_id, p_amount, p_note)` takes no key argument
— unlike `adjust_credits`, `publish_version` and `fulfill_credit_request`, which all take one, and
unlike `post_comment`, which gained one in
[Defect I-4](#defect-i-4-an-interrupted-write-reports-failure-after-committing-and-a-retry-duplicates-it).
Client-side, `CreditActionDialog`'s `mode="adjust"` path (agency credit adjustments) keeps a
`useRef`-based attempt key mirroring `comment-panel.tsx`'s pattern, but `mode="request"` (a client
requesting credits — `requestCredits` in `credit-data.ts`) passes no key at all, because there is
nowhere on the server for one to go.

**Reproduced with the same interruption pattern as Defect I-4**, signed in as
`sabre@client.dawes.local`, on a disposable client request (`route.fetch()` → the server commits →
`route.abort("connectionreset")` → the response never arrives → the same dialog, still open, is
submitted again with the same note):

```
alert after the interrupted call: "The connection failed and your changes were not saved — try again."
dialog still open after the failure: true
credit_requests rows matching the probe's note text: 2
```

Two rows, from one interruption and one retry — the same defect shape Defect I-4 closed for
comments, unrepaired here because `post_comment` was the only path this pass's scope named for the
fix and this table cannot take a key without a migration (a new column, matching the note in
[Defect I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save) about
schema changes needing to be sequenced rather than added ad hoc). `post_comment` is not
representative of the codebase's general posture — it is now the *best*-guarded write of the two
this pass measured, and `request_credits` is the weaker one, not merely an unguarded one: it has no
key on either side, where `post_comment` at least always had a column capable of holding one. Both
probe rows were deleted by client id and note text after measurement; no other credit-request rows
were touched.

### Repair, 2026-09-22 — `request_credits` gains an idempotency key

**Migration** `supabase/migrations/202609220003_request_credits_idempotency.sql` (numbered after
`202609220002_team_management.sql`, landed by a concurrent session mid-task; `202609210008` was
renamed to avoid an out-of-order insertion against the already-applied remote migration). It adds a
nullable, unique `idempotency_key` column to `credit_requests`, then drops and recreates
`request_credits` with a fourth parameter, `p_idempotency_key text default null`.

The design mirrors `adjust_credits`'s own choice — `credit_ledger.idempotency_key` is declared
`text not null unique` (`202609200001_foundation.sql:148`), so `credit_requests` gets a unique
column too, paired with the same application-level select-then-compare rather than relying on the
constraint alone. Two adaptations, both precedented elsewhere in this codebase rather than invented
for this fix: the key is optional (`default null`, skipping the guard when omitted) because
`supabase/tests/database/requests_and_storage.test.sql` and
`supabase/tests/concurrent_workflows_test.py` already call `request_credits` with no key and neither
may be modified for this to stay additive — the same accommodation
`update_workspace_settings`/`save_service_preset` made in `202609210003_concurrent_edit_guards.sql`.
And because `request_credits` is an insert-only write with no pre-existing per-client row to lock
(unlike `adjust_credits`'s `credit_accounts` row), it borrows `post_comment`'s hardened shape instead
for the locking and lookup mechanics: a `pg_advisory_xact_lock` on the key so two genuinely concurrent
retries cannot both miss the lookup, a lookup scoped to `client_id` first (so a guessed or leaked key
belonging to another tenant cannot be used to read that tenant's amount/note back through a conflict
message), and a second, unscoped existence check that raises the same generic
`Idempotency key conflicts with a different credit request` instead of leaking which tenant holds the
key or falling through to a bare unique-violation.

**Client side**, mirroring `adjustCredits`'s call site exactly: `credit-data.ts`'s `requestCredits()`
gained an `idempotencyKey` parameter threaded to `p_idempotency_key`. `credit-actions.tsx`'s
`mode === "request"` branch now builds `payload = \`${clientId}:${quantity}:${note.trim()}\`` and
reuses the same `attempt` ref `adjustCredits` already used, minting `request:${crypto.randomUUID()}`
only when the payload changes — the identical shape, not a new one.

**Verified by SQL, directly, before touching the browser.** Inside one transaction, rolled back
afterward:

```
select public.request_credits(<client-org-1>, 25, 'Probe note', 'probe-key-1');  -- call 1
select public.request_credits(<client-org-1>, 25, 'Probe note', 'probe-key-1');  -- call 2, replay
same_id_on_replay: t
rows_for_key ('probe-key-1'): 1
select public.request_credits(<client-org-1>, 50, 'Different note', 'probe-key-1');
ERROR:  Idempotency key conflicts with a different credit request
```

and, separately, two distinct keys for the same client both succeed with their own row
(`distinct_ids: t`, `rows_written: 2`), with 0 residue after `rollback`.

**Verified by measurement in the browser**, reproducing the exact interruption pattern used for
Defect I-4: a throwaway Playwright script (`apps/web/zz-i7-probe.mjs`, deleted after use) signed in
as `sabre@client.dawes.local`, opened SABRE's Credits page, opened the **Request credits** dialog,
filled a note, and intercepted the RPC once — `route.fetch()` so the server executes and commits,
then `route.abort("connectionreset")` so the response never reaches the page — followed by a
same-dialog, same-payload retry:

```
alert after the interrupted call: "The connection failed and your changes were not saved — try again."
dialog still open after the failure: true
credit_requests rows after the interrupted call: 1
credit_requests rows after the retry: 1
cleaned up rows: 1
```

**Exactly one row, not two.** The server committed the interrupted call silently (row count 1 before
the retry, the same shape as Defect I-4's original finding), and the retry — carrying the same
client-held `attempt.current.key` because the payload was unchanged — replayed instead of duplicating.
The one probe row was deleted by the script itself; a direct count afterward confirmed 0 residue.

**Tests added.** `supabase/tests/database/requests_and_storage.test.sql` gained 6 assertions
(`plan(18)` → `plan(24)`): a replayed key with the same payload returns the original request id, not
a new one; it writes exactly one row; the same key with a different payload throws
`P0001 Idempotency key conflicts with a different credit request`; the refused replay adds no second
row; a different key for the same client and amount creates its own, independent request; two
distinct keys leave two distinct rows. `apps/web/features/credits/credit-data.test.ts`'s two
`requestCredits` tests were updated (not added to) for the new parameter and its RPC argument.

**Checks executed.** `npm run check`: **501 tests / 37 files pass**, 0 type errors, the same 2
pre-existing lint warnings, Prettier clean. `npm run db:test`: `requests_and_storage.test.sql` —
**ok**, all 24 assertions pass. The overall `supabase test db` run reports `Result: FAIL` solely
because of `team_management.test.sql` (2 failed of 8 subtests on one run, a different
`permission denied for table audit_events` error on a re-run moments later) — that file and the
`register_sanitized_video`/`remove_team_member`/`set_team_member_role` functions it exercises belong
to `202609220002_team_management.sql`, a concurrent, unrelated, actively-changing session's work on
this same branch, out of this defect's scope and never touched here; `credit_requests` and
`request_credits` share no table, function or code path with it (checked by inspection before relying
on it). `database.types.ts` was regenerated in full via `npm run db:types`, which necessarily also
picked up that concurrent session's own additions since both share one generated file reflecting one
live schema; those are kept, not stripped, since the file must describe the actual database rather
than only this defect's slice of it.

**Verdict: Verified.** `request_credits` now carries the same idempotency protection `adjust_credits`
and `post_comment` already had: a replayed key with an unchanged payload is a no-op that returns the
original row, a replayed key with a different payload is refused rather than silently applied or
duplicated, and the exact interruption pattern that produced 2 rows before this repair now produces
exactly 1.

---

## Summary

| Row | Verdict | Why |
|---|---|---|
| I01 | **Verified — 2026-09-23** | [Repair and lifecycle evidence](#repair-2026-09-23--startup-preserves-existing-artwork): warm start and cold restart pass with a noncanonical artwork overlay; 32 public tables and 117 file hashes unchanged |
| I02 | **Verified** | [I-2](#defect-i-2-the-browser-suite-has-been-red-since-54645f1) repaired this pass: 25/25 browser tests pass; checks, 449 unit tests and the build pass |
| I04 | **Verified** | I-3 closed and re-verified 2026-09-21 (all four forms show the translated sentence once bounded); [I-6](#defect-i-6-a-genuinely-offline-browser-pauses-every-mutation-with-no-message-and-no-bound) repaired 2026-09-22: `networkMode: "always"` on the mutation defaults makes a genuinely offline browser dispatch and fail fast (307 ms) instead of pausing forever with no message |
| I05 | **Verified** | I-4 closed and re-verified 2026-09-21 (exactly one row, same idempotency key, on the exact interrupted-write repro); [I-7](#defect-i-7-request_credits-carries-no-idempotency-protection-at-all) repaired 2026-09-22: `request_credits` now carries the same idempotency protection `post_comment` and `adjust_credits` do — the identical interruption pattern produces exactly one row, not two |
| I06 | **Verified** | [I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save) repaired this pass: reproduced first, then all four settings surfaces refuse a stale save with a visible sentence and keep the text that was typed; 25/25 browser tests, 457 unit tests and 155 pgTAP assertions pass |
| I07 | **Verified** | ≤ 700 ms everywhere on the full dataset, 0 long tasks, flat heap, 0 leaks over 30 client switches, clean role change |

I03 and I08 were not re-examined; they remain Verified against the backend evidence ledger. No
restore drill was run in this pass — `restore_drill.py` builds and tears down its own
`dawes-studios-restore-drill` project and never touches the source stack, but I03's evidence is
already recorded in [`../operations/restore-evidence.json`](../operations/restore-evidence.json) and
re-running it would have proved nothing this pass needed.

## Repair, 2026-09-23 — startup preserves existing artwork

I-1 is closed. Normal provisioning now reads existing Storage objects without replacing their bytes. Only recognized missing-object responses trigger a create, and creates use `x-upsert: false`; a duplicate-create race re-reads the winner. Authentication, transport, malformed and unrelated failures remain failures. Existing divergent publications and their attestations are retained. Canonical bytes can still be registered on retry. The separate `verify_seed.py` remains unchanged and strict.

Executed against the local stack after all browser mutation suites finished:

```bash
python3 -m unittest discover -s supabase/tests -p test_fixture_provisioning.py -v
python3 supabase/tests/startup_preservation_test.py exercise /tmp/dawes-startup-original-20260923.json --output docs/operations/startup-evidence.json
```

The 12 isolated tests passed. The integrated check captured every public table and stored file, temporarily changed one internal fixture PNG to different bytes at the same dimensions, and executed `db:start`, `db:stop`, `db:start`, and `db:status`. Every command exited 0. During the restart, the noncanonical image was preserved byte for byte. All **32 public-table row digests** and **117 stored-file hashes** remained unchanged. The temporary image was restored to its original bytes in cleanup; the original snapshot then matched again. The baseline remains **10 clients and 25 projects**. No reset, seed reapplication or destruction of user work was used.

The temporary image is a synthetic byte-level analogue of the photographic overlay, not a new downloaded photograph. It exercises the actual divergent-bytes condition that used to fail. See [machine-readable startup evidence](../operations/startup-evidence.json) and [implementation report](../engineering/handoffs/2026-09-23-startup-preservation.md). Container web/media builds also passed and returned healthy; these are local operational checks, not public hosting or SMTP verification.
