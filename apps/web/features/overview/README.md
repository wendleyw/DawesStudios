# Overview

The welcome dashboards shown right after sign-in: the client Overview (`client-overview-page.tsx`,
this task) and the designer's `/home` (added in a later task). Both read the same pure model in
`overview-model.ts` and share the `OverviewPanel` column component and `overview.css`.

## Client Overview

Route: `/clients/:clientId/overview` (`app/(workspace)/clients/[clientId]/overview/page.tsx`),
rendering `ClientOverviewPage`. It uses `WelcomeHeader`/`welcomeTitle` (`features/shared`) for its
title card and the shared `.overview-stats` tiles for its three numbers.

**The three tiles** (`clientOverview` in `overview-model.ts`):

- **Credits remaining** — the account's current `balance`, with `used`/`total` from the ledger's
  `project_debit` entries (`used` is their sum, `total` is `balance + used`).
- **Active projects** — projects whose status is not `delivered`, with how many of the client's
  delivered projects shipped in the current calendar month (`useDateFormat().formatMonth`, studio
  time zone) as the supporting note.
- **Needs your review** — versions in the client's own **Waiting for you** tab (`inReviewTab`,
  see Isolation below).

**In flight** is a strip below the tiles with three counts: briefings **with the studio**
(`awaiting_review`/`budget_confirmed`), active projects **in progress** (`planned`, `in_progress`,
`internal_review`, `changes_requested`), and projects **delivered** overall.

**Three columns**, left to right, each up to `ROW_LIMIT` (5) rows and a "See all" link:

1. **What's moving** — active projects soonest-due first (`bySoonestDue`), linking to the board.
2. **Your turn** — the client's waiting reviews, oldest first, linking to Reviews.
3. **Recently shipped** — delivered projects, most recently delivered first, linking to the board.

**Studio view**: when `profile.role === "agency"`, the heading reads "What `<client name>` sees"
and the subtitle explains it is the client's own overview — same data, same query, no studio-only
addition, so what the agency sees here is exactly the client's page.

**Designer redirect**: a designer has no Overview destination. If one opens this route by hand, an
effect replaces it with `/clients/:clientId/board` before the data queries are read.

## Isolation

The page renders only client-visible data. Reviews are filtered through the client's own
`inReviewTab("waiting", row, "client")` rule (`features/reviews/review-data.ts`), which drops every
`internal` row for every viewer — including the studio's "What `<client>` sees" rendering of this
same page. No designer identity, assignment or internal note reaches this page. Designers never see
credits: their queries (`useCreditAccount`/`useCreditLedger`) are disabled for the `designer` role,
and this page redirects designers away before rendering the tiles regardless.

## Files

- `overview-model.ts` — pure functions and types (`clientOverview`, `deliveredOn`, `relativeAge`,
  `bySoonestDue`, `ROW_LIMIT`, plus the designer-only `designerOverview`/`designerVersions` used by
  `/home`). No Supabase import; every input is a plain value the page already has.
- `overview-data.ts` — added in a later task, once `/home` needs a designer-scoped read this
  feature does not yet have. The client Overview page above reads entirely through hooks other
  features already own (`useClients`, `useProjects`, `useBriefings`, `useCreditAccount`,
  `useCreditLedger`, `useReviews`).
- `overview-panel.tsx` — `OverviewPanel`, the one-column-of-rows layout both dashboards share.
- `overview.css` — `.overview-page`, `.overview-flight`, `.overview-columns`, `.overview-panel*`,
  `.overview-row*`, `.overview-empty`.

`deliveredOn(project)` returns `delivered_at` when set, and falls back to `updated_at` for the
older rows recorded before that column existed — so "Recently shipped" always has a date to sort
and display by.

## Verification

```bash
npx vitest run features/overview features/shared/stylesheet-boundary.test.ts features/shared/theme-colors.test.ts
npm run check
```
