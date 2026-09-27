# Monthly credits

Date: 2026-09-27. Status: approved in conversation; written-spec review pending.

## Intent

Clients buy a monthly allowance of credits. A project consumes the credits of the month it
belongs to, which may be the current month or any future month. When a project is delivered and
its deliverables are counted, the agency settles its final cost. The model must stay unambiguous
for the client: what is available this month, what was used, what expires, and what each project
cost and why.

### Decisions taken with the user

- **Plan and extras.** Each client has a monthly plan (a number of credits per month, from a
  start month) set by the agency. The agency can add extras to a specific month and transfer
  credits between months.
- **Expiry.** Credits left in a month expire when it ends.
- **Project month.** The agency picks a project's month when accepting its briefing. The default
  is the due-date month, and the agency can move the project to another current or future month
  later.
- **Final settlement.** At delivery, the agency enters the project's final total and a reason the
  client sees.
  - Extra cost comes from the current month. If the current month is short, the agency sees the
    shortfall and chooses between adding an extra and charging a future month.
  - A refund goes to the **current** month (not the project's month, which may have expired).
- **Expiry notice.** Clients see what expires and when, before a month ends.
- **Migration.** Today's balance of each client becomes the current month's (September 2026)
  balance.

## Data model

- `public.credit_plans`: `client_id`, `monthly_credits` (integer, at least 0), `starts_on` (the
  first day of a month), `created_by`, `created_at`. The plan in force for month M is the row with
  the greatest `starts_on` ≤ M. A plan change never rewrites a month that already received its
  allowance.
- `public.credit_months`: `client_id`, `month` (the first day), `balance` (integer, at least 0),
  `status` (`open` or `expired`), `updated_at`, with primary key `(client_id, month)`. A row is
  created on demand by `private.ensure_credit_month(client, month)`, which grants the plan's
  allowance once and records it in the ledger.
- `public.credit_ledger` gains `month date not null` and new kinds: `plan_allowance`, `extra`,
  `transfer_out`, `transfer_in`, `final_adjustment` and `expiry`, next to `project_debit`,
  `allocation` and `adjustment`. `balance_after` becomes the month's balance after the entry. The
  ledger stays immutable and idempotent (`idempotency_key` unique).
- `public.projects.credit_month date` (not null for accepted projects). There is also a
  `public.project_settlements` row (`project_id` primary key, `final_credits`, `difference`,
  `reason`, `charged_month`, `settled_by`, `settled_at`): one settlement per project.
- `credit_accounts.balance` is kept for compatibility as the current month's balance, maintained
  by the same functions, or replaced by a view. The plan chooses one and removes the other.

### Rules

- **Past months.** Only the current month and future months accept debits, extras and incoming
  transfers.
- **Expiry.** On the first write or read that touches a client after a month ends,
  `private.expire_credit_months(client)` writes an `expiry` entry for any leftover in each ended
  month and marks it `expired`. The expiry is idempotent and needs no scheduler.
- **Row locks.** Every write locks the affected `credit_months` rows in (client, month) order, so
  there are no deadlocks, and rejects any month balance that would go below 0.
- **Access.**
  - The agency can call every function.
  - A client reads its own months, ledger, plan and settlements; for plans it reads only
    `monthly_credits` and `starts_on`.
  - Designers see nothing about credits (unchanged).

## Functions (security definer, `search_path=''`, agency only unless noted)

- `set_credit_plan(client, monthly_credits, starts_on)`: `starts_on` must be the current month or
  later.
- `add_month_extra(client, month, amount, reason, idempotency_key)`: `amount > 0`; the month is
  current or future.
- `transfer_month_credits(client, from_month, to_month, amount, reason, idempotency_key)`: both
  months are current or future and `from` has enough credits.
- `accept_briefing(briefing, month default due-date month)`: the existing atomic accept, now
  debiting the chosen month. It rejects an insufficient balance or a past month. It stays
  idempotent under retries and concurrency, as CLAUDE.md requires.
- `move_project_month(project, to_month, idempotency_key)`: refunds the old month (if it is still
  open) and debits the new one in one transaction. If the old month has expired, it debits the new
  month only after the agency confirms the full charge (the function takes
  `p_charge_full boolean`).
- `settle_project_credits(project, final_credits, reason, charge_month default null,
  idempotency_key)`:
  - the difference is `final_credits` minus the credits already charged;
  - when the difference is above 0, it debits `charge_month`, or the current month if that is
    null, and raises `insufficient_month_credits` with the shortfall when the month is short;
  - when it is below 0, it refunds the current month;
  - at most once per project (the same key returns the same result);
  - allowed from `approved` or `delivered`.
- `credit_month_summary(client, month)` (agency and client): returns available, allowance, extras,
  used, transferred, expiring and `expires_on`.
- `adjust_credits`, `request_credits`, `fulfill_credit_request` and `reject_credit_request` keep
  their behavior, applied to the current month. A fulfilled request becomes an `extra` in the
  current month.

## Screens

- **Credits page:**
  - a month switcher (current ± 11 months);
  - a month card with available, used, extras, and "N credits expire on <date>" when above 0;
  - the ledger filtered by month;
  - agency actions: Set plan, Add extra, Transfer between months. The client sees no mechanics
    beyond its own figures and project costs.
- **Accepting a briefing:** a Month select (current and future months, each with its available
  balance). The default is the due-date month, and the agency sees a warning when the chosen
  month is short.
- **Project details:**
  - "Credits: N · <Month>";
  - for the agency, "Move to another month";
  - at approval or delivery, "Settle final credits" (final total, reason, and a charge-month
    choice when there is a shortfall);
  - the client sees the settlement line and its reason.
- **Header credits chip and account menu:** the current month's available credits, with the
  expiring amount when a month is about to end (in its last 7 days).

## Testing

- **pgTAP:**
  - plan resolution and one-time allowance;
  - extras and transfers, including past-month refusal;
  - acceptance per month under concurrency (two sessions, one month) and idempotency;
  - a move between months, including an expired origin;
  - settlement with extra cost (current month, charge month, shortfall error), with a refund to
    the current month, and once only;
  - expiry is written once;
  - role access (a client reads its own records only, designers read nothing);
  - migration of today's balances into September 2026.
- **Unit:** the model helpers for month math (UTC month boundaries), the summaries, and the forms
  by role.
- **E2E:**
  - the agency sets a plan and accepts a briefing for a future month, and the client sees that
    month's balance drop;
  - a project is moved;
  - a project is settled with a reason;
  - the client sees the expiring notice.
- **CLAUDE.md / AGENTS.md:** the budget-acceptance rule is restated per month. Credits docs and
  the acceptance matrix are updated.

## Out of scope

- Payments and invoicing (unchanged: there is no payment gateway).
- Per-deliverable counting UI (the final total is entered as one number with a reason).
