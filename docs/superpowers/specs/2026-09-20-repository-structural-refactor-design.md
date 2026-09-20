# Repository-wide structural refactor

Date: 2026-09-20
Owner: Claude Code, as orchestrator
Status: design approved in chat; awaiting written-spec review

## Objective

Restructure the Dawes Studios repository without changing behavior. The refactor
targets module boundaries, data-access placement, the shared component layer,
the styling architecture, file size, dead code, and repository hygiene.

Behavior preservation is the defining constraint. The existing suites are the
safety net: the same tests that pass before the refactor must pass after it,
without being rewritten to accommodate the new structure. A test that has to
change to keep passing is evidence that behavior changed, and is grounds to
revert the change that caused it.

## Non-goals

These are recorded as findings and deliberately excluded:

- Moving data fetching to the server. All 27 routes are thin server shells; the
  56 `"use client"` components perform every query in the browser, and the
  application defines no Server Actions. Migrating any part of this changes
  behavior, caching, and failure modes, so it is out of scope. It is documented
  here so the decision is explicit rather than forgotten.
- Visual redesign. Styling work is limited to relocating rules and defining
  which system owns what. Rendered output must not change.
- Schema changes, API contract changes, and dependency upgrades.
- Acceptance-matrix work. The 75 Unverified rows recorded in the engineering
  handoff are untouched by this effort.

## Current state

Measured on 2026-09-20 against the working tree.

| Area | Measurement |
| --- | --- |
| Source files | 232 files, roughly 34,000 lines across `apps/` and `supabase/` |
| Applications | `apps/web` (Next.js 16 App Router, 12 features), `apps/media` (Node), `supabase/` |
| Uncommitted work | 172 files changed, +12,025 / -2,056, plus untracked browser logs |
| Inline queries in components | 85 occurrences of `.from(` / `.rpc(` / `.storage.` across 30 `.tsx` files |
| Queries in data modules | 33 occurrences across 6 `*-data.ts` files |
| Global stylesheet | `app/globals.css`, 2,221 lines, 4 section comments, 14 `:root` tokens |
| Feature stylesheets | 9 files, roughly 3,300 lines |
| Styling systems in use | Tailwind v4 (`@import "tailwindcss"`, `@theme inline`), bespoke global CSS, per-feature CSS |
| Dialog markup | 16 files contain dialog markup; 14 sit outside `features/shared/` |
| Shared layer | `features/shared/` 342 lines in 6 files; `lib/` a single file |
| Largest components | `briefing-editor.tsx` 664, `board-page.tsx` 659, `project-page.tsx` 504, `credits-page.tsx` 433, `app-shell.tsx` 415 |

Feature sizes, in lines of `.ts`/`.tsx`/`.css`:

| Feature | Files | Lines |
| --- | --- | --- |
| board | 16 | 4,307 |
| projects | 15 | 3,686 |
| brand | 12 | 3,053 |
| briefings | 12 | 2,557 |
| settings | 13 | 1,989 |
| credits | 7 | 1,306 |
| workspace | 9 | 1,190 |
| assets | 5 | 696 |
| auth | 4 | 267 |
| reviews | 2 | 261 |
| campaigns | 1 | 97 |
| shared | 6 | 342 |

### Diagnosis

The repository is not disorganized by accident. Each feature already declares
the right structure — a `*-data.ts` module, a feature stylesheet, colocated unit
tests — but nothing enforces it, so components bypass their own data module and
the global stylesheet absorbs whatever does not obviously belong to one feature.
The result is a correct pattern losing to an unenforced one, 72% to 28%.

The refactor therefore establishes boundaries first and migrates onto them,
rather than reorganizing files and hoping the pattern holds.

## Step 0: baseline

No agent is dispatched before this completes.

1. Run `npm run check` and `npm run build` on the current tree. Fix whatever
   fails. If a failure cannot be fixed without changing behavior, stop and
   report it rather than working around it.
2. Commit the 172 modified files as a baseline commit, preserving the
   in-flight work. Nothing uncommitted or untracked is discarded.
3. Repository hygiene, as a separate commit:
   - Untrack `.playwright-mcp/` and add it to `.gitignore`.
   - Add `__pycache__/` and `*.pyc` to `.gitignore` and untrack the committed
     bytecode under `supabase/tests/`.
   - Resolve `supabase/.restore-drill/`, which duplicates the entire Supabase
     tree including a 677-line seed and five SQL test files. Default: treat it
     as a generated drill by-product, untrack it, and add it to `.gitignore`,
     because a second copy of the schema and its tests will drift from the real
     one and there is no script that reads it back. If the user identifies it
     as retained evidence, it stays tracked and is documented in
     `docs/operations/README.md` instead. Either way the decision is recorded
     before any code moves.

The baseline commit is the reference point every later diff is measured
against. Without a green baseline there is no way to prove behavior was
preserved.

## Foundation 1: data-access contract

**Rule.** Supabase queries exist only in `features/<feature>/<feature>-data.ts`.
Components receive data as props or call named functions exported from that
module. No component imports the Supabase client to issue a query.

**Rationale.** This is already the repository's stated rule in the root
instructions ("keep feature code, data access, validation, and unit tests
colocated"). The refactor enforces it rather than inventing a new pattern.

**Scope of change.** 85 call sites across 30 components move into 6 existing
data modules, plus any new data module a feature needs. Each moved query keeps
its exact filters, column selection, ordering, and error handling. A query is
relocated, never rewritten.

**Exemplar.** The orchestrator migrates `credits` end to end first: 7 files,
3 inline queries, small enough to read in one pass and to serve as the pattern
every delegated agent copies. The exemplar is committed and referenced in each
agent's brief.

**Collateral benefit.** Each `*-data.ts` becomes testable without rendering a
component, which is why the existing data modules are the only part of the
data layer with unit tests today.

**Explicitly preserved.** `lib/supabase.ts` already centralizes client
construction correctly, including the browser-client reuse across remounts and
the rule against sharing server sessions. It is not restructured.

## Foundation 2: shared layer

**Rule.** A primitive moves to `features/shared/` only when it has multiple
real consumers today. No speculative design system, no component library built
for consumers that do not exist.

**Scope of change.** Dialog markup appears in 16 files while `shared/modal.tsx`
already exists; 14 of those files are outside `shared/`. The orchestrator
audits the duplication and extracts only what genuinely repeats — candidates
are dialog, form field, button, empty state, and loading state. Each extraction
is justified by naming its consumers.

`features/shared/` grows from 342 lines to whatever the real duplication
justifies. `lib/` remains narrow: it holds cross-cutting infrastructure
(the Supabase client), not UI.

**Constraint.** Extraction must not change rendered markup, class names, or
accessibility attributes. Any place where consumers differ keeps its
difference through props rather than being normalized into one behavior.

## Foundation 3: styling boundary

**Current problem.** Three systems coexist with no stated boundary: Tailwind
v4 with 14 theme tokens, a 2,221-line global stylesheet with 4 section
comments, and 9 per-feature stylesheets.

**Rule.** After this refactor:

- `app/globals.css` holds tokens and theme, reset and base element styles, and
  the styles of shared primitives. Nothing feature-specific.
- `features/<feature>/<feature>.css` holds everything specific to that feature.
- Tailwind's role is stated explicitly in the design-system document, so future
  work has one answer to "which system do I use here".

**Scope of change.** `globals.css` is split along those lines and
feature-specific rules move to the owning feature's stylesheet. Selectors and
declarations move verbatim; cascade order is preserved so computed styles do
not change.

**Verification.** Because CSS changes are invisible to unit tests, the styling
work is verified by the Playwright design-audit and accessibility specs and by
the documented width measurements, not by the build succeeding.

## Delegation model

Each agent owns exactly one write scope and never writes outside it, satisfying
the disjoint-ownership requirement in the root instructions. Each agent files a
report under `docs/engineering/handoffs/` using the documented template before
returning.

| Wave | Agent scope | Owned paths |
| --- | --- | --- |
| 1 | board | `apps/web/features/board/` |
| 1 | projects | `apps/web/features/projects/` |
| 1 | brand | `apps/web/features/brand/` |
| 2 | briefings | `apps/web/features/briefings/` |
| 2 | settings | `apps/web/features/settings/` |
| 2 | workspace | `apps/web/features/workspace/` |
| 3 | small features | `apps/web/features/{assets,auth,campaigns,reviews}/` |

`apps/media`, `supabase/`, `apps/web/app/`, `apps/web/lib/`,
`apps/web/features/shared/`, and all root tooling stay with the orchestrator.
They are small, they touch shared infrastructure, and splitting them would
break write-ownership disjointness.

### Agent mandate

Every agent receives the same mandate, scoped to its own directory:

1. Move inline Supabase queries into the feature's data module, following the
   committed `credits` exemplar. Relocate queries; do not rewrite them.
2. Adopt the shared primitives from Foundation 2 in place of local copies.
3. Move feature-specific rules out of `globals.css` into the feature
   stylesheet.
4. Split files above roughly 350 lines along responsibility boundaries, not
   line counts. A cohesive 400-line module is better than two incoherent
   200-line ones; the threshold is a prompt to look, not a rule to obey.
5. Remove dead code and unused exports within the owned scope.

Every agent is forbidden to change behavior, rendered output, API contracts,
the database schema, or any file outside its owned paths. An agent that
believes a behavior change is necessary reports it to the orchestrator instead
of making it.

### Agent reporting

Each report states completed work, changed files, decisions taken, checks
actually executed with their results, unresolved risks, and the next required
action — distinguishing planned, implemented, tested, and verified states, as
the root instructions require.

## Verification

`npm run check` — typecheck, lint, format check, and the 109 unit tests — runs
after **each agent**, not only at the end. An agent whose diff does not pass has
its work returned for correction, not integrated. Each wave ends in a commit, so
every wave is independently revertible.

Closing verification, run by the orchestrator:

```bash
npm run check
npm run build
npm --prefix apps/media test
npm run db:test
npm run test:e2e
```

The Playwright suite runs against the container on port 3003. The engineering
handoff records that port 3010 fails at the share-version dialog because the
media service only allows `APP_ORIGIN=http://localhost:3003`; that is an
environment constraint, not a defect, and the suite must be run from the
allowed origin before its results count as evidence.

### Definition of done

- The same suites that passed on the baseline commit pass on the final tree,
  with no test modified to accommodate the refactor.
- Zero Supabase queries remain in `.tsx` files.
- `globals.css` contains no feature-specific rules.
- No file that was split lost or gained behavior.
- `AGENTS.md` and `CLAUDE.md` remain synchronized, and
  `docs/architecture/design-system.md` states the styling boundary.
- `docs/engineering/handoff.md` records the integrated result, the checks
  actually executed, and what remains unverified.

## Risks

| Risk | Mitigation |
| --- | --- |
| The baseline tree is not green, blocking everything | Step 0 runs first and reports rather than working around failures |
| CSS moves silently change computed styles | Preserve cascade order; verify through the design-audit and accessibility specs at documented widths |
| Query relocation alters filters or error handling | Relocate verbatim; review each moved call site against its original |
| Shared extraction normalizes away real differences | Extract only multi-consumer primitives; preserve differences through props |
| Agents drift outside their scope | Disjoint owned paths, per-agent `npm run check`, per-wave commits |
| Refactor collides with concurrent sessions | Reconcile the working tree before starting; orchestrator ownership recorded in the engineering handoff |
