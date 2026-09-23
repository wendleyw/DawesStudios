# Data-access contract

This document is the contract every feature module follows for talking to Supabase. `features/credits/` is the worked example; new features must match its shape, not merely resemble it.

## Rules

1. **Supabase queries live only in `features/<feature>/<feature>-data.ts`.** No other file in the feature — page, dialog, form component — imports `@supabase/supabase-js` types to build a query or calls `.from(`, `.rpc(` or `.storage.` directly. `credit-data.ts` is the only file in `features/credits/` that touches the database; verify a feature's `.tsx` files with:

   ```sh
   grep -rc '\.from(\|\.rpc(\|\.storage\.' features/<feature>/*.tsx
   ```

   Every result must be `0`.

2. **Read paths are exported as `use<Thing>()` hooks wrapping `useQuery`.** See `useCreditAccount`, `useCreditLedger` and `useCreditRequests` in `credit-data.ts`. Each hook owns its query key, its `enabled` gate and its `assertResult(...)` cast; components consume the hook and never see the underlying `database.from(...)` call.

   **Reads that cannot be hooks.** A read invoked from inside a mutation callback — a `mutationFn`, an `onSuccess`, a submit handler — is a plain `async (database, input)` function shaped like a write path, not a `use<Thing>()` hook. This is not a per-feature exception to be argued case by case: React only permits a hook at the top level of a component or of another hook, so no restructuring turns such a call site into one. What decides the shape is the call site, not the SQL — the same `select` is a hook when a component renders its result and a plain function when a mutation branches on it. A read in this shape still lives in `<feature>-data.ts`, still returns through `assertResult(...)`, and is unit-tested exactly like a write: its table, its columns, its filters and their order, and the surfacing of the database error message.

   The worked example is `features/projects`. `findUnchangedDesign` and `findDesignByAsset` in `project-data.ts` are called from `mutation.mutationFn` in `project-action-dialog.tsx` to decide whether the write that follows repeats one already stored. A hook would instead read on render, answering from a cache filled before the upload it is meant to judge, and no component wants the row on screen. The reason is recorded above the two functions and in [`features/projects/README.md`](../../apps/web/features/projects/README.md).

   Prefer a hook wherever the call site allows one. Moving a read into a mutation *in order* to avoid writing a hook is the opposite of this rule: it gives up caching, deduplication and the `enabled` gate, and it is not covered here.

3. **Write paths are exported as plain `async` functions taking `(database, input)`.** They take no hooks internally, so they run outside React and are unit-testable with a stub `{ rpc: vi.fn() }` object — see `credit-data.test.ts` and, e.g.:

   ```ts
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
   ```

   `SupabaseDatabase` (exported from `apps/web/lib/supabase.ts` as `SupabaseClient<Database>`) is the parameter type for every write function — it is the same type `useAuth().database` returns, so no adapter or wrapper is needed at the call site.

   A write function relocates only the `database.rpc(...)` / `database.from(...)` call and the `assertResult(...)` around it. It does not gain new validation, retries or side effects that were not already present at the call site being moved.

4. **Validation, trimming, idempotency-key generation and retry state stay in the component**, because they are tied to form behavior, not to persistence. In `credit-actions.tsx`, the amount parsing, the `[25, 50, 100]` package check, the non-zero-integer check, `note.trim()`, the `attempt` ref and the `crypto.randomUUID()` idempotency key are all still in the component. The data function receives an already-trimmed `note` and an already-generated `idempotencyKey`; it does not trim or generate either itself. If a future feature's mutation is tempted to take an untrimmed value "for convenience," don't — the component is what knows whether a resubmit must reuse a key, and the data function must stay ignorant of that.

5. **The cache keys a feature's writes dirty are declared in that feature's `<feature>-data.ts` and composed at the call site — never spelled out as a string literal in a component.** Rule 1 says where a query lives; this rule is what makes that worth having, because knowing where a read lives matters less than knowing what a write dirties. A component never writes `queryKey: ["credit-account"]`; it composes from the owning feature's exported constant.

   **A call site invalidates exactly its own subset, and no invalidation set may widen.** This is the constraint the rule exists to protect. If a mutation invalidates two keys today it must invalidate exactly those two afterwards; a widened set makes the UI refetch caches it previously did not, which is a behavior change that types, lint and the unit suite all stay green through. Composing from a constant is therefore not licence to reach for the largest available set.

   Two shapes follow from that, and which one a feature uses is decided by its call sites, not by preference:

   - **A named-key record**, when the feature's writes dirty different subsets. `brandQueryKeys` (`brand-data.ts`) and `briefingQueryKeys` (`briefing-data.ts`) are the worked examples. Each key is a named field with a comment naming the read hook it belongs to, and each call site composes only what it dirties — `brand/brand-folder-dialog.tsx` takes `folders` and `assets`, while `brand/draft-editor.tsx` takes only `templateDraft`.
   - **A `<domain>QueryKeys` array plus a `useInvalidate<Domain>()` helper**, when every call site dirties the whole set. `creditQueryKeys`/`useInvalidateCredits()`, `workspaceQueryKeys`/`useInvalidateWorkspace()`, `notificationsQueryKeys`/`useInvalidateNotifications()` and `assetQueryKeys`/`useInvalidateAssets()` are of this shape. `settings-data.ts` splits six ways rather than holding one pair, for the reason its own `README.md` records.

   **An aggregate helper is added only where a call site genuinely invalidates the whole set.** One helper per feature is the wrong default: it widens every call site that dirties a subset. Two cases in this codebase show the test being applied and failing — `briefings/briefing-detail.tsx` keeps `credit-account` and `credit-ledger` as explicit literals because `useInvalidateCredits()` also covers `credit-requests`, which accepting a briefing never touched; and neither `brand` nor `briefings` has an aggregate helper at all, because no write in either dirties its feature's full set. Each refusal is recorded at the call site and above the constant.

   **A key is owned by the feature whose hooks read it, not by the feature whose rows a write changes.** `briefing-brand` is read only by `useBriefingBrand`, so it lives in `briefingQueryKeys` even though `brand/section-editor.tsx` is what dirties it; that call site imports `briefingQueryKeys` rather than declaring a brand-side copy. `board-data.ts` records the same test above `moveProjectPosition` for the `projects` key, and `assets/assets-page.tsx` for reaching `projects` through `useInvalidateWorkspace()`.

   [`features/shared/invalidation-boundary.test.ts`](../../apps/web/features/shared/invalidation-boundary.test.ts) checks the structural half of this directly: that no call site outside a data module invalidates a bare string literal (with an allowlist that must name the call site and the key, and that fails once the call site stops using it), that the one keyless whole-cache clear stays the only one, that the realtime fan-out in `projects/project-events.ts` is pinned, and that the three key constants still hold the exact strings their call sites were measured against.

6. **Components never import the Supabase client to issue a query.** They call `useAuth()` to obtain `database` only to pass it into a data-module read hook or write function; they do not call `.from(`, `.rpc(` or `.storage.` on it directly. `credit-actions.tsx` still calls `useAuth()` for the `database` handle, but only to hand it to `requestCredits`, `adjustCredits` and `reviewCreditRequest` — it never queries with it directly.

## Worked example: `credits`

- `features/credits/credit-data.ts` — all Supabase access for the feature: three `use<Thing>()` read hooks, `creditQueryKeys`, `useInvalidateCredits()`, and three write functions (`requestCredits`, `adjustCredits`, `reviewCreditRequest`).
- `features/credits/credit-data.test.ts` — unit tests for the three write functions against a stub `{ rpc: vi.fn() }`, with no React rendering involved.
- `features/credits/credit-actions.tsx` — the two dialog components. They hold only form state, validation, retry/idempotency logic and rendering; they call the data-module functions and `useInvalidateCredits()`, and hold no query or mutation payload construction beyond what `requestCredits`/`adjustCredits`/`reviewCreditRequest` accept.
- `features/credits/credit-model.ts` / `credit-model.test.ts` — pure domain logic (filtering, CSV export), unrelated to this contract but colocated because it is credits-only.

## Exceptions

A deviation is recorded in the deviating feature's `README.md`, at its smallest possible size, and is linked from the code it applies to. Two cases have come up so far:

- **A read that cannot be a hook** is no longer an exception. It is covered by rule 2 above, because React decides it rather than the feature does. `features/projects` is the worked example and [its `README.md`](../../apps/web/features/projects/README.md) records the two call sites; a later feature meeting the same case follows the rule and needs no new entry here.
- **A write that genuinely cannot be a plain `(database, input)` async function** — for example, one that must read a hook's reactive value mid-mutation — has not been found in any migrated feature. If one appears, document the specific reason in that feature's `README.md` and keep the deviation as small as possible; do not generalize it into a new default pattern here.
