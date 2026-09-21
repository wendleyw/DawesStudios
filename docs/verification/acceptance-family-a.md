# Acceptance family A — process, module boundaries and orchestration

Measured 2026-09-21 against `main` at `b5fd80f`. This pass covers **A01, A02 and A05**. A03 and A04
are measured separately in [`acceptance-a03-a04.md`](./acceptance-a03-a04.md); no row here depends on
them.

Every number below comes from a command run against the repository as it stands, not from reading
the guidance that describes it. Where a requirement has two clauses, both are measured.

## A01 — delegated agents report to the orchestrator, with no duplicated ownership

> Working agents report scope, decisions, files changed, tests, blockers, and unresolved risks to the
> orchestrator; no competing architecture or duplicated ownership.

**Verdict: Verified.**

`docs/engineering/handoffs/` holds **31 reports** plus the template in its `README.md`. The template
requires five sections: completed work and changed files, decisions and interface changes, checks
actually executed, remaining risks and next action, and ownership at handoff.

| Measure | Result |
| --- | --- |
| Reports present | 31 |
| Carrying all five template headings verbatim | 27 |
| Naming the files they changed | **31 / 31** |
| Recording a check with its actual result, not just its name | **31 / 31** |
| Declaring ownership at handoff | **31 / 31** |

The four reports that do not carry the headings verbatim carry the same information under equivalent
ones — `refactor-settings` and `refactor-small-features` use `Decisions` rather than
`Decisions and interface changes`; `audit-fixes-duplication` uses `Findings — one row each` with a
`Changed files` subsection; `audit-fixes-minimalism` uses `One row per finding` and
`Next required action`. The requirement is that the information reaches the orchestrator, not that a
heading matches a string, so these are recorded as deviations in form rather than failures.

The second clause — no duplicated ownership — is evidenced by the ownership sections themselves:
all 31 name the paths held and state their release. They are explicit about process as well as
files; two representative closings are *"All paths released. No background process was started and
none is running"* and *"No process was left running: the `next dev --port 3021` server used for
verification was stopped"*. No two reports claim the same path without the earlier one releasing it
first.

**Limit of this evidence.** It measures what the reports say, which is the requirement as written.
It does not independently re-derive that each report's file list is complete against its own commits.

## A02 — domain modules are separated and shared primitives have real consumers

> Domain modules separate identity, clients, briefings, production, publication/comments, brand,
> credits, and administration; shared primitives have real consumers.

**Verdict: Verified.**

`apps/web/features/` holds twelve modules, and every domain the requirement names has one:

| Domain named in the requirement | Module |
| --- | --- |
| identity | `auth` |
| clients | `workspace`, `campaigns` |
| briefings | `briefings` |
| production | `projects`, `board`, `assets` |
| publication / comments | `reviews` |
| brand | `brand` |
| credits | `credits` |
| administration | `settings` |

The twelfth, `shared`, is the primitive layer rather than a domain.

The second clause is the one that can rot silently, because a primitive keeps compiling long after
its second consumer disappears. `apps/web/features/shared/README.md` and `CLAUDE.md` both require two
or more real consumers today. Counting importers outside `features/shared/` itself:

| Primitive | Consumers |
| --- | --- |
| `form-error.tsx` | 27 |
| `modal.tsx` | 17 |
| `page-status.tsx` | 13 |
| `status-tone.ts` | 10 |
| `upload-rules.ts` | 7 |
| `search-field.tsx` | 6 |
| `save-blob.ts` | 4 |
| `copy-button.tsx` | 3 |
| `canvas-fit.ts` | 2 |
| `version-row.ts` | 2 |

**The floor is 2 and nothing sits below it.** The two at the floor, `canvas-fit.ts` and
`version-row.ts`, are the ones to re-measure if a consumer is ever deleted: each is one removal away
from being a shared module with a single caller, which the boundary forbids.

## A05 — the orchestrator integrates, adjudicates, and records what is unresolved honestly

> Orchestrator combines specialist changes, verifies interfaces, resolves conflicting decisions, and
> records unresolved acceptance items honestly.

**Verdict: Verified — after the clause that was failing was closed, and after correcting this
section's own overstatement.**

**The original finding was right in kind and wrong by one.** It counted 11 rows carrying a bare
`Unverified`. It was 10. H11 was miscounted: the check read each row's *status* cell, while H11
states its remaining gap in the *evidence* cell — "Help dialog and production preview/reset exposure
still need the orchestrator's final read-only walkthrough." A measurement that reads one column and
concludes about the row is the same class of error this pass was created to find, so it is recorded
here rather than corrected silently.

What follows is the finding as it stood, then what closed it.

The first three clauses are evidenced. Integration and interface verification are recorded throughout
`docs/engineering/handoff.md`, and adjudication of conflicting decisions is recorded rather than
silently resolved — J03-5 is the clearest instance, a finding *reviewed and rejected, not fixed*,
with the reasoning preserved in the matrix row instead of the finding quietly disappearing.

The fourth clause does not hold today. Of the **16 rows still `Unverified`, only 5 say why** — the
five charged to a named defect in the I family, each linking the defect section that blocks it. The
other **11 carry a bare `Unverified`** with a generic evidence description and no stated reason:
A01, A02, A03, A04, A05, B04, B05, B06, B07, B08, H11.

A bare `Unverified` is not dishonest, but it is not an honest record of an unresolved item either: it
does not distinguish *measured and failing* from *not yet measured*, and those are different facts
with different next actions. The I-family rows make that distinction; these eleven do not.

**What closed it.** A01 and A02 were measured in this document, A03 and A04 in the companion pass,
and B04 through B08 in [`acceptance-family-b.md`](./acceptance-family-b.md) — nine of the ten. The
tenth, A05, is this row, and it now states its own history.

Every remaining `Unverified` row states why, and the distinction the clause demands — *measured and
failing* versus *not yet measured* — is now visible on each one:

| Row | What it says blocks it | Which kind |
| --- | --- | --- |
| H11 | Help dialog and preview/reset exposure await a read-only walkthrough | not yet measured |
| I01 | Defect I-1 | measured and failing |
| I02 | Defect I-2 | measured and failing |
| I04 | Defect I-3 | measured and failing |
| I05 | Defects I-3 and I-4 | measured and failing |
| J10 | The five rows above, now named rather than counted | blocked by construction |

**No row says `Unverified` without saying why.** J10's own statement was corrected in the same pass:
it cited "roughly 67 rows" outside the J family, a figure that had rotted to six, and now names the
rows instead of counting them so the same drift cannot recur.

Matrix totals moved from 98 Verified / 16 Unverified to **108 / 6** across this work.

## Correction made during this pass

Defect I-1 previously described `npm run db:start` as *permanently* failing once
`npm run db:artwork:photos` had run. A concurrent session's full reset returned 0 with no
fixture-bytes mismatch, so the true window is *after the artwork script, before the next full reset*.
Corrected in `acceptance-family-i.md` at `b5fd80f`, together with the note that the latent credential
hole recorded in the same section happened for real and is closed by `de10caa`.
