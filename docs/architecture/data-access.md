# Data-access contract

This document is the contract every feature module follows for talking to Supabase. `features/credits/` is the worked example; new features must match its shape, not merely resemble it.

## Rules

1. **Supabase queries live only in `features/<feature>/<feature>-data.ts`.** No other file in the feature — page, dialog, form component — imports `@supabase/supabase-js` types to build a query or calls `.from(`, `.rpc(` or `.storage.` directly. `credit-data.ts` is the only file in `features/credits/` that touches the database; verify a feature's `.tsx` files with:

   ```sh
   grep -rc '\.from(\|\.rpc(\|\.storage\.' features/<feature>/*.tsx
   ```

   Every result must be `0`.

2. **Read paths are exported as `use<Thing>()` hooks wrapping `useQuery`.** See `useCreditAccount`, `useCreditLedger` and `useCreditRequests` in `credit-data.ts`. Each hook owns its query key, its `enabled` gate and its `assertResult(...)` cast; components consume the hook and never see the underlying `database.from(...)` call.

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

5. **Each feature exports one `<feature>QueryKeys` set and one `useInvalidate<Feature>()` helper**, rather than repeating an invalidation array at every mutation's `onSuccess`. See `creditQueryKeys` and `useInvalidateCredits()` in `credit-data.ts`. A component calls `useInvalidateCredits()` once and awaits it in `onSuccess`; it does not spell out `["credit-account", "credit-ledger", ...]` itself. This also means the query keys a feature invalidates are defined in exactly one place, not duplicated across every component that mutates that feature's data.

6. **Components never import the Supabase client to issue a query.** They call `useAuth()` to obtain `database` only to pass it into a data-module read hook or write function; they do not call `.from(`, `.rpc(` or `.storage.` on it directly. `credit-actions.tsx` still calls `useAuth()` for the `database` handle, but only to hand it to `requestCredits`, `adjustCredits` and `reviewCreditRequest` — it never queries with it directly.

## Worked example: `credits`

- `features/credits/credit-data.ts` — all Supabase access for the feature: three `use<Thing>()` read hooks, `creditQueryKeys`, `useInvalidateCredits()`, and three write functions (`requestCredits`, `adjustCredits`, `reviewCreditRequest`).
- `features/credits/credit-data.test.ts` — unit tests for the three write functions against a stub `{ rpc: vi.fn() }`, with no React rendering involved.
- `features/credits/credit-actions.tsx` — the two dialog components. They hold only form state, validation, retry/idempotency logic and rendering; they call the data-module functions and `useInvalidateCredits()`, and hold no query or mutation payload construction beyond what `requestCredits`/`adjustCredits`/`reviewCreditRequest` accept.
- `features/credits/credit-model.ts` / `credit-model.test.ts` — pure domain logic (filtering, CSV export), unrelated to this contract but colocated because it is credits-only.

## Exception

None identified yet for this feature. If a later feature has a write path that genuinely cannot be a plain `(database, input)` async function — for example, one that must read a hook's reactive value mid-mutation — document the specific reason in that feature's `README.md` and keep the deviation as small as possible; do not generalize the exception into a new default pattern here.
