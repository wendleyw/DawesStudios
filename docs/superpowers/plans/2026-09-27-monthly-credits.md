# Monthly Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credits are held per client per month:
- a monthly plan, extras and transfers;
- expiry at month end;
- projects debit the month the agency picks, can move between months, and are settled once at the
  end with a reason.

**Architecture:**
- Database: a `credit_months` balance row per (client, month), locked in (client, month) order,
  plus `credit_plans`. The immutable `credit_ledger` gains a `month` column and new kinds. Every
  write is an atomic, idempotent, security definer function. Expiry is applied lazily.
- Web: the `features/credits` data and UI, the acceptance dialog in `features/briefings`, Project
  details, and the header chip read and write only through `credit-data.ts` / `briefing-data.ts` /
  `project-data.ts`.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pgTAP), Next.js / React 19 / TanStack Query
(Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-27-monthly-credits-design.md`

## Global Constraints

- **Language:** English only in code, copy and docs. Chat with the user is in pt-BR.
- **Migrations:** never run `supabase migration down` or `supabase db reset`. Apply with
  `supabase migration up --local` and fix forward. Use the numbers `202609270003`,
  `202609270004`, and so on; check `ls supabase/migrations | tail` first, because parallel work
  may have taken a number.
- **Local data:** the SABRE overlay (10 clients, 68 projects) must survive. Today's balances
  migrate into September 2026.
- **Budget acceptance:** it must atomically create one project and one debit, reject an
  insufficient balance (now per month), and stay idempotent under retries and concurrent
  requests.
- **Access:** designers see nothing about credits. A client sees only its own credits.
- **Parallel work:** other agents may work in this tree at the same time. Commit only with
  explicit pathspecs (`git add` new files first), check `git show --stat HEAD`, and never touch
  files outside your task's list.
- **Commits:** every commit ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Gates:**
  - SQL: `supabase test db`. Only the known SABRE-overlay count failures in
    `access_and_workflows` (2,4,9,18,32,54) may remain.
  - Web: `cd apps/web && npm run check`.

## Review Focus

1. **Concurrency:** two acceptances or settlements racing on the same month must never drive a
   balance below 0 or double-debit.
2. **Month boundaries:** month math uses UTC first-of-month dates, consistently in SQL and
   TypeScript. A request made at 23:59 on the last day must not land in the wrong month.
3. **Expiry and past months:** expiry is written exactly once per ended month. A past month never
   receives new debits, extras or transfers.
4. **Settlement:** it runs once per project. A repeated call with the same key returns the same
   result, and a different key is refused.
5. **Client screens:** the client never sees agency-only mechanics (plan edits, transfers), and
   the expiry notice shows only while the amount is above 0.

---

### Task 1: Database

**Files:** `supabase/migrations/202609270003_monthly_credits.sql` (a
`202609270004_…` fix-forward if needed), a new `supabase/tests/database/monthly_credits.test.sql`,
the existing credit tests updated for the new columns, and `supabase/database.types.ts`
regenerated.

- **Schema:**
  - `credit_plans` and `credit_months`;
  - `credit_ledger.month` (backfill: every existing row gets its `created_at` month; balances
    migrate to September 2026, the current month) and the new kinds;
  - `projects.credit_month` (backfill: each accepted project's debit month);
  - `project_settlements`.
- **Private helpers:**
  - `private.month_of(timestamptz|date)`, which returns the first day in UTC;
  - `private.ensure_credit_month(client, month)`, which grants the plan allowance once, as a
    `plan_allowance` ledger row;
  - `private.expire_credit_months(client)`.
- **Public functions:** exactly as in the spec, with `accept_briefing` extended by
  `p_month date default null`.
  - Keep the old signature's callers working: the default is the due-date month, or the current
    month when there is no due date.
  - Existing `adjust_credits`, `request_credits`, `fulfill_credit_request` and
    `reject_credit_request` apply to the current month.
- **Row-level security, as in the spec.** Revoke from `public` and `anon`; grant `authenticated`.
  Keep `credit_accounts.balance` in sync as the current month's balance (the simplest
  compatible choice), so the existing screens keep working until Task 2.
- **Tests (write first):** every item in the spec's pgTAP list. For concurrency, use two
  `dblink` sessions if the extension is available; otherwise assert the lock order and the
  `balance >= 0` constraint.

- [ ] Write the tests, apply the migration and run the gates. Commit
  `feat(db): hold credits per client per month with plans, expiry and settlement`.

### Task 2: Credits page and data

**Files:** `apps/web/features/credits/*` (`credit-data.ts`, `credit-model.ts`, `credits-page.tsx`,
`credit-actions.tsx`, `credit-meter.tsx`, CSS, tests, README) and `features/workspace/account-menu.tsx`
if the chip lives there.

- **Data:** `useCreditMonthSummary(clientId, month)`, the ledger filtered by month,
  `setCreditPlan`, `addMonthExtra` and `transferMonthCredits`, each with an idempotency key held
  by the component.
- **Page:**
  - a month switcher (current ± 11), with the month card and the expiry notice;
  - the ledger by month;
  - agency actions: Set plan, Add extra, Transfer.
- **Chip and account menu:** the current month's available credits, and the expiring amount in a
  month's last 7 days.
- **CSV export** includes the month.

- [ ] Tests first, then implement and run `npm run check`. Commit
  `feat(credits): show and manage credits by month`.

### Task 3: Acceptance month, project month and settlement

**Files:**
- `apps/web/features/briefings/briefing-detail.tsx` and `briefing-data.ts`: a Month select in
  `BudgetReview`, showing each current or future month's available credits and a shortfall
  warning; `acceptBriefing` passes `p_month`.
- `apps/web/features/projects/project-details.tsx` and `project-data.ts`:
  - a "Credits: N · Month" line;
  - for the agency, "Move to another month" (a dialog with confirmation, plus the expired-origin
    full-charge confirmation);
  - "Settle final credits" at approved or delivered (final total, reason, and the charge-month
    choice when the function reports a shortfall);
  - the settlement line for everyone who can see credits.
- The tests and READMEs of both features.

- [ ] Tests first, then implement, run `npm run check`, and commit
  `feat(projects): pick, move and settle a project's credit month`.

### Task 4: E2E, rules and docs

- **New spec:** `apps/web/tests/e2e/monthly-credits.spec.ts`, as described in the spec's E2E list,
  on a fixture client. Clean up every ledger, month, plan and settlement row it creates.
- **Existing specs:** update `intake-admin.spec.ts`, `project-credits.spec.ts` and any spec that
  asserts balances.
- **CLAUDE.md and AGENTS.md** (kept identical): restate the budget-acceptance rule per month.
- **Docs:** `docs/architecture/backend.md` (the credits section), the credits README,
  `docs/architecture/acceptance-matrix.md` if it names the credit rules, and the handoff.

- [ ] Run the new and updated specs and `npm run check`. Commit
  `test(e2e): cover monthly credits` and `docs: document monthly credits`.
