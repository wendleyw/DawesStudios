-- Fix-forward for 202609270003_monthly_credits.sql: its first-day-of-month CHECK constraints called
-- private.month_of, which only definer functions may execute, so any direct `update public.projects`
-- by the agency (the `projects_edit` policy) failed with "permission denied for function month_of".
-- The same rule is now written inline, with no function dependency.
alter table public.projects drop constraint projects_credit_month_check;
alter table public.projects add constraint projects_credit_month_check
  check (extract(day from credit_month) = 1);
alter table public.credit_plans drop constraint credit_plans_starts_on_check;
alter table public.credit_plans add constraint credit_plans_starts_on_check
  check (extract(day from starts_on) = 1);
alter table public.credit_months drop constraint credit_months_month_check;
alter table public.credit_months add constraint credit_months_month_check
  check (extract(day from month) = 1);
alter table public.credit_ledger drop constraint credit_ledger_month_first_day;
alter table public.credit_ledger add constraint credit_ledger_month_first_day
  check (extract(day from month) = 1);
alter table public.project_settlements drop constraint project_settlements_charged_month_check;
alter table public.project_settlements add constraint project_settlements_charged_month_check
  check (extract(day from charged_month) = 1);
