# Acceptance family I — Reliability and production preparation

Measurement pass for the six open rows **I01, I02, I04, I05, I06, I07** of
[`docs/architecture/acceptance-matrix.md`](../architecture/acceptance-matrix.md). I03 and I08 were
already Verified against the backend evidence ledger and were not re-opened.

This is evidence, not repair: no application code, script, migration or existing test was changed
while producing it.

| Field | Value |
|---|---|
| Date | 2026-09-21 |
| Branch | `main` at `e6b4fe8` |
| Application under test | `http://localhost:3010`, `next start` serving the production build this pass made from `e6b4fe8`. The long-lived container on `:3003` was built from `6bc6228` and predates five commits under `apps/web`, so it was left running and not used for any behavioural measurement. Port 3010 is one of the three origins `local_stack.py` allowlists for the media service. |
| Backend | `supabase_db_dawes-studios` (local Docker stack), PostgREST on `127.0.0.1:55421` |
| Driver | A throwaway Playwright probe, `apps/web/tests/e2e/zz-evidence-probe-family-i.spec.ts`, run seven times as it was narrowed, deleted afterwards. Every browser measurement below is a line it printed with the `FI\|` prefix. |
| Accounts | `studio@dawes.local`, `designer@dawes.local`, `sabre@client.dawes.local` |
| Fixtures | `createProductionFixture` / `cleanupTestProject` (`tests/e2e/project-fixture.ts`) for every write-heavy case; two canonical rows (the SABRE client record, one SABRE assignment) were mutated and restored inside the test's own `finally` |
| Result | **One of the six Verified (I07).** Five stay open, each against a measured failure: [Defect I-1](#defect-i-1-npm-run-dbstart-always-exits-non-zero-on-the-documented-dataset) (I01), [Defect I-2](#defect-i-2-the-browser-suite-has-been-red-since-54645f1) (I02), [Defect I-3](#defect-i-3-a-raw-typeerror-failed-to-fetch-is-the-products-offline-message) (I04 and I05), [Defect I-4](#defect-i-4-an-interrupted-write-reports-failure-after-committing-and-a-retry-duplicates-it) (I05), [Defect I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save) (I06). |

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
`db:start` permanently failing.

### Reproduction

```sh
npm run db:artwork:photos        # once, ever
npm run db:start                 # exits 1, every time, for good
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

---

## Summary

| Row | Verdict | Why |
|---|---|---|
| I01 | Unverified | [I-1](#defect-i-1-npm-run-dbstart-always-exits-non-zero-on-the-documented-dataset): the documented start command exits 1 on every run |
| I02 | Unverified | [I-2](#defect-i-2-the-browser-suite-has-been-red-since-54645f1): 24/25 browser tests pass; checks, 444 unit tests and the build pass |
| I04 | Unverified | [I-3](#defect-i-3-a-raw-typeerror-failed-to-fetch-is-the-products-offline-message): the offline state of every form is a raw `TypeError` |
| I05 | Unverified | [I-4](#defect-i-4-an-interrupted-write-reports-failure-after-committing-and-a-retry-duplicates-it) and I-3 |
| I06 | Unverified | [I-5](#defect-i-5-a-stale-settings-form-silently-overwrites-a-newer-save): a stale client-settings form silently reverts a newer save |
| I07 | **Verified** | ≤ 700 ms everywhere on the full dataset, 0 long tasks, flat heap, 0 leaks over 30 client switches, clean role change |

I03 and I08 were not re-examined; they remain Verified against the backend evidence ledger. No
restore drill was run in this pass — `restore_drill.py` builds and tears down its own
`dawes-studios-restore-drill` project and never touches the source stack, but I03's evidence is
already recorded in [`../operations/restore-evidence.json`](../operations/restore-evidence.json) and
re-running it would have proved nothing this pass needed.
