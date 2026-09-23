# Credits

The Credits page uses the shared floating client navigation/profile and white title/action card
on the workspace grid. Balance, requests, ledger/report tabs and accounting actions remain in their
existing content panels below. The layout follows the same desktop/mobile gutters as other client
sections without changing billing or export behavior.

This feature displays a real Supabase credit account, immutable ledger and additional-credit requests. Agency and client sessions read only backend-authorized records; designers have no credit interface.

- `credit-data.ts` is the feature's only Supabase access point. It reads the account, requests and complete ledger in bounded pages, avoiding the default query row limit when exporting a longer history, via `useCreditAccount`, `useCreditRequests` and `useCreditLedger`. It also exports the three write functions — `requestCredits`, `adjustCredits`, `reviewCreditRequest` — each a plain `async (database, input)` function unit-tested in `credit-data.test.ts` without React, plus `creditQueryKeys` and `useInvalidateCredits()` for post-mutation cache invalidation.
- `credit-model.ts` filters ledger activity by UTC period, campaign, project, type and search. It builds a CSV containing the reference report columns, quote explanation and deliverable breakdown. User text is quoted and formula-like cells are neutralized; numeric negative debits remain numbers.
- `credits-page.tsx` renders balance/activity and a client report, scoped filters, downloadable CSV, details and request status. A `?project=` deep link opens the relevant project report.
- `credit-actions.tsx` creates 25/50/100 credit requests, reviews fulfillment/decline, and records agency adjustments by calling `requestCredits`/`adjustCredits`/`reviewCreditRequest` from `credit-data.ts`; it holds no direct Supabase call. It keeps the amount parsing/validation, the package check, note trimming, and the adjustment idempotency key (an `attempt` ref plus `crypto.randomUUID()`) reused for retries of the same payload; changing the payload creates a new key. Fulfillment relies on the backend's idempotent transaction.

Routes live under `app/(workspace)/clients/[clientId]/credits/`; feature styles are in `credits.css`. Shared dialogs use Modal. Mutations call `useInvalidateCredits()` after success, which invalidates the account/ledger/request/notification queries. Errors are shown without changing local balances or claiming an allocation succeeded.

See [the data-access contract](../../../../docs/architecture/data-access.md) for the rules this feature's `credit-data.ts` / `credit-actions.tsx` split follows, cited there as the worked example for every other feature.

A client request does not grant credits or collect payment. Agency allocation is an explicit accounting action with a reason. There is no payment gateway or fabricated payment confirmation. Negative adjustments represent corrections and are still subject to backend balance and authorization checks.

Verification from `apps/web`:

```sh
npm run test -- features/credits/credit-model.test.ts
npm run test:e2e -- tests/e2e/intake-admin.spec.ts
npm run typecheck
./node_modules/.bin/eslint features/credits 'app/(workspace)/clients/[clientId]/credits'
```

Focused tests cover combined filters, UTC boundaries, signed activity, CSV scope/columns/escaping and formula injection. Account reconciliation, role isolation, concurrent acceptance/adjustment and authenticated request fulfillment require the separate database/browser evidence tracked in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).
