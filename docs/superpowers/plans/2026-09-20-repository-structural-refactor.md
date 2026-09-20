# Repository Structural Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Dawes Studios repository — data-access placement, shared component layer, styling boundary, file size, dead code, repository hygiene — without changing any observable behavior.

**Architecture:** The orchestrator establishes three foundations serially (a data-access contract proven by a migrated exemplar feature, a shared primitive layer extracted only from real duplication, and a stated styling boundary), then delegates one agent per feature to migrate onto those foundations. Each agent owns a disjoint set of paths and is verified independently before integration.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query v5, Supabase JS v2, xyflow v12, Tailwind v4 + hand-authored CSS, Vitest, Playwright, pgTAP, Node service in `apps/media`.

**Spec:** `docs/superpowers/specs/2026-09-20-repository-structural-refactor-design.md`

## Global Constraints

- **Behavior preservation is the defining constraint.** Rendered markup, class names, accessibility attributes, query filters, column selection, ordering, error handling, and API contracts must not change.
- **No test may be modified to accommodate the refactor.** A test that must change to keep passing is evidence that behavior changed, and is grounds to revert the change that caused it.
- **English for all project content** — code, identifiers, comments, docs, commit messages. Brazilian Portuguese only for direct chat with the user.
- **Conventional Commits required.** `commitlint` runs on `commit-msg`; `gitleaks` and `lint-staged` run on `pre-commit`.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Verification command:** `npm run check` = `typecheck && lint && format:check && test` (109 unit tests). It runs after every task, not only at the end.
- **Playwright runs on port 3003 only.** The media service allows `APP_ORIGIN=http://localhost:3003`; port 3010 returns 403 at the share-version dialog. Results from any other origin are not evidence.
- **Never discard uncommitted or untracked work** to reach a cleaner state.
- **Out of scope:** server-side data fetching / Server Actions, visual redesign, schema changes, API contract changes, dependency upgrades, acceptance-matrix rows.
- **Documentation is part of every change.** `AGENTS.md` and `CLAUDE.md` stay byte-identical; affected docs update in the same task.

## A Note on Test Discipline

This plan does not follow red-green TDD, and that is deliberate. TDD drives *new* behavior; this refactor is defined by producing *no* new behavior. The equivalent discipline here is characterization:

1. Establish that the suite passes before the change (the baseline).
2. Make the structural change.
3. Establish that the identical, unmodified suite still passes.

Where a task extracts logic into a newly testable unit — a data module function that previously lived inside a component — the task adds a unit test for that function. That test is new coverage of existing behavior, not a new requirement.

---

## Phase A — Foundations (orchestrator, serial)

No agent is dispatched until Phase A is complete and committed.

### Task 1: Establish the green baseline

**Files:**
- Modify: whatever `npm run check` and `npm run build` report as failing
- Commit: the 172 in-flight modified files

**Interfaces:**
- Consumes: nothing
- Produces: a baseline commit SHA that every later diff is measured against; a recorded pass/fail result for each verification command

- [ ] **Step 1: Record the starting state**

```bash
cd /Users/wendleywilson/DawesStudios
git status --porcelain | wc -l
git diff --shortstat
git log --oneline -3
```

Write the three outputs into the task notes. They are the reference for proving nothing was lost.

- [ ] **Step 2: Run the unit verification**

Run: `npm run check`
Expected: pass. If it fails, record the exact failure before touching anything.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Fix only what blocks the baseline**

If Steps 2 or 3 failed, fix the minimum that makes them pass. Do not refactor here. If a failure cannot be fixed without changing behavior, **stop and report to the user** — the plan cannot proceed on a tree whose behavior is unknown.

- [ ] **Step 5: Commit the in-flight work as the baseline**

```bash
git add -A -- apps supabase docs brand compose.yaml package.json .env.production.example
git status --porcelain --untracked-files=no | head -40
git commit -m "chore: commit the in-flight workspace and board work as a refactor baseline

Capture the accumulated feature work as a single verified reference point so the
structural refactor that follows can be diffed and reverted per step.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Confirm the baseline is green and clean**

```bash
npm run check
git log --oneline -1
git status --porcelain | grep -v '^?? .playwright-mcp/' | wc -l
```
Expected: check passes; the last line reports `0`.

---

### Task 2: Repository hygiene

**Files:**
- Modify: `.gitignore`
- Untrack: `.playwright-mcp/`, `supabase/tests/__pycache__/`
- Decide: `supabase/.restore-drill/`

**Interfaces:**
- Consumes: the baseline commit from Task 1
- Produces: a repository where `git status` is readable, so every later refactor diff is legible

- [ ] **Step 1: Confirm what is tracked that should not be**

```bash
git ls-files | grep -E '^\.playwright-mcp/|__pycache__|\.pyc$' | wc -l
git ls-files | grep -c '^supabase/\.restore-drill/'
```

- [ ] **Step 2: Extend `.gitignore`**

Append to `/Users/wendleywilson/DawesStudios/.gitignore`:

```gitignore
.playwright-mcp/
__pycache__/
*.pyc
supabase/.restore-drill/
```

**Decision on `supabase/.restore-drill/`:** the spec's default is to treat it as a generated drill by-product and ignore it, because a second copy of the schema, seed and five SQL test files will drift from the real one and no script reads it back. **Before executing this step, confirm with the user.** If they identify it as retained restore-drill evidence, omit that line, leave the directory tracked, and document its purpose in `docs/operations/README.md` instead.

- [ ] **Step 3: Untrack the artifacts without deleting them**

```bash
git rm -r --cached --quiet .playwright-mcp supabase/tests/__pycache__
```

`--cached` removes them from the index only. The files stay on disk. Confirm:

```bash
ls .playwright-mcp | wc -l
```
Expected: a non-zero count — the files still exist locally.

- [ ] **Step 4: Verify nothing else was swept up**

```bash
git status --porcelain | grep '^D ' | grep -vE '^\D+\.playwright-mcp/|__pycache__' | wc -l
```
Expected: `0`. Any other deletion is a mistake — restore it before continuing.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: stop tracking browser logs and Python bytecode

Untrack .playwright-mcp/ and supabase/tests/__pycache__/ and ignore them, so
that git status reflects source changes and refactor diffs stay legible.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Verify the working tree is now quiet**

```bash
git status --porcelain | wc -l
```
Expected: `0`.

---

### Task 3: Data-access contract, proven by the `credits` exemplar

**Files:**
- Modify: `apps/web/features/credits/credit-data.ts`
- Modify: `apps/web/features/credits/credit-actions.tsx`
- Create: `apps/web/features/credits/credit-data.test.ts`
- Modify: `apps/web/features/credits/README.md`
- Create: `docs/architecture/data-access.md`

**Interfaces:**
- Consumes: the baseline from Task 1
- Produces: the contract every delegated agent copies, and these exact exports from `credit-data.ts`, which the agents use as the naming pattern:
  - `creditQueryKeys: readonly string[]` — the invalidation set
  - `useInvalidateCredits(): () => Promise<void>`
  - `requestCredits(database: SupabaseDatabase, input: { clientId: string; amount: number; note: string }): Promise<void>`
  - `adjustCredits(database: SupabaseDatabase, input: { clientId: string; amount: number; description: string; idempotencyKey: string }): Promise<void>`
  - `reviewCreditRequest(database: SupabaseDatabase, input: { requestId: string; decision: "fulfill" | "reject"; note: string }): Promise<void>`

  where `SupabaseDatabase` is the client type already returned by `useAuth().database`.

- [ ] **Step 1: Read the two files end to end before editing either**

```bash
cat apps/web/features/credits/credit-data.ts
cat apps/web/features/credits/credit-actions.tsx
```

The four RPC call sites to relocate are `request_credits` and `adjust_credits` (inside the `save` mutation) and `fulfill_credit_request` / `reject_credit_request` (inside the `review` mutation).

- [ ] **Step 2: Write the failing test for the extracted mutations**

Create `apps/web/features/credits/credit-data.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { adjustCredits, requestCredits, reviewCreditRequest } from "./credit-data";

function stubDatabase(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("credit mutations", () => {
  it("requests credits with the client, amount and trimmed note", async () => {
    const database = stubDatabase({ data: null, error: null });
    await requestCredits(database as never, { clientId: "c1", amount: 50, note: " top up " });
    expect(database.rpc).toHaveBeenCalledWith("request_credits", {
      p_client_id: "c1",
      p_amount: 50,
      p_note: " top up ",
    });
  });

  it("adjusts credits with the idempotency key it is given", async () => {
    const database = stubDatabase({ data: null, error: null });
    await adjustCredits(database as never, {
      clientId: "c1",
      amount: -10,
      description: "correction",
      idempotencyKey: "adjustment:abc",
    });
    expect(database.rpc).toHaveBeenCalledWith("adjust_credits", {
      p_client_id: "c1",
      p_amount: -10,
      p_description: "correction",
      p_idempotency_key: "adjustment:abc",
    });
  });

  it("routes a fulfil decision to the fulfil procedure", async () => {
    const database = stubDatabase({ data: null, error: null });
    await reviewCreditRequest(database as never, {
      requestId: "r1",
      decision: "fulfill",
      note: "",
    });
    expect(database.rpc).toHaveBeenCalledWith("fulfill_credit_request", {
      p_request_id: "r1",
      p_note: "",
    });
  });

  it("routes a reject decision to the reject procedure", async () => {
    const database = stubDatabase({ data: null, error: null });
    await reviewCreditRequest(database as never, {
      requestId: "r1",
      decision: "reject",
      note: "out of scope",
    });
    expect(database.rpc).toHaveBeenCalledWith("reject_credit_request", {
      p_request_id: "r1",
      p_note: "out of scope",
    });
  });

  it("surfaces the database error message", async () => {
    const database = stubDatabase({ data: null, error: { message: "insufficient balance" } });
    await expect(
      requestCredits(database as never, { clientId: "c1", amount: 50, note: "" }),
    ).rejects.toThrow("insufficient balance");
  });
});
```

Note the deliberate choices: the mutations take an already-trimmed `note` and an already-generated `idempotencyKey`. Trimming and key generation are *component* concerns tied to the form's retry behaviour, and moving them would change behaviour. Only the database call relocates.

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm --prefix apps/web run test -- credit-data`
Expected: FAIL — `requestCredits`, `adjustCredits` and `reviewCreditRequest` are not exported.

- [ ] **Step 4: Add the mutations and the invalidation set to `credit-data.ts`**

Append to `apps/web/features/credits/credit-data.ts`:

```ts
export const creditQueryKeys = [
  "credit-account",
  "credit-ledger",
  "credit-requests",
  "notifications",
] as const;

export function useInvalidateCredits() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      creditQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export async function requestCredits(
  database: SupabaseDatabase,
  input: { clientId: string; amount: number; note: string },
) {
  assertResult(
    await database.rpc("request_credits", {
      p_client_id: input.clientId,
      p_amount: input.amount,
      p_note: input.note,
    }),
  );
}

export async function adjustCredits(
  database: SupabaseDatabase,
  input: { clientId: string; amount: number; description: string; idempotencyKey: string },
) {
  assertResult(
    await database.rpc("adjust_credits", {
      p_client_id: input.clientId,
      p_amount: input.amount,
      p_description: input.description,
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}

export async function reviewCreditRequest(
  database: SupabaseDatabase,
  input: { requestId: string; decision: "fulfill" | "reject"; note: string },
) {
  assertResult(
    await database.rpc(
      input.decision === "fulfill" ? "fulfill_credit_request" : "reject_credit_request",
      { p_request_id: input.requestId, p_note: input.note },
    ),
  );
}
```

Add the imports this needs at the top of the file: `useQueryClient` from `@tanstack/react-query`, and the client type. Export the client type from `apps/web/lib/supabase.ts` if it is not already exported:

```ts
export type SupabaseDatabase = SupabaseClient<Database>;
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm --prefix apps/web run test -- credit-data`
Expected: PASS, 5 tests.

- [ ] **Step 6: Point `credit-actions.tsx` at the data module**

Replace each inline `database.rpc(...)` with the corresponding imported function, and replace both copies of the four-key invalidation array with `useInvalidateCredits()`. The component keeps: the amount parsing and validation, the package check, the `note.trim()` calls, the `attempt` ref and `crypto.randomUUID()` idempotency logic, and the `onClose()` call. Only the database call and the invalidation list move.

After editing, confirm the component holds no queries:

```bash
grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/credits/credit-actions.tsx
```
Expected: `0`.

- [ ] **Step 7: Verify the whole feature**

```bash
npm run check
grep -rc '\.from(\|\.rpc(\|\.storage\.' apps/web/features/credits/*.tsx
```
Expected: check passes; every `.tsx` reports `0`.

- [ ] **Step 8: Write the contract document**

Create `docs/architecture/data-access.md` stating, with the `credits` feature cited as the worked example:

- Supabase queries live only in `features/<feature>/<feature>-data.ts`.
- Read paths are exported as `use<Thing>()` hooks wrapping `useQuery`.
- Write paths are exported as plain `async` functions taking `(database, input)`, so they are unit-testable without React.
- Validation, trimming, idempotency-key generation and retry state stay in the component, because they are tied to form behaviour.
- Each feature exports one `<feature>QueryKeys` set and one `useInvalidate<Feature>()` helper rather than repeating invalidation arrays.
- Components never import the Supabase client to issue a query.

Update `apps/web/features/credits/README.md` to point at the new exports.

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/credits apps/web/lib/supabase.ts docs/architecture/data-access.md
git commit -m "refactor(credits): move credit mutations into the data module

Relocate the four credit RPC calls out of credit-actions.tsx into credit-data.ts
as unit-testable functions, collapse the duplicated invalidation arrays into one
helper, and document the resulting data-access contract that the remaining
features will follow.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Extract the shared primitive layer

**Files:**
- Modify: `apps/web/features/shared/modal.tsx`
- Create: files under `apps/web/features/shared/` for each primitive that survives the evidence test
- Create: `apps/web/features/shared/README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: the shared primitives the delegated agents adopt. Each agent is told the exact export name and props of every primitive it must use.

- [ ] **Step 1: Gather the duplication evidence**

```bash
grep -rn 'role="dialog"\|<dialog' apps/web/features --include='*.tsx'
grep -rn 'className="field\|className="form-\|className="empty-state\|className="centered-state' apps/web/features --include='*.tsx' | wc -l
```

For each candidate primitive, list its actual consumers.

- [ ] **Step 2: Apply the evidence test**

A primitive is extracted **only if it has two or more real consumers today**, and only if its consumers' markup is identical or differs in ways expressible as props. Record the verdict for each candidate: dialog, form field, button, empty state, loading state. Discard any candidate that fails. Do not extract for consumers that do not exist — the root instructions forbid speculative sharing.

- [ ] **Step 3: Extract one primitive at a time**

The pattern, using the empty state as the worked example. If Step 2 found this
markup repeated across features:

```tsx
<div className="empty-state">
  <p className="muted">No briefings yet.</p>
</div>
```

then the extraction is a component that reproduces it exactly, with the only
varying part as a prop:

```tsx
// apps/web/features/shared/empty-state.tsx
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <p className="muted">{message}</p>
    </div>
  );
}
```

Note what did *not* change: the wrapper stays a `div`, both class names are
preserved verbatim, and the element nesting is identical. If one consumer wraps
its message in a `<strong>` and another does not, that difference becomes a
second prop with a default that preserves each call site's current output — it
is never normalized away.

For each primitive that passed Step 2, in its own edit cycle:

1. Create the component in `features/shared/`, reproducing the existing markup, class names and accessibility attributes **exactly**.
2. Replace the first consumer with it.
3. Run `npm run check`.
4. Replace the remaining consumers one at a time, running `npm run check` after each.

Where consumers differ, the difference becomes a prop with a default that preserves each call site's current output. Never normalize two different behaviours into one.

- [ ] **Step 4: Verify no markup changed**

```bash
npm run check
npm --prefix apps/web run test:e2e -- design-audit brand-accessibility
```
Expected: unit checks pass; both Playwright specs pass against the container on port 3003.

If the accessibility spec fails, a primitive dropped an attribute. Fix the primitive; do not relax the spec.

- [ ] **Step 5: Document the layer**

Create `apps/web/features/shared/README.md` listing each primitive, its props, and its current consumers. The consumer list is the justification for the primitive existing; a primitive that later drops to one consumer should move back into that feature.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/shared apps/web/features
git commit -m "refactor(shared): extract the multi-consumer UI primitives

Lift the primitives with two or more real consumers into features/shared,
preserving markup, class names and accessibility attributes exactly, and record
each primitive's consumers as the justification for it being shared.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Split `globals.css` along the styling boundary

**Files:**
- Modify: `apps/web/app/globals.css` (2,221 lines)
- Modify: `apps/web/features/board/board.css`, `apps/web/features/projects/projects.css`, `apps/web/features/brand/brand.css`
- Create: `apps/web/features/workspace/workspace.css`, `apps/web/features/auth/auth.css`

**Interfaces:**
- Consumes: the shared primitives from Task 4, whose styles stay in `globals.css`
- Produces: a `globals.css` containing only tokens, theme, base elements and shared-primitive styles

- [ ] **Step 1: Verify the namespace assignment against real consumers**

The namespaces below are the proposed assignment. **Before moving any of them, confirm each one's consumers:**

```bash
grep -rn 'className=.*\b<namespace>\b' apps/web/features apps/web/app --include='*.tsx' | cut -d: -f1 | sort -u
```

**Rule that overrides the table:** if a namespace has consumers in two or more features, it stays in `globals.css` as shared, regardless of what its name suggests. `brand-logo` and `brand-monogram` are the likely traps — their names say `brand` but the workspace client mark may use them.

| Destination | Namespaces |
| --- | --- |
| stay in `globals.css` (tokens, base, shared) | `application` `button` `centered-state` `checkbox-field` `copy-textarea` `count-badge` `empty-state` `eyebrow` `field` `field-full` `filter-indicator` `form-actions` `form-error` `form-grid` `form-help` `form-stack` `icon-button` `main-content` `modal` `modal-backdrop` `modal-body` `modal-close` `modal-dialog` `modal-dialog-inner` `modal-footer` `modal-header` `muted` `nav-item` `nav-section-label` `page-content` `page-heading` `panel` `react-flow` `search-field` `section-heading` `segmented-control` `skip-link` `spin` `sr-only` `status-badge` `subtle-count` `table-head` `text-muted` `text-small` `toolbar` `toolbar-group` `visually-hidden` |
| `features/board/board.css` | `board-canvas` `board-card` `board-card-body` `board-card-footer` `board-card-grip` `board-card-meta` `board-filter-actions` `board-filter-menu` `board-filters` `board-identity` `board-identity-mark` `board-identity-name` `board-identity-text` `board-list` `board-page` `board-result-count` `board-tools` `kanban-board` `kanban-column` `kanban-heading` |
| `features/projects/projects.css` | `design-viewport` `project-canvas` `project-origin` `project-row` `project-symbol` `project-table` `project-title` |
| `features/workspace/workspace.css` (new) | `attention-section` `client-destination` `client-destinations` `client-entry` `client-initials` `client-mark` `client-mark-initials` `client-nav` `client-navigation` `home-content` `home-date` `mobile-menu` `mobile-sidebar-close` `notifications-bell` `overview-stats` `profile-account` `profile-account-copy` `profile-avatar` `profile-bar` `sidebar` `sidebar-backdrop` `sidebar-collapse` `sidebar-footer` `topbar` `topbar-actions` `topbar-identity` `unread-dot` `workspace` `workspace-card` `workspace-card-footer` `workspace-card-top` `workspace-grid` `workspace-status` |
| `features/auth/auth.css` (new) | `login-caption` `login-form` `login-form-panel` `login-layout` `login-story` |
| `features/brand/brand.css` | `brand-link` `brand-logo` `brand-monogram` — **only if** the consumer check shows a single feature |

- [ ] **Step 2: Capture the visual baseline before moving anything**

```bash
npm --prefix apps/web run test:e2e -- design-audit
```

Expected: pass. This run, against the container on port 3003, is the "before" evidence. Record its result.

- [ ] **Step 3: Move one destination at a time**

For each destination, in its own edit cycle:

1. Cut the rules **verbatim** — selectors, declarations, and any `@media` blocks that target them — from `globals.css`.
2. Paste them into the destination stylesheet, **preserving their relative order**, so the cascade resolves identically.
3. If the feature stylesheet is not yet imported where the feature renders, import it; check how `board.css` is already imported and follow that pattern.
4. Run `npm run check`.

Cascade order is the whole risk here. Rules that previously sat later in `globals.css` than a shared rule must still resolve later. If a move changes specificity or order, the computed style changes and the refactor has failed its constraint.

- [ ] **Step 4: Verify computed styles did not change**

```bash
npm run check
npm --prefix apps/web run test:e2e -- design-audit brand-accessibility brand-canvas-final
```

Expected: all pass. Then measure the documented widths — 1440, 1200, 1100, 1000, 900, 700 and 390 px — and confirm no horizontal or vertical overflow, matching the measurements recorded in `docs/engineering/handoff.md`.

- [ ] **Step 5: Confirm `globals.css` holds nothing feature-specific**

```bash
wc -l apps/web/app/globals.css
grep -cE '^\.(board|kanban|project-|login-|sidebar|topbar|workspace|client-|profile-|home-|overview-)' apps/web/app/globals.css
```
Expected: a substantially smaller file; the grep reports `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/globals.css apps/web/features
git commit -m "refactor(styles): move feature rules out of the global stylesheet

Relocate the board, projects, workspace, auth and brand namespaces from
globals.css into their owning feature stylesheets, preserving rule order so the
cascade resolves identically, and leave globals.css holding tokens, base
elements and shared primitives only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Document the boundaries

**Files:**
- Modify: `docs/architecture/design-system.md`
- Modify: `AGENTS.md` and `CLAUDE.md` (must stay byte-identical)
- Modify: `docs/engineering/handoff.md`

**Interfaces:**
- Consumes: the contracts established in Tasks 3, 4 and 5
- Produces: the written rules each delegated agent is held to

- [ ] **Step 1: State the styling boundary in `docs/architecture/design-system.md`**

Document, so future work has one answer to "which system do I use here":

- `app/globals.css` holds tokens and `@theme`, reset and base element styles, and shared-primitive styles. Nothing feature-specific.
- `features/<feature>/<feature>.css` holds everything specific to that feature.
- Tailwind's role, stated explicitly given `@import "tailwindcss"` and the 14 `@theme` tokens already present.

- [ ] **Step 2: Add the boundaries to the root instructions**

Add a short subsection to `AGENTS.md` covering the data-access contract, the shared-layer evidence test, and the styling boundary, each linking to its detailed document.

- [ ] **Step 3: Mirror it into `CLAUDE.md`**

```bash
cp AGENTS.md CLAUDE.md
diff AGENTS.md CLAUDE.md && echo "identical"
```
Expected: `identical`. The root instructions require these two files to stay synchronized.

- [ ] **Step 4: Record orchestrator ownership in the handoff**

Add an entry to `docs/engineering/handoff.md` naming the current orchestrator, the refactor objective, the baseline commit SHA, and the delegation table from Phase B, so an incoming session can reconcile.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md docs
git commit -m "docs: record the data-access, shared-layer and styling boundaries

Document the three foundations the feature refactors are held to, synchronize the
root instruction files, and record orchestrator ownership and the baseline commit
in the engineering checkpoint.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — Feature migration (delegated agents)

### The agent brief

Every delegated task uses this brief, with `<FEATURE>` and the owned paths substituted. It is reproduced in full in each task rather than cross-referenced, because an agent sees only its own task.

> You are refactoring one feature of the Dawes Studios repository. **You must not change behavior.** Rendered markup, class names, accessibility attributes, query filters, column selection, ordering, error handling and API contracts stay exactly as they are.
>
> **You may write only inside `<OWNED PATHS>`.** If your work appears to require editing a file outside that set, stop and report it to the orchestrator instead of editing it.
>
> **You must not modify any test to make it pass.** A test that fails after your change is evidence you changed behavior. Revert the change that caused it.
>
> Read first: `docs/architecture/data-access.md`, `apps/web/features/shared/README.md`, `docs/architecture/design-system.md`, and the `credits` feature as the worked exemplar.
>
> Your mandate, in order:
> 1. **Relocate queries.** Move every `.from(`, `.rpc(` and `.storage.` call out of `.tsx` files into `<feature>-data.ts`, following the credits pattern: reads as `use<Thing>()` hooks, writes as plain `async (database, input)` functions. Validation, trimming, idempotency keys and retry state stay in the component. Relocate queries verbatim — never rewrite a filter, a column list or an ordering.
> 2. **Add unit tests** for each extracted write function, asserting the exact procedure name and argument object, plus one test that the database error message is surfaced. Use the credits tests as the template.
> 3. **Adopt the shared primitives** in place of local copies, preserving each call site's current output through props where call sites differ.
> 4. **Move feature-specific CSS** out of `globals.css` into the feature stylesheet, preserving rule order so the cascade resolves identically.
> 5. **Split files above roughly 350 lines** along responsibility boundaries. The threshold is a prompt to look, not a rule to obey: a cohesive 400-line module is better than two incoherent 200-line ones.
> 6. **Remove dead code and unused exports** within your scope.
>
> Verification, which you run yourself before reporting: `npm run check` must pass, and `grep -c '\.from(\|\.rpc(\|\.storage\.'` must report `0` for every `.tsx` in your scope.
>
> Report using the template in `docs/engineering/handoffs/README.md`, saved to `docs/engineering/handoffs/2026-09-20-refactor-<feature>.md`. State completed work, changed files, decisions taken, the checks you actually executed with their results, unresolved risks, and the next required action — distinguishing planned, implemented, tested and verified.

### Wave 1 — the heavy features

Dispatch these three concurrently. They share no paths.

### Task 7: Refactor `board`

**Files:**
- Owned: `apps/web/features/board/` (16 files, 4,307 lines)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-board.md`

**Interfaces:**
- Consumes: `docs/architecture/data-access.md`, the shared primitives from Task 4, the CSS boundary from Task 5
- Produces: `board-data.ts` holding every board query; no queries in board `.tsx` files

**Known scope:** `board-page.tsx` is 659 lines with 2 inline queries; `project-thumbnail.tsx` has 3. The feature has no `board-data.ts` yet — create it. `board-layout.ts`, `timeline-model.ts` and their tests are already well-factored; leave them alone.

- [ ] **Step 1: Dispatch the agent with the brief above**
- [ ] **Step 2: Review the returned diff against the mandate — especially that no query was rewritten and no test was modified**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: If it fails, return the work to the agent for correction rather than fixing it yourself**
- [ ] **Step 5: Confirm `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/board/*.tsx` reports `0` for every file**

### Task 8: Refactor `projects`

**Files:**
- Owned: `apps/web/features/projects/` (15 files, 3,686 lines)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-projects.md`

**Interfaces:**
- Consumes: the same three foundation documents
- Produces: every projects query inside `project-data.ts`, `artwork-files.ts` or `media-client.ts`

**Known scope:** the heaviest query concentration in the repository — `project-action-dialog.tsx` has 11 inline calls, `project-details.tsx` 5, `comment-panel.tsx` 2, `artwork.tsx` 1. `project-page.tsx` is 504 lines. `project-data.ts` already holds 9 queries and is the target. `canvas-layout.test.ts` and `media-client.test.ts` are existing coverage — do not modify them.

- [ ] **Step 1: Dispatch the agent with the brief above**
- [ ] **Step 2: Review the returned diff, paying particular attention to the 11 relocated calls in `project-action-dialog.tsx`**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: If it fails, return the work to the agent for correction**
- [ ] **Step 5: Confirm the grep reports `0` for every `.tsx` in the feature**

### Task 9: Refactor `brand`

**Files:**
- Owned: `apps/web/features/brand/` (12 files, 3,053 lines)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-brand.md`

**Interfaces:**
- Consumes: the same three foundation documents
- Produces: every brand query inside `brand-data.ts`

**Known scope:** `brand-assets.tsx` has 8 inline calls, `brand-templates.tsx` 2, `draft-editor.tsx` 2, `section-editor.tsx` 1. `brand.css` is 811 lines and will receive namespaces from Task 5. `brand-model.ts` and `brand-model.test.ts` are already well-factored.

**Extra caution:** three Playwright specs target this feature — `brand-guidance`, `brand-accessibility` and `brand-canvas-final`. They must pass unmodified.

- [ ] **Step 1: Dispatch the agent with the brief above, including the extra caution**
- [ ] **Step 2: Review the returned diff**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: Run `npm --prefix apps/web run test:e2e -- brand-guidance brand-accessibility brand-canvas-final` against the container on port 3003**
- [ ] **Step 5: If either fails, return the work to the agent for correction**

### Task 10: Commit wave 1

- [ ] **Step 1: Run the full unit verification**

Run: `npm run check`
Expected: pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/features/board apps/web/features/projects apps/web/features/brand docs/engineering/handoffs
git commit -m "refactor(board,projects,brand): move queries into feature data modules

Relocate the inline Supabase calls from the three heaviest features into their
data modules, adopt the shared primitives, and split the oversized components
along responsibility boundaries without changing rendered output.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Wave 2 — the mid-sized features

### Task 11: Refactor `briefings`

**Files:**
- Owned: `apps/web/features/briefings/` (12 files, 2,557 lines)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-briefings.md`

**Known scope:** `briefing-attachments.tsx` has 8 inline calls, `briefing-detail.tsx` 4, `briefing-editor.tsx` 2. `briefing-editor.tsx` is the largest component in the repository at 664 lines. `briefing-data.ts` already holds 5 queries. `briefing-model.test.ts` and `briefing-attachments.test.ts` are existing coverage.

- [ ] **Step 1: Dispatch the agent with the brief above**
- [ ] **Step 2: Review the returned diff, especially the split of `briefing-editor.tsx`**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: If it fails, return the work to the agent for correction**

### Task 12: Refactor `settings`

**Files:**
- Owned: `apps/web/features/settings/` (13 files, 1,989 lines)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-settings.md`

**Known scope:** queries are spread thinly across seven components — `team-settings.tsx` 3, `client-settings.tsx` 2, `campaign-settings.tsx` 2, and one each in `workspace-settings.tsx`, `preset-settings.tsx`, `account-settings.tsx` and `invitation-acceptance.tsx`. There is no `settings-data.ts` yet — create it. `settings-model.test.ts` is existing coverage.

**Extra caution:** `invitation-acceptance.tsx` pairs with `app/api/invitations/route.ts`, which is **outside the agent's scope**. The handoff records a previously fixed defect where the invitation endpoint derived its origin from the server bind address. The agent must not touch the route; if the client and route appear coupled, it reports rather than edits.

- [ ] **Step 1: Dispatch the agent with the brief above, including the extra caution**
- [ ] **Step 2: Review the returned diff and confirm `app/api/invitations/route.ts` is untouched**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: If it fails, return the work to the agent for correction**

### Task 13: Refactor `workspace`

**Files:**
- Owned: `apps/web/features/workspace/` (9 files, 1,190 lines)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-workspace.md`

**Known scope:** `search-page.tsx` has 4 inline calls, `notifications-page.tsx` 1, `app-shell.tsx` 1. `app-shell.tsx` is 415 lines. `workspace-data.ts` already holds 5 queries. This feature receives the largest CSS block from Task 5 — 33 namespaces into the new `workspace.css`.

**Extra caution:** `app-shell.tsx` carries the topbar consolidation recently landed by another session, including the `--workspace-chrome` measurement and the portal slot in `topbar-tools.tsx`. That behavior is deliberate and must survive. The `workspace-actions` and `workspace` Playwright specs cover it.

- [ ] **Step 1: Dispatch the agent with the brief above, including the extra caution**
- [ ] **Step 2: Review the returned diff against the topbar behavior**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: Run `npm --prefix apps/web run test:e2e -- workspace workspace-actions` against the container on port 3003**
- [ ] **Step 5: If either fails, return the work to the agent for correction**

### Task 14: Commit wave 2

- [ ] **Step 1: Run `npm run check`** — expected: pass
- [ ] **Step 2: Run `npm run build`** — expected: pass
- [ ] **Step 3: Commit**

```bash
git add apps/web/features/briefings apps/web/features/settings apps/web/features/workspace docs/engineering/handoffs
git commit -m "refactor(briefings,settings,workspace): move queries into feature data modules

Relocate the inline Supabase calls from the mid-sized features, introduce the
missing settings data module, and move the workspace chrome styles into the
feature stylesheet without changing rendered output.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Wave 3 — the small features

### Task 15: Refactor `assets`, `auth`, `campaigns` and `reviews`

**Files:**
- Owned: `apps/web/features/assets/`, `apps/web/features/auth/`, `apps/web/features/campaigns/`, `apps/web/features/reviews/` (12 files, 1,321 lines combined)
- Report: `docs/engineering/handoffs/2026-09-20-refactor-small-features.md`

**Interfaces:**
- Consumes: the same three foundation documents
- Produces: queries confined to `asset-data.ts` and to new data modules for `auth`, `campaigns` and `reviews`

**Known scope:** `reviews-page.tsx` has 5 inline calls and the feature has no data module — create `review-data.ts`. `upload-file-dialog.tsx` has 5; `asset-data.ts` already holds 5 and has existing coverage in `asset-data.test.ts`. `campaign-dialog.tsx` has 1 and is the feature's only file. `auth-provider.tsx` has 1.

**Extra caution:** `auth-provider.tsx` owns session handling and exposes `useAuth()`, which every other feature consumes. Its single query is session-related, not feature data. The agent leaves the provider's contract and session logic alone; if relocating that query would alter session behavior, it reports instead. `return-path.test.ts` is existing coverage.

- [ ] **Step 1: Dispatch the agent with the brief above, including the extra caution**
- [ ] **Step 2: Review the returned diff and confirm `useAuth()`'s contract is unchanged**
- [ ] **Step 3: Run `npm run check` on the integrated tree**
- [ ] **Step 4: If it fails, return the work to the agent for correction**
- [ ] **Step 5: Commit**

```bash
git add apps/web/features/assets apps/web/features/auth apps/web/features/campaigns apps/web/features/reviews docs/engineering/handoffs
git commit -m "refactor(assets,auth,campaigns,reviews): move queries into data modules

Relocate the remaining inline Supabase calls from the small features, adding the
missing review and campaign data modules while leaving the auth provider's
session contract unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Closing (orchestrator)

### Task 16: Refactor `apps/media` and `supabase/`

**Files:**
- Modify: `apps/media/src/` (`server.js`, `sanitize.js`)
- Modify: `supabase/scripts/`, `supabase/tests/`

**Interfaces:**
- Consumes: nothing from Phase B
- Produces: the final structural pass over the non-web code

These stay with the orchestrator because they touch shared infrastructure and are too small to justify their own agents.

- [ ] **Step 1: Pass over the orchestrator-owned `apps/web/app/` files**

The 27 route files are thin server shells that delegate to feature components;
they need no restructuring. Two files do warrant a read:

- `apps/web/app/api/invitations/route.ts` — the only API route, and the only
  place besides `lib/supabase.ts` that constructs a Supabase client, including
  a service-key admin client. Check it for dead code and clarity. **Do not
  change its origin handling.** The handoff records a fixed defect where it
  derived its origin from the server bind address; that fix must survive.
- `apps/web/app/layout.tsx` and `app/error.tsx` — confirm they still reference
  the stylesheets that Task 5 moved.

Run `npm run check` after any edit here.

- [ ] **Step 2: Read `apps/media/src/server.js` and `sanitize.js` end to end**
- [ ] **Step 3: Apply the same mandate** — split by responsibility, remove dead code, keep behavior identical. `sanitize.test.js` and `server.test.js` are the safety net and must not be modified.
- [ ] **Step 4: Run `npm --prefix apps/media test`** — expected: pass
- [ ] **Step 5: Review `supabase/scripts/` and `supabase/tests/` for duplication and dead code, leaving migrations untouched** — migrations are an applied history, not source to refactor
- [ ] **Step 6: Run `npm run db:test`** — expected: pass
- [ ] **Step 7: Commit**

```bash
git add apps/web/app apps/media supabase
git commit -m "refactor(media,supabase): split by responsibility and drop dead code

Apply the structural pass to the media service and the Supabase scripts and
tests, leaving applied migrations and the test contracts untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 17: Full verification and handoff

**Files:**
- Modify: `docs/engineering/handoff.md`
- Modify: `README.md`, `apps/web/README.md`, `apps/media/README.md` if their described structure changed

**Interfaces:**
- Consumes: every preceding task
- Produces: the evidence that behavior was preserved

- [ ] **Step 1: Run the complete verification set**

```bash
npm run check
npm run build
npm --prefix apps/media test
npm run db:test
python3 supabase/tests/http_auth_storage_test.py
npm --prefix apps/media run test:integration
npm run test:e2e
```

Record each command's actual result. The Playwright suite runs against the container on port 3003. The handoff's reference point is **24 of 24 browser tests passing**; anything less is a regression to investigate, not to explain away.

- [ ] **Step 2: Verify the definition of done**

Substitute `BASELINE` with the commit SHA recorded in Task 1, Step 6:

```bash
BASELINE=<the SHA recorded in Task 1 Step 6>
grep -rc '\.from(\|\.rpc(\|\.storage\.' apps/web/features --include='*.tsx' | grep -v ':0$' | wc -l
grep -cE '^\.(board|kanban|project-|login-|sidebar|topbar|workspace|client-|profile-|home-|overview-)' apps/web/app/globals.css
git diff --stat "$BASELINE" -- 'apps/web/features/**/*.test.ts' 'apps/web/tests/**'
diff AGENTS.md CLAUDE.md && echo "identical"
```

Expected: `0` components with queries; `0` feature namespaces in `globals.css`; **an empty test diff** — no test file changed across the entire refactor; instruction files identical.

The empty test diff is the single most important check in this plan. It is the proof that behavior was preserved.

- [ ] **Step 3: Compare the before and after shape**

```bash
find apps/web/features -name '*.tsx' -o -name '*.ts' | xargs wc -l | sort -rn | head -20
```

Record the new largest-file list against the starting one — `briefing-editor.tsx` 664, `board-page.tsx` 659, `project-page.tsx` 504, `credits-page.tsx` 433, `app-shell.tsx` 415 — as the measured outcome.

- [ ] **Step 4: Update the engineering checkpoint**

Write into `docs/engineering/handoff.md`: what was implemented, every changed area, the checks actually executed with their results, what remains unverified, and the next required action. Distinguish planned, implemented, tested and verified. State plainly that the 75 Unverified acceptance rows were **not** addressed by this refactor.

- [ ] **Step 5: Update the affected READMEs**

Only where the described structure actually changed. Verify every path, link and command in them against the tree before claiming it is accurate.

- [ ] **Step 6: Commit**

```bash
git add docs README.md apps/web/README.md apps/media/README.md
git commit -m "docs: record the structural refactor outcome and verification

Capture the executed checks with their results, the measured before and after
file shape, and the explicit statement that the acceptance matrix was not
addressed by this refactor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Rollback

Every wave ends in its own commit, so any wave reverts with `git revert` without disturbing its neighbours. The baseline commit from Task 1 is the floor: reverting to it restores the tree exactly as the user handed it over, with the in-flight work intact.
