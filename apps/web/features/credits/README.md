# Credits

This feature displays a real Supabase credit account, immutable ledger and additional-credit requests. Agency and client sessions read only backend-authorized records; designers have no credit interface.

- `credit-data.ts` reads the account, requests and complete ledger in bounded pages, avoiding the default query row limit when exporting a longer history.
- `credit-model.ts` filters ledger activity by UTC period, campaign, project, type and search. It builds a CSV containing the reference report columns, quote explanation and deliverable breakdown. User text is quoted and formula-like cells are neutralized; numeric negative debits remain numbers.
- `credits-page.tsx` renders balance/activity and a client report, scoped filters, downloadable CSV, details and request status. A `?project=` deep link opens the relevant project report.
- `credit-actions.tsx` creates 25/50/100 credit requests, reviews fulfillment/decline, and records agency adjustments through backend RPCs. Adjustment retries reuse an idempotency key for the same payload; changing the payload creates a new key. Fulfillment relies on the backend's idempotent transaction.

Routes live under `app/(workspace)/clients/[clientId]/credits/`; feature styles are in `credits.css`. Shared dialogs use Modal. Mutations invalidate account/ledger/request/notification queries after success. Errors are shown without changing local balances or claiming an allocation succeeded.

A client request does not grant credits or collect payment. Agency allocation is an explicit accounting action with a reason. There is no payment gateway or fabricated payment confirmation. Negative adjustments represent corrections and are still subject to backend balance and authorization checks.

Verification from `apps/web`:

```sh
npm run test -- features/credits/credit-model.test.ts
npm run test:e2e -- tests/e2e/intake-admin.spec.ts
npm run typecheck
./node_modules/.bin/eslint features/credits 'app/(workspace)/clients/[clientId]/credits'
```

Focused tests cover combined filters, UTC boundaries, signed activity, CSV scope/columns/escaping and formula injection. Account reconciliation, role isolation, concurrent acceptance/adjustment and authenticated request fulfillment require the separate database/browser evidence tracked in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).
