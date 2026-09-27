# Credits

The Credits page uses the shared floating client navigation/profile and white title/action card on
the plain page background, with the balance/report tabs and Export CSV inside that header card, the
same placement Briefings uses for its own filters. Activity and credit requests render as one-line
rows in bordered list cards, matching the Briefings and Reviews row style; clicking an activity row
opens the credit details dialog, and an agency's pending request keeps its Review button inline. The
layout follows the same desktop/mobile gutters as other client sections, with each row dropping to
two lines on phones, without changing billing or export behavior.

This feature displays a real Supabase credit account, immutable ledger and additional-credit requests. Agency and client sessions read only backend-authorized records; designers have no credit interface.

- `credit-data.ts` is the feature's only Supabase access point. It reads the account, requests and complete ledger in bounded pages, avoiding the default query row limit when exporting a longer history, via `useCreditAccount`, `useCreditRequests` and `useCreditLedger`. It also exports the three write functions — `requestCredits`, `adjustCredits`, `reviewCreditRequest` — each a plain `async (database, input)` function unit-tested in `credit-data.test.ts` without React, plus `creditQueryKeys` and `useInvalidateCredits()` for post-mutation cache invalidation.
- `credit-model.ts` filters ledger activity by UTC period, campaign, project, type and search. It builds a CSV containing the reference report columns, quote explanation and deliverable breakdown. User text is quoted and formula-like cells are neutralized; numeric negative debits remain numbers. `formatCredits(count)` is the one place a credit count becomes words — the grouped number and its unit, singular only for exactly one — shared by the account menu's Credits block, the project chip below and the client Overview's per-project credit line (`features/overview/client-overview-page.tsx`), instead of each declaring its own `Intl.NumberFormat` and singular/plural ternary.
- `credits-page.tsx` renders balance/activity and a client report, scoped filters, downloadable CSV, details and request status. A `?project=` deep link opens the relevant project report.
- `credit-actions.tsx` creates 25/50/100 credit requests, reviews fulfillment/decline, and records agency adjustments by calling `requestCredits`/`adjustCredits`/`reviewCreditRequest` from `credit-data.ts`; it holds no direct Supabase call. It keeps the amount parsing/validation, the package check, note trimming, and the adjustment idempotency key (an `attempt` ref plus `crypto.randomUUID()`) reused for retries of the same payload; changing the payload creates a new key. Fulfillment relies on the backend's idempotent transaction.
- `credit-meter.tsx` supplies the credits part of the header's account menu (`features/workspace/account-menu.tsx`), not this feature's own page. `useCreditMeter(clientId, viewer)` combines `useCreditAccount()` with `useLatestTopUp()` — the `balance_after` of the client's most recent positive `allocation` or `adjustment` row (agency allocations and fulfilled requests are both recorded as adjustments) — into the balance, a 0–1 `ratio` from `creditRemainingRatio` in `credit-model.ts`, and an `attention` flag for a balance at or below zero. It returns null for a designer, a null viewer, a loading account or an error, never a stale or placeholder amount; the ratio is null until a top-up exists, and then the menu shows the number without a ring or dot bar. `CreditRing` draws the share left around the avatar; `CreditMeterPanel` shows "N left" linking to `/clients/:id/credits`, a 24-dot bar for the same share, and one role action — **Request credits** for a client, **Adjust credits** for the agency — which the menu opens as the existing `CreditActionDialog`. Its styles live in `credit-meter.css`, imported by the component, because `credits.css` only loads on the Credits route.

- `project-credits-chip.tsx` shows the credits a project used in the right corner of its title card (`features/projects/project-header.tsx`), so a client knows what the project is worth. It is information only, not a link, and reads `useProjectCreditUse(projectId)`: the project's `project_debit` ledger rows, summed as a positive number by `projectCreditsUsed` in `credit-model.ts` (every project has exactly one, written when its budget is accepted). The query key starts with `credit-ledger`, so every existing ledger invalidation refreshes it. It renders nothing for a designer, a null viewer, a loading or failed read, or a project without a debit, and the hook waits for the profile so a designer's page never sends the request. Its base look is `credit-chip.css`; on phones the word "credits" is visually hidden but still read.

Routes live under `app/(workspace)/clients/[clientId]/credits/`; feature styles are in `credits.css`. Shared dialogs use Modal. Mutations call `useInvalidateCredits()` after success, which invalidates the account/ledger/request/notification queries. Errors are shown without changing local balances or claiming an allocation succeeded.

See [the data-access contract](../../../../docs/architecture/data-access.md) for the rules this feature's `credit-data.ts` / `credit-actions.tsx` split follows, cited there as the worked example for every other feature.

A client request does not grant credits or collect payment. Agency allocation is an explicit accounting action with a reason. There is no payment gateway or fabricated payment confirmation. Negative adjustments represent corrections and are still subject to backend balance and authorization checks.

Verification from `apps/web`:

```sh
npm run test -- features/credits/credit-model.test.ts features/credits/credit-meter.test.tsx features/credits/project-credits-chip.test.tsx
npm run test:e2e -- tests/e2e/intake-admin.spec.ts tests/e2e/project-credits.spec.ts
npm run typecheck
./node_modules/.bin/eslint features/credits 'app/(workspace)/clients/[clientId]/credits'
```

Focused tests cover combined filters, UTC boundaries, signed activity, CSV scope/columns/escaping and formula injection. Account reconciliation, role isolation, concurrent acceptance/adjustment and authenticated request fulfillment require the separate database/browser evidence tracked in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).
