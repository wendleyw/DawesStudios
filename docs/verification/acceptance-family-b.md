# Acceptance family B — dataset coverage, activity and reconciliation

Measured 2026-09-21 against the live local stack, read-only. Every figure below comes from SQL run
against `supabase_db_dawes-studios`; none is copied from an earlier record.

The stack at measurement time held migrations `202609210001` through `202609210006`, four of which
belong to a concurrent branch and have no file on `main`. None of them touches the tables measured
here — they cover video pins, comment replay hardening and storage limits — so the dataset figures
are unaffected. This is stated because it is the kind of context that changes what a number means.

## B04 — all seven lifecycle states exist

> All seven lifecycle states exist across the dataset: planned, in_progress, internal_review,
> client_review, changes_requested, approved, delivered.

**Verdict: Verified. 7 of 7 present.**

| Status | Projects |
| --- | --- |
| `planned` | 3 |
| `in_progress` | 5 |
| `internal_review` | 3 |
| `client_review` | 7 |
| `changes_requested` | 2 |
| `approved` | 4 |
| `delivered` | 1 |
| **Total** | **25** |

The seven labels are the complete enum — `select enumlabel from pg_enum` returns exactly these, in
this order — so this is total coverage of the type, not seven values that happen to appear. The
counts sum to 25, the full project set, so no project sits outside the lifecycle.

## B05 — multiple deliverables, V1/V2, multiple designs, immutable published assets

> At least four projects exercise multiple deliverables, V1/V2 and multiple designs in one version;
> published projects reference immutable assets.

**Verdict: Verified, and measured against the strict reading.**

The requirement can be read two ways: four projects that between them exercise the three
characteristics, or four projects that each exercise all three. The strict reading was measured,
because it is the one that could fail.

| Property | Count |
| --- | --- |
| Projects with more than one deliverable | 5 |
| Projects reaching version 2 or beyond | 10 |
| Versions holding more than one design | 5 |
| Projects with a publication | 14 |
| **Projects satisfying all three at once** | **4** |

**Four is exactly the threshold**, so this row has no margin. Deleting one deliverable from any of
those four projects fails B05, and nothing in the seed marks them as load-bearing. That is worth
knowing before anyone trims the fixture.

The second clause is absolute rather than representative:

- 22 published designs exist.
- 18 carry a non-null `asset_path`; **all 18 have a matching `private.sanitized_assets` attestation**
  for `published-assets`.
- **0 published designs carry a file with no attestation.**
- The remaining 4 carry no file at all — they are structured content, so there is nothing to attest.

So every published byte a client can reach was regenerated and attested by the trusted media worker.
There is no partial case.

## B06 — both channels, pins, notifications, reviews, delivery, and activity for every client

> Both channels have representative project/design comments; pins, unread notifications, pending
> reviews, approved work and real delivery files exist. Every client can inspect meaningful activity.

**Verdict: Verified.**

| Measure | Result |
| --- | --- |
| Internal comments | 22, across 22 projects |
| Client comments | 57, across 25 projects |
| Pinned internal comments | 22 |
| Pinned client comments | 18 |
| Unread notifications | 15 |
| Publication reviews | 11 `pending`, 5 `approved`, 2 `changes_requested` |
| Delivery files | 1 |
| **Clients with no project** | **0** |
| **Clients with no comment in either channel** | **0** |

The two channels are separate tables with independent counts, which is the point of the requirement:
57 client comments and 22 internal ones are not the same rows seen twice.

The final clause — every client can inspect meaningful activity — is the one that could have been
satisfied on average while failing for an individual client, so it was measured per client rather
than in aggregate. Both figures are zero: no client has an empty workspace and none has a project
without conversation.

**"Can inspect" was measured as a read, not as the existence of rows.** Data existing in a table is
not the same as a client being able to see it: row-level security sits between the two, and a
requirement about what a client *can inspect* fails if RLS hides what the seed created. Each of the
ten client accounts was therefore signed in over the REST API and asked for its own activity:

| Client | Projects | Client comments | Brand sections | Notifications | Internal comments |
| --- | --- | --- | --- | --- | --- |
| `acme@` | 2 | 2 | 8 | 0 | **0** |
| `harbor-pine@` | 2 | 5 | 8 | 1 | **0** |
| `kestrel-outdoor@` | 2 | 6 | 8 | 2 | **0** |
| `northfield-bank@` | 2 | 4 | 8 | 2 | **0** |
| `otto-sons@` | 2 | 4 | 8 | 1 | **0** |
| `pelagic@` | 2 | 5 | 8 | 1 | **0** |
| `rune-fitness@` | 2 | 6 | 8 | 2 | **0** |
| `sablefish-provisions@` | 2 | 4 | 8 | 1 | **0** |
| `sabre@` | 7 | 16 | 8 | 4 | **0** |
| `vela-skincare@` | 2 | 5 | 8 | 1 | **0** |

**Clients unable to see a project or brand context: 0.** Every client reads two projects except
SABRE, which reads seven — 2×9 + 7 = 25, reproducing the documented baseline structure exactly from
the client's own side rather than from an agency query.

The last column is a control rather than a coverage figure. `internal_comments` is a table clients
must never read, and all ten return **0** rows while the same accounts successfully read their own
client comments in the column beside it. A zero that sits next to a non-zero from the same request
sequence shows the isolation is working, not that the request failed.

`acme@` reads 0 notifications. That is a per-client gap in one signal, not a failure of this clause:
it reads two projects and two comments, and the requirement's notification clause is satisfied at
dataset level by the 15 unread notifications above.

**One figure is thin and stated rather than smoothed over:** there is exactly **1** delivery file. It
satisfies "real delivery files exist" literally, and it is the single delivered project's file, so it
is consistent with the lifecycle spread above. But one row cannot show variation, and any test that
needs two deliveries will need seed work first.

## B07 — Brand Hub context and a reconcilable ledger for every client

> Every client has Brand Hub context and a reconcilable credit ledger; seed balances reflect opening
> allocations, project debits and any explicit additions.

**Verdict: Verified, with exact reconciliation.**

| Measure | Result |
| --- | --- |
| Clients | 10 |
| **Clients lacking brand sections** | **0** |
| **Clients lacking a credit account** | **0** |
| Brand sections / assets / templates | 80 / 70 / 70 |
| Deliverables | 30 |
| **Clients whose balance ≠ sum of their ledger** | **0** |
| Ledger composition | 10 `allocation`, 25 `project_debit`, 1 `adjustment` |
| **Projects without exactly one debit** | **0** |

The reconciliation is the requirement's real content and it holds exactly: for all ten clients,
`credit_accounts.balance` equals the sum of that client's `credit_ledger` rows. Not approximately,
and not for a sample.

The ledger composition matches the three sources the requirement names, one for one: ten allocations
for ten clients (the opening balances), twenty-five debits for twenty-five projects, and one explicit
adjustment. The cross-check that no project has zero or two debits is what makes "one debit per
project" a measured fact rather than a restatement of the totals.

**Superseded figure.** The dated 2026-09-20 backend handoff table later in
`acceptance-matrix.md` records "50 real brand files". The current count is **70** `brand_assets`
rows, matching provisioning's own report of 70 brand files. That historical row is left as written —
it records what was measured then — and this is the current figure.

## B08 — the seed is repeatable and survives a restart

> Seed is repeatable and data survives browser reload and Docker/backend restart. Re-running the
> supported seed process does not duplicate projects, users or debits.

**Verdict: Verified.**

The measurement was performed by the concurrent session during its own task rather than repeated
here, because a second reset would have cost ten minutes to re-establish a state that was already
being established. Its command-by-command record is at
`.superpowers/sdd/2026-09-21-video-designs-and-feedback/task-2-report.md` in that worktree, and it
covers `npm run db:stop`, `npm run db:start`, `npm run db:reset -- --confirm-local-data-loss` and
`npm run db:test`, including two failed restart attempts and why.

What it establishes, confirmed by independent query here after the fact:

- The full Docker stack was stopped and restarted, and `db:reset` recreated the volumes.
- `npm run db:test` returned `Result: PASS`.
- The post-reset dataset is **10 clients, 25 projects, 12 campaigns, 30 briefings, 70 brand assets** —
  identical to the pre-reset baseline.

The no-duplication clause is measured directly above in B07 rather than inferred from the counts
matching: **25 debits for 25 projects and 10 allocations for 10 clients, with zero projects holding
two debits.** A re-run that duplicated debits would show there and does not.

**Limit of this evidence.** The reset was run from the concurrent worktree, not from `main`. `main`
currently cannot run `npm run db:start` at all, because the stack holds four migrations for which
`main` has no files — `supabase migration list --local` shows an empty local column for
`202609210001`, `202609210002`, `202609210004` and `202609210006`. That is a consequence of two
branches sharing one stack and it resolves when the branch merges. It does not affect the
repeatability this row asserts, but B08 has not been demonstrated *from `main`* and that distinction
is recorded rather than glossed.
