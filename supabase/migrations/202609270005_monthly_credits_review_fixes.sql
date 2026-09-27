-- Review fixes for 202609270003_monthly_credits.sql.
--
-- 1. Settlement counted every debit of a project, including the unrefunded debit a confirmed move
--    leaves in an expired origin month, so settling at the same total refunded the charge the agency
--    had just confirmed. "Already charged" is now the project's entries in its current credit month
--    plus any final adjustment.
-- 2. credit_month_summary is client-callable and opened (and granted the allowance of) any future
--    month it read, so a later plan for that month was ignored and a client could create rows for
--    arbitrary months. Reads no longer write: a month without its allowance shows the projected one.
--    Every month a caller names is bounded to the current month .. current + 11 (errcode 22023).
-- 3. Directly inserted ledger rows (the seed) took their created_at month while a directly
--    inserted account balance went to the current month, so a reset after the seed's month broke
--    reconciliation. Direct ledger rows without a month now land in the current month, and an
--    account balance the current month's ledger does not explain is recorded as an opening
--    allocation in that same month.
-- Also: a settlement replay naming another charge month, and keys a transfer or move would derive
-- (':in', ':refund'), now raise the idempotency conflict instead of a raw unique violation.

create or replace function private.assert_open_month(p_month date) returns date
language plpgsql stable set search_path = '' as $$
declare target date := private.month_of(p_month);
begin
  if p_month is null then raise exception 'A month is required' using errcode = '22023'; end if;
  if target < private.current_month() then
    raise exception 'Choose the current month or a later one' using errcode = '22023';
  end if;
  if target > (private.current_month() + interval '11 months')::date then
    raise exception 'Choose a month within the next 11 months' using errcode = '22023';
  end if;
  return target;
end
$$;

create or replace function private.post_credit_entry(p_client uuid, p_month date, p_amount integer, p_kind text,
  p_description text, p_key text, p_project uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_balance integer;
  result_id uuid;
begin
  select balance into current_balance from public.credit_months
    where client_id = p_client and month = p_month and status = 'open' for update;
  if not found then raise exception 'Choose the current month or a later one' using errcode = '22023'; end if;
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

create or replace function private.default_ledger_month() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.month is null then new.month := private.current_month(); end if;
  return new;
end
$$;

create or replace function private.open_account_month() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target date := private.current_month();
  opened boolean;
  ledger_total integer;
begin
  insert into public.credit_months(client_id, month, balance)
    values (new.client_id, target, new.balance)
    on conflict do nothing
    returning true into opened;
  if opened then
    select coalesce(sum(amount), 0) into ledger_total from public.credit_ledger
      where client_id = new.client_id and month = target;
    if new.balance <> ledger_total then
      insert into public.credit_ledger(client_id, amount, balance_after, kind, description, idempotency_key, month)
        values (new.client_id, new.balance - ledger_total, new.balance, 'allocation', 'Opening balance',
                'opening:' || new.client_id || ':' || target, target);
    end if;
  end if;
  return null;
end
$$;

-- Reads only. A current or future month that has not received its allowance shows the plan's
-- projected allowance; an ended month still marked open shows its leftover as expired.
create or replace function public.credit_month_summary(p_client_id uuid, p_month date)
returns table (month date, status text, available integer, allowance integer, extras integer, used integer,
  transferred integer, expiring integer, expired integer, expires_on date)
language plpgsql stable security definer set search_path = '' as $$
declare
  target date := private.month_of(p_month);
  this_month date := private.current_month();
  row_status text;
  row_balance integer;
  projected integer := 0;
begin
  if not (private.is_agency() or private.is_client_member(p_client_id)) then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  if target is null then raise exception 'A month is required' using errcode = '22023'; end if;
  if target > (this_month + interval '11 months')::date then
    raise exception 'Choose a month within the next 11 months' using errcode = '22023';
  end if;
  select m.status, m.balance into row_status, row_balance from public.credit_months m
    where m.client_id = p_client_id and m.month = target;
  if target >= this_month and coalesce(row_status, 'open') = 'open' and not exists (
       select 1 from public.credit_ledger g
       where g.idempotency_key = 'plan-allowance:' || p_client_id || ':' || target) then
    projected := private.plan_allowance(p_client_id, target);
  end if;
  return query
    select target,
      case when target < this_month then 'expired' else 'open' end,
      case when target < this_month then 0 else coalesce(row_balance, 0) + projected end,
      (coalesce(sum(l.amount) filter (where l.kind = 'plan_allowance'), 0) + projected)::integer,
      coalesce(sum(l.amount) filter (where l.kind in ('extra', 'allocation', 'adjustment')), 0)::integer,
      (-coalesce(sum(l.amount) filter (where l.kind in ('project_debit', 'project_refund', 'final_adjustment')), 0))::integer,
      coalesce(sum(l.amount) filter (where l.kind in ('transfer_in', 'transfer_out')), 0)::integer,
      case when target >= this_month then coalesce(row_balance, 0) + projected else 0 end,
      (-coalesce(sum(l.amount) filter (where l.kind = 'expiry'), 0)
        + case when target < this_month and row_status = 'open' then coalesce(row_balance, 0) else 0 end)::integer,
      (target + interval '1 month' - interval '1 day')::date
    from public.credit_ledger l
    where l.client_id = p_client_id and l.month = target;
end
$$;

create or replace function public.transfer_month_credits(p_client_id uuid, p_from_month date, p_to_month date,
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
  if exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key || ':in') then
    raise exception 'Idempotency key conflicts with a different credit entry';
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

create or replace function public.move_project_month(p_project_id uuid, p_to_month date, p_idempotency_key text,
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
  if exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key || ':refund') then
    raise exception 'Idempotency key conflicts with a different credit entry';
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

create or replace function public.settle_project_credits(p_project_id uuid, p_final_credits integer, p_reason text,
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
       and existing.reason = p_reason
       and (p_charge_month is null or existing.charged_month is not distinct from private.month_of(p_charge_month)) then
      return existing;
    end if;
    if existing.idempotency_key = p_idempotency_key then
      raise exception 'Idempotency key conflicts with a different credit entry';
    end if;
    raise exception 'This project is already settled';
  end if;
  if exists (select 1 from public.project_settlements where idempotency_key = p_idempotency_key) then
    raise exception 'Idempotency key conflicts with a different credit entry';
  end if;
  if p.status not in ('approved', 'delivered') then
    raise exception 'Settle credits only for an approved or delivered project';
  end if;
  -- What the project is charged now: its entries in its current credit month, plus any earlier
  -- final adjustment. A debit left in an expired origin month by a confirmed move stays spent.
  charged := -(select coalesce(sum(amount), 0) from public.credit_ledger
               where project_id = p.id
                 and ((month = p.credit_month and kind in ('project_debit', 'project_refund'))
                      or kind = 'final_adjustment'));
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

-- Same signatures, so the grants from 202609270003 carry over; the sweep is restated as elsewhere.
revoke execute on function private.assert_open_month(date),
  private.post_credit_entry(uuid, date, integer, text, text, text, uuid),
  private.default_ledger_month(), private.open_account_month()
  from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
