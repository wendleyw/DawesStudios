-- Monthly credits (docs/superpowers/specs/2026-09-27-monthly-credits-design.md).
--
-- Credits are now held per client per calendar month (UTC). A client has a monthly plan, set by the
-- agency, whose allowance is granted once per month; the agency can add extras to a month and
-- transfer credits between months. Credits left in a month expire when it ends. A project belongs
-- to one month (`projects.credit_month`), can move to another, and is settled once at approval or
-- delivery against its final total.
--
-- Compatibility: `credit_accounts.balance` stays, maintained by every write as the current month's
-- balance, so screens that read it keep working. `adjust_credits`, `request_credits`,
-- `fulfill_credit_request` and `reject_credit_request` keep their signatures and apply to the
-- current month. `accept_briefing` gains `p_month date default null`; a caller that omits it charges
-- the due-date month, or the current month when there is no due date or it has already passed.
--
-- Locking: every write first locks the client's `credit_accounts` row (created on demand), which
-- serializes all credit writes of one client, and then locks its `credit_months` rows in ascending
-- month order: ended months (expiry), the current month, then the future months it touches. Writes
-- that carry an idempotency key take its advisory lock before any row lock.

-- Month helpers ------------------------------------------------------------------------------------

create function private.month_of(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select pg_catalog.date_trunc('month', p_at at time zone 'UTC')::date
$$;
create function private.month_of(p_day date) returns date
language sql immutable set search_path = '' as $$
  select pg_catalog.date_trunc('month', p_day::timestamp)::date
$$;
create function private.current_month() returns date
language sql stable set search_path = '' as $$
  select private.month_of(pg_catalog.now())
$$;
revoke execute on function private.month_of(timestamptz), private.month_of(date), private.current_month()
  from public, anon, authenticated;

-- Tables -------------------------------------------------------------------------------------------

create table public.credit_plans (
  client_id uuid not null references public.clients,
  monthly_credits integer not null check (monthly_credits >= 0),
  starts_on date not null check (starts_on = private.month_of(starts_on)),
  created_by uuid references public.profiles default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (client_id, starts_on)
);
alter table public.credit_plans enable row level security;
revoke all on public.credit_plans from public, anon, authenticated;
-- A client reads only the figures of its plans, not who set them.
grant select (client_id, monthly_credits, starts_on) on public.credit_plans to authenticated;
create policy credit_plans_read on public.credit_plans for select to authenticated
  using (private.is_agency() or private.is_client_member(client_id));

create table public.credit_months (
  client_id uuid not null references public.clients,
  month date not null check (month = private.month_of(month)),
  balance integer not null default 0 check (balance >= 0),
  status text not null default 'open' check (status in ('open', 'expired')),
  updated_at timestamptz not null default now(),
  primary key (client_id, month)
);
alter table public.credit_months enable row level security;
revoke all on public.credit_months from public, anon, authenticated;
grant select on public.credit_months to authenticated;
create policy credit_months_read on public.credit_months for select to authenticated
  using (private.is_agency() or private.is_client_member(client_id));

-- The ledger gains its month and the new kinds. Existing rows take their created_at month; the
-- immutability trigger is paused for this backfill only.
alter table public.credit_ledger add column month date;
alter table public.credit_ledger disable trigger immutable_credit_ledger;
update public.credit_ledger set month = private.month_of(created_at);
alter table public.credit_ledger enable trigger immutable_credit_ledger;
alter table public.credit_ledger alter column month set not null;
alter table public.credit_ledger add constraint credit_ledger_month_first_day check (month = private.month_of(month));
alter table public.credit_ledger drop constraint credit_ledger_kind_check;
alter table public.credit_ledger drop constraint credit_ledger_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in (
  'allocation', 'project_debit', 'adjustment', 'plan_allowance', 'extra', 'transfer_out',
  'transfer_in', 'final_adjustment', 'expiry', 'project_refund'));
alter table public.credit_ledger add constraint credit_ledger_kind_shape check (
  (kind = 'project_debit' and amount < 0 and project_id is not null)
  or (kind = 'project_refund' and amount > 0 and project_id is not null)
  or (kind = 'final_adjustment' and project_id is not null)
  or (kind in ('plan_allowance', 'extra', 'transfer_in') and amount > 0 and project_id is null)
  or (kind in ('transfer_out', 'expiry') and amount < 0 and project_id is null)
  or (kind in ('allocation', 'adjustment') and project_id is null));
-- A moved project has a debit in each month it belonged to; only the acceptance debit is unique.
drop index public.one_debit_per_project;
create unique index one_acceptance_debit_per_project on public.credit_ledger(project_id)
  where kind = 'project_debit' and idempotency_key like 'briefing:%';
create index ledger_client_month on public.credit_ledger(client_id, month, created_at);

-- Direct inserts (the seed, test fixtures) may omit the month; it is then the created_at month.
create function private.default_ledger_month() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.month is null then new.month := private.month_of(new.created_at); end if;
  return new;
end
$$;
revoke execute on function private.default_ledger_month() from public, anon, authenticated;
create trigger default_ledger_month before insert on public.credit_ledger
  for each row execute function private.default_ledger_month();

alter table public.projects add column credit_month date check (credit_month = private.month_of(credit_month));
alter table public.projects disable trigger project_updated_at;
update public.projects p set credit_month = l.month
  from public.credit_ledger l
  where l.project_id = p.id and l.kind = 'project_debit' and p.credit_month is null;
alter table public.projects enable trigger project_updated_at;

-- A seeded acceptance debit gives its project a month when the project row has none.
create function private.default_project_credit_month() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set credit_month = new.month
    where id = new.project_id and credit_month is null;
  return null;
end
$$;
revoke execute on function private.default_project_credit_month() from public, anon, authenticated;
create trigger default_project_credit_month after insert on public.credit_ledger
  for each row when (new.kind = 'project_debit') execute function private.default_project_credit_month();

create table public.project_settlements (
  project_id uuid primary key references public.projects,
  final_credits integer not null check (final_credits >= 0),
  difference integer not null,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  charged_month date check (charged_month = private.month_of(charged_month)),
  settled_by uuid references public.profiles default auth.uid(),
  settled_at timestamptz not null default now(),
  idempotency_key text not null unique,
  check ((difference = 0) = (charged_month is null))
);
alter table public.project_settlements enable row level security;
revoke all on public.project_settlements from public, anon, authenticated;
grant select (project_id, final_credits, difference, reason, charged_month, settled_at)
  on public.project_settlements to authenticated;
create policy project_settlements_read on public.project_settlements for select to authenticated
  using (private.is_agency() or exists (
    select 1 from public.projects p where p.id = project_id and private.is_client_member(p.client_id)));

-- Today's balances become the current month's (September 2026 when this migration was written).
insert into public.credit_months(client_id, month, balance)
  select client_id, private.current_month(), balance from public.credit_accounts
  on conflict do nothing;

-- An account inserted directly (the seed, test fixtures) opens its current month with its balance.
create function private.open_account_month() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.credit_months(client_id, month, balance)
    values (new.client_id, private.current_month(), new.balance)
    on conflict do nothing;
  return null;
end
$$;
revoke execute on function private.open_account_month() from public, anon, authenticated;
create trigger open_account_month after insert on public.credit_accounts
  for each row execute function private.open_account_month();

-- Private helpers ----------------------------------------------------------------------------------

create function private.plan_allowance(p_client uuid, p_month date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select monthly_credits from public.credit_plans
    where client_id = p_client and starts_on <= private.month_of(p_month)
    order by starts_on desc limit 1), 0)
$$;

create function private.assert_open_month(p_month date) returns date
language plpgsql stable set search_path = '' as $$
begin
  if p_month is null then raise exception 'A month is required'; end if;
  if private.month_of(p_month) < private.current_month() then
    raise exception 'Choose the current month or a later one';
  end if;
  return private.month_of(p_month);
end
$$;

-- Writes an expiry entry for the leftover of every ended month and marks it expired. Idempotent;
-- `p_today` lets a caller evaluate expiry as of another day.
create function private.expire_credit_months(p_client uuid, p_today date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cutoff date := private.month_of(coalesce(p_today, (pg_catalog.now() at time zone 'UTC')::date));
  ended record;
  expired_count integer := 0;
begin
  for ended in
    select month, balance from public.credit_months
    where client_id = p_client and month < cutoff and status = 'open'
    order by month for update
  loop
    if ended.balance > 0 then
      insert into public.credit_ledger(client_id, amount, balance_after, kind, description, idempotency_key, month)
        values (p_client, -ended.balance, 0, 'expiry', 'Unused credits expired at the end of the month',
                'expiry:' || p_client || ':' || ended.month, ended.month)
        on conflict (idempotency_key) do nothing;
    end if;
    update public.credit_months set balance = 0, status = 'expired', updated_at = pg_catalog.now()
      where client_id = p_client and month = ended.month;
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end
$$;

-- Creates the month on demand, locks it, and grants the plan allowance once (the ledger key is the
-- marker, so a plan set after the month was created still grants it, and a plan change never
-- rewrites a month that already received one). Returns the locked balance.
create function private.ensure_credit_month(p_client uuid, p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target date := private.month_of(p_month);
  current_balance integer;
  current_status text;
  allowance integer;
  grant_key text := 'plan-allowance:' || p_client || ':' || private.month_of(p_month);
begin
  insert into public.credit_months(client_id, month) values (p_client, target) on conflict do nothing;
  select balance, status into current_balance, current_status from public.credit_months
    where client_id = p_client and month = target for update;
  if current_status = 'open' and target >= private.current_month()
     and not exists (select 1 from public.credit_ledger where idempotency_key = grant_key) then
    allowance := private.plan_allowance(p_client, target);
    if allowance > 0 then
      current_balance := current_balance + allowance;
      update public.credit_months set balance = current_balance, updated_at = pg_catalog.now()
        where client_id = p_client and month = target;
      insert into public.credit_ledger(client_id, amount, balance_after, kind, description, idempotency_key, month)
        values (p_client, allowance, current_balance, 'plan_allowance', 'Monthly plan allowance', grant_key, target);
    end if;
  end if;
  return current_balance;
end
$$;

-- Locks the client's account row (creating it on demand), expires ended months and opens the
-- current month. Every credit write calls this before touching any month.
create function private.lock_credit_client(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clients where id = p_client) then raise exception 'Client not found'; end if;
  insert into public.credit_accounts(client_id) values (p_client) on conflict do nothing;
  perform 1 from public.credit_accounts where client_id = p_client for update;
  perform private.expire_credit_months(p_client);
  perform private.ensure_credit_month(p_client, private.current_month());
end
$$;

-- Keeps credit_accounts.balance equal to the current month's balance.
create function private.sync_credit_account(p_client uuid) returns void
language sql security definer set search_path = '' as $$
  update public.credit_accounts set balance = coalesce((
      select balance from public.credit_months where client_id = p_client and month = private.current_month()), 0),
    updated_at = pg_catalog.now()
  where client_id = p_client
$$;

-- Applies one entry to a month already locked by ensure_credit_month and records it.
create function private.post_credit_entry(p_client uuid, p_month date, p_amount integer, p_kind text,
  p_description text, p_key text, p_project uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_balance integer;
  result_id uuid;
begin
  select balance into current_balance from public.credit_months
    where client_id = p_client and month = p_month and status = 'open' for update;
  if not found then raise exception 'Choose the current month or a later one'; end if;
  if current_balance + p_amount < 0 then
    raise exception 'insufficient_month_credits' using detail = pg_catalog.jsonb_build_object(
      'month', p_month, 'available', current_balance, 'required', -p_amount,
      'shortfall', -(current_balance + p_amount))::text;
  end if;
  update public.credit_months set balance = current_balance + p_amount, updated_at = pg_catalog.now()
    where client_id = p_client and month = p_month;
  insert into public.credit_ledger(client_id, project_id, amount, balance_after, kind, description, idempotency_key, month)
    values (p_client, p_project, p_amount, current_balance + p_amount, p_kind, p_description, p_key, p_month)
    returning id into result_id;
  return result_id;
end
$$;

-- Shared by add_month_extra and fulfill_credit_request.
create function private.add_credit_extra(p_client uuid, p_month date, p_amount integer, p_description text,
  p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  previous public.credit_ledger;
  target date := private.month_of(p_month);
  result_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be positive'; end if;
  if length(trim(coalesce(p_description, ''))) = 0 or length(trim(coalesce(p_key, ''))) = 0 then
    raise exception 'A reason and an idempotency key are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0));
  select * into previous from public.credit_ledger where idempotency_key = p_key;
  if found then
    if previous.client_id <> p_client or previous.kind <> 'extra' or previous.month is distinct from target
       or previous.amount <> p_amount or previous.description <> p_description then
      raise exception 'Idempotency key conflicts with a different credit entry';
    end if;
    return previous.id;
  end if;
  target := private.assert_open_month(p_month);
  perform private.lock_credit_client(p_client);
  perform private.ensure_credit_month(p_client, target);
  result_id := private.post_credit_entry(p_client, target, p_amount, 'extra', p_description, p_key);
  perform private.sync_credit_account(p_client);
  return result_id;
end
$$;

revoke execute on function private.plan_allowance(uuid, date), private.assert_open_month(date),
  private.expire_credit_months(uuid, date), private.ensure_credit_month(uuid, date),
  private.lock_credit_client(uuid), private.sync_credit_account(uuid),
  private.post_credit_entry(uuid, date, integer, text, text, text, uuid),
  private.add_credit_extra(uuid, date, integer, text, text)
  from public, anon, authenticated;

-- Public functions ---------------------------------------------------------------------------------

create function public.set_credit_plan(p_client_id uuid, p_monthly_credits integer, p_starts_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  start_month date;
  existing record;
begin
  perform private.assert_agency();
  if p_monthly_credits is null or p_monthly_credits < 0 then raise exception 'The monthly credits cannot be negative'; end if;
  start_month := private.assert_open_month(p_starts_on);
  perform private.lock_credit_client(p_client_id);
  insert into public.credit_plans(client_id, monthly_credits, starts_on, created_by)
    values (p_client_id, p_monthly_credits, start_month, auth.uid())
    on conflict (client_id, starts_on) do update
      set monthly_credits = excluded.monthly_credits, created_by = excluded.created_by, created_at = pg_catalog.now();
  -- Months already open from the start month on that have not received an allowance get it now.
  for existing in
    select month from public.credit_months
    where client_id = p_client_id and month >= start_month and status = 'open' order by month
  loop
    perform private.ensure_credit_month(p_client_id, existing.month);
  end loop;
  perform private.sync_credit_account(p_client_id);
  perform private.audit('credits.plan_set', p_client_id,
    pg_catalog.jsonb_build_object('monthly_credits', p_monthly_credits, 'starts_on', start_month));
end
$$;

create function public.add_month_extra(p_client_id uuid, p_month date, p_amount integer, p_reason text,
  p_idempotency_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  perform private.assert_agency();
  result_id := private.add_credit_extra(p_client_id, p_month, p_amount, p_reason, p_idempotency_key);
  perform private.audit('credits.extra_added', p_client_id,
    pg_catalog.jsonb_build_object('month', private.month_of(p_month), 'amount', p_amount));
  return result_id;
end
$$;

-- Returns the transfer_out entry; the transfer_in entry carries the same key with ':in'.
create function public.transfer_month_credits(p_client_id uuid, p_from_month date, p_to_month date,
  p_amount integer, p_reason text, p_idempotency_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  previous public.credit_ledger;
  from_month date := private.month_of(p_from_month);
  to_month date := private.month_of(p_to_month);
  result_id uuid;
begin
  perform private.assert_agency();
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be positive'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 or length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    raise exception 'A reason and an idempotency key are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
  select * into previous from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then
    if previous.client_id <> p_client_id or previous.kind <> 'transfer_out' or previous.month is distinct from from_month
       or previous.amount <> -p_amount or previous.description <> p_reason
       or not exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key || ':in'
                      and month is not distinct from to_month) then
      raise exception 'Idempotency key conflicts with a different credit entry';
    end if;
    return previous.id;
  end if;
  if from_month is null or to_month is null then raise exception 'A month is required'; end if;
  if from_month = to_month then raise exception 'Choose two different months'; end if;
  perform private.assert_open_month(from_month);
  perform private.assert_open_month(to_month);
  perform private.lock_credit_client(p_client_id);
  perform private.ensure_credit_month(p_client_id, least(from_month, to_month));
  perform private.ensure_credit_month(p_client_id, greatest(from_month, to_month));
  result_id := private.post_credit_entry(p_client_id, from_month, -p_amount, 'transfer_out', p_reason, p_idempotency_key);
  perform private.post_credit_entry(p_client_id, to_month, p_amount, 'transfer_in', p_reason, p_idempotency_key || ':in');
  perform private.sync_credit_account(p_client_id);
  perform private.audit('credits.transferred', p_client_id,
    pg_catalog.jsonb_build_object('from', from_month, 'to', to_month, 'amount', p_amount));
  return result_id;
end
$$;

-- Same checks, deliverables and studio-local start date as 202609230013; the debit now goes to the
-- chosen month (default: the due-date month, never earlier than the current month).
drop function public.accept_briefing(uuid);
create function public.accept_briefing(p_briefing_id uuid, p_month date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.briefings;
  result_id uuid;
  month_balance integer;
  item jsonb;
  position integer := 0;
  studio_today date;
  project_start date;
  target date;
begin
  perform private.assert_agency();
  select * into b from public.briefings where id = p_briefing_id for update;
  if not found then raise exception 'Briefing not found'; end if;
  if b.status = 'accepted' then select id into result_id from public.projects where briefing_id = b.id; return result_id; end if;
  if b.status <> 'budget_confirmed' or b.confirmed_credits is null then raise exception 'Confirm the budget before accepting'; end if;
  target := private.assert_open_month(coalesce(p_month, greatest(private.month_of(b.due_date), private.current_month())));
  perform private.lock_credit_client(b.client_id);
  month_balance := private.ensure_credit_month(b.client_id, target);
  if month_balance < b.confirmed_credits then raise exception 'Insufficient credit balance' using errcode = 'P0001'; end if;
  if jsonb_array_length(b.requested_deliverables) = 0 then raise exception 'At least one deliverable is required'; end if;
  select (pg_catalog.now() at time zone coalesce((select timezone from public.workspace_settings limit 1), 'UTC'))::date into studio_today;
  project_start := case when b.due_date is not null and b.due_date < studio_today then b.due_date else studio_today end;
  insert into public.projects(client_id, campaign_id, briefing_id, title, description, service_type, due_date, start_date, credit_month)
    values (b.client_id, b.campaign_id, b.id, b.title, b.overview, b.service_type, b.due_date, project_start, target)
    returning id into result_id;
  for item in select value from jsonb_array_elements(b.requested_deliverables) loop
    if length(trim(coalesce(item->>'name', ''))) = 0 or length(trim(coalesce(item->>'format', ''))) = 0 then
      raise exception 'Each deliverable requires a name and format';
    end if;
    insert into public.deliverables(project_id, name, format, width, height, quantity, scope, sort_order)
      values (result_id, item->>'name', item->>'format', (item->>'width')::integer, (item->>'height')::integer,
              coalesce((item->>'quantity')::integer, 1), coalesce(item->>'scope', 'original'), position);
    position := position + 1;
  end loop;
  perform private.post_credit_entry(b.client_id, target, -b.confirmed_credits, 'project_debit', b.title,
    'briefing:' || b.id, result_id);
  perform private.sync_credit_account(b.client_id);
  update public.briefings set status = 'accepted', updated_at = pg_catalog.now() where id = b.id;
  perform private.notify_client(b.client_id, result_id, 'Your project is ready', b.title);
  perform private.audit('briefing.accepted', b.id, pg_catalog.jsonb_build_object('project_id', result_id, 'month', target));
  return result_id;
end
$$;

-- Moves a project's charge to another month: refunds the origin while it is open, then debits the
-- target. An ended origin is not refunded, so the agency must confirm the full charge.
create function public.move_project_month(p_project_id uuid, p_to_month date, p_idempotency_key text,
  p_charge_full boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.projects;
  previous public.credit_ledger;
  target date := private.month_of(p_to_month);
  charge integer;
  origin_open boolean;
  result_id uuid;
begin
  perform private.assert_agency();
  if length(trim(coalesce(p_idempotency_key, ''))) = 0 then raise exception 'An idempotency key is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  select * into previous from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then
    if previous.project_id is distinct from p.id or previous.kind <> 'project_debit' or previous.month is distinct from target then
      raise exception 'Idempotency key conflicts with a different credit entry';
    end if;
    return previous.id;
  end if;
  if p.credit_month is null then raise exception 'This project has no credit month'; end if;
  if exists (select 1 from public.project_settlements where project_id = p.id) then
    raise exception 'A settled project cannot move to another month';
  end if;
  if target is null then raise exception 'A month is required'; end if;
  if target = p.credit_month then raise exception 'The project is already in this month'; end if;
  perform private.assert_open_month(target);
  charge := -(select coalesce(sum(amount), 0) from public.credit_ledger
              where project_id = p.id and month = p.credit_month and kind in ('project_debit', 'project_refund'));
  if charge <= 0 then raise exception 'This project has no charge in its month'; end if;
  perform private.lock_credit_client(p.client_id);
  origin_open := p.credit_month >= private.current_month();
  if not origin_open and not coalesce(p_charge_full, false) then
    raise exception 'The project month has expired; confirm the full charge to move it';
  end if;
  if origin_open then
    perform private.ensure_credit_month(p.client_id, least(p.credit_month, target));
    perform private.ensure_credit_month(p.client_id, greatest(p.credit_month, target));
    perform private.post_credit_entry(p.client_id, p.credit_month, charge, 'project_refund',
      p.title || ' moved to ' || to_char(target, 'FMMonth YYYY'), p_idempotency_key || ':refund', p.id);
  else
    perform private.ensure_credit_month(p.client_id, target);
  end if;
  result_id := private.post_credit_entry(p.client_id, target, -charge, 'project_debit', p.title, p_idempotency_key, p.id);
  update public.projects set credit_month = target where id = p.id;
  perform private.sync_credit_account(p.client_id);
  perform private.audit('project.credit_month_moved', p.id,
    pg_catalog.jsonb_build_object('from', p.credit_month, 'to', target, 'credits', charge, 'origin_refunded', origin_open));
  return result_id;
end
$$;

-- Settles a project once against its final total. Extra cost comes from p_charge_month (default:
-- the current month) and raises insufficient_month_credits with the shortfall in DETAIL when that
-- month is short; a refund always goes to the current month.
create function public.settle_project_credits(p_project_id uuid, p_final_credits integer, p_reason text,
  p_idempotency_key text, p_charge_month date default null) returns public.project_settlements
language plpgsql security definer set search_path = '' as $$
declare
  p public.projects;
  existing public.project_settlements;
  charged integer;
  diff integer;
  target date;
  result public.project_settlements;
begin
  perform private.assert_agency();
  if p_final_credits is null or p_final_credits < 0 then raise exception 'The final total cannot be negative'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 or length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    raise exception 'A reason and an idempotency key are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  select * into existing from public.project_settlements where project_id = p.id;
  if found then
    if existing.idempotency_key = p_idempotency_key and existing.final_credits = p_final_credits
       and existing.reason = p_reason then
      return existing;
    end if;
    raise exception 'This project is already settled';
  end if;
  if exists (select 1 from public.project_settlements where idempotency_key = p_idempotency_key) then
    raise exception 'Idempotency key conflicts with a different credit entry';
  end if;
  if p.status not in ('approved', 'delivered') then
    raise exception 'Settle credits only for an approved or delivered project';
  end if;
  charged := -(select coalesce(sum(amount), 0) from public.credit_ledger
               where project_id = p.id and kind in ('project_debit', 'project_refund', 'final_adjustment'));
  diff := p_final_credits - charged;
  if diff > 0 then
    target := private.assert_open_month(coalesce(p_charge_month, private.current_month()));
  elsif diff < 0 then
    target := private.current_month();
  end if;
  perform private.lock_credit_client(p.client_id);
  if diff <> 0 then
    perform private.ensure_credit_month(p.client_id, target);
    perform private.post_credit_entry(p.client_id, target, -diff, 'final_adjustment', p_reason,
      'settlement:' || p.id, p.id);
  end if;
  insert into public.project_settlements(project_id, final_credits, difference, reason, charged_month, settled_by, idempotency_key)
    values (p.id, p_final_credits, diff, p_reason, target, auth.uid(), p_idempotency_key)
    returning * into result;
  perform private.sync_credit_account(p.client_id);
  perform private.notify_client(p.client_id, p.id, 'Final credits settled', p_reason);
  perform private.audit('project.credits_settled', p.id,
    pg_catalog.jsonb_build_object('final_credits', p_final_credits, 'difference', diff, 'month', target));
  return result;
end
$$;

-- Agency and the client's members. Reading a current or future month opens it (granting its plan
-- allowance) and expires ended months, so the figures are always current.
create function public.credit_month_summary(p_client_id uuid, p_month date)
returns table (month date, status text, available integer, allowance integer, extras integer, used integer,
  transferred integer, expiring integer, expired integer, expires_on date)
language plpgsql security definer set search_path = '' as $$
declare
  target date := private.month_of(p_month);
  row_status text;
  row_balance integer;
begin
  if not (private.is_agency() or private.is_client_member(p_client_id)) then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  if target is null then raise exception 'A month is required'; end if;
  perform private.lock_credit_client(p_client_id);
  if target >= private.current_month() then perform private.ensure_credit_month(p_client_id, target); end if;
  perform private.sync_credit_account(p_client_id);
  select m.status, m.balance into row_status, row_balance from public.credit_months m
    where m.client_id = p_client_id and m.month = target;
  return query
    select target,
      coalesce(row_status, case when target < private.current_month() then 'expired' else 'open' end),
      coalesce(row_balance, 0),
      coalesce(sum(l.amount) filter (where l.kind = 'plan_allowance'), 0)::integer,
      coalesce(sum(l.amount) filter (where l.kind in ('extra', 'allocation', 'adjustment')), 0)::integer,
      (-coalesce(sum(l.amount) filter (where l.kind in ('project_debit', 'project_refund', 'final_adjustment')), 0))::integer,
      coalesce(sum(l.amount) filter (where l.kind in ('transfer_in', 'transfer_out')), 0)::integer,
      case when row_status = 'open' and target >= private.current_month() then row_balance else 0 end,
      (-coalesce(sum(l.amount) filter (where l.kind = 'expiry'), 0))::integer,
      (target + interval '1 month' - interval '1 day')::date
    from public.credit_ledger l
    where l.client_id = p_client_id and l.month = target;
end
$$;

-- Existing functions, now on the current month -----------------------------------------------------

-- Same signature, checks and messages as 202609260003; the key's advisory lock now comes before the
-- account lock, the order every credit write follows.
create or replace function public.adjust_credits(p_client_id uuid, p_amount integer, p_description text,
  p_idempotency_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  previous public.credit_ledger;
  month_balance integer;
  result_id uuid;
begin
  perform private.assert_agency();
  if p_amount = 0 or length(trim(p_description)) = 0 or length(trim(p_idempotency_key)) = 0 then
    raise exception 'Amount, description and idempotency key are required';
  end if;
  if not exists (select 1 from public.credit_accounts where client_id = p_client_id) then
    raise exception 'Credit account not found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
  select * into previous from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then
    if previous.client_id <> p_client_id or previous.amount <> p_amount or previous.description <> p_description then
      raise exception 'Idempotency key conflicts with a different adjustment';
    end if;
    return previous.id;
  end if;
  perform private.lock_credit_client(p_client_id);
  month_balance := private.ensure_credit_month(p_client_id, private.current_month());
  if month_balance + p_amount < 0 then raise exception 'Insufficient credit balance'; end if;
  result_id := private.post_credit_entry(p_client_id, private.current_month(), p_amount, 'adjustment',
    p_description, p_idempotency_key);
  perform private.sync_credit_account(p_client_id);
  perform private.audit('credits.adjusted', p_client_id, pg_catalog.jsonb_build_object('amount', p_amount));
  return result_id;
end
$$;

-- A fulfilled request becomes an extra in the current month (same key as before).
create or replace function public.fulfill_credit_request(p_request_id uuid, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  request public.credit_requests;
  transaction_id uuid;
begin
  perform private.assert_agency();
  select * into request from public.credit_requests where id = p_request_id for update;
  if not found then raise exception 'Credit request not found'; end if;
  if request.status = 'fulfilled' then return request.ledger_id; end if;
  if request.status <> 'pending' then raise exception 'Credit request is no longer pending'; end if;
  transaction_id := private.add_credit_extra(request.client_id, private.current_month(), request.amount,
    'Credit request allocation', 'credit-request:' || request.id);
  update public.credit_requests set status = 'fulfilled', response_note = p_note, ledger_id = transaction_id,
    resolved_at = pg_catalog.now() where id = request.id;
  perform private.notify_client(request.client_id, null, 'Credits added to your workspace', p_note);
  perform private.audit('credits.request_fulfilled', request.client_id,
    pg_catalog.jsonb_build_object('amount', request.amount, 'month', private.current_month()));
  return transaction_id;
end
$$;

revoke execute on function public.set_credit_plan(uuid, integer, date),
  public.add_month_extra(uuid, date, integer, text, text),
  public.transfer_month_credits(uuid, date, date, integer, text, text),
  public.accept_briefing(uuid, date),
  public.move_project_month(uuid, date, text, boolean),
  public.settle_project_credits(uuid, integer, text, text, date),
  public.credit_month_summary(uuid, date),
  public.adjust_credits(uuid, integer, text, text),
  public.fulfill_credit_request(uuid, text)
  from public, anon;
grant execute on function public.set_credit_plan(uuid, integer, date),
  public.add_month_extra(uuid, date, integer, text, text),
  public.transfer_month_credits(uuid, date, date, integer, text, text),
  public.accept_briefing(uuid, date),
  public.move_project_month(uuid, date, text, boolean),
  public.settle_project_credits(uuid, integer, text, text, date),
  public.credit_month_summary(uuid, date),
  public.adjust_credits(uuid, integer, text, text),
  public.fulfill_credit_request(uuid, text)
  to authenticated;
revoke execute on all functions in schema public from public, anon;
