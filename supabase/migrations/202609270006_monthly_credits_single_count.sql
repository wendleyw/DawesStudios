-- Review fixes (round 2) for the monthly credits migrations 202609270003 and 202609270005.
--
-- A. create_client (202609200002_workflows.sql) inserted the account with its initial balance and
--    then posted its own 'initial:' allocation, so the opening-allocation trigger from 202609270005
--    recorded the same credits a second time. The account now starts at 0 and the initial credits
--    are posted once, as an allocation in the current month, through post_credit_entry. The
--    trigger's safety net remains for genuine direct inserts. Body otherwise verbatim.
-- B. A settlement replay that named a charge month failed when the stored difference was zero or
--    negative (those store no charge month, or the current month for a refund). The charge month is
--    now compared only when the settlement charged extra.
-- C. accept_briefing's default month (the due-date month) is clamped to the last month that can be
--    charged, current + 11, so a far due date no longer makes the default fail.

create or replace function public.create_client(p_name text,p_slug text,p_industry text default '',p_initial_credits integer default 0) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 perform private.assert_agency();
 if p_initial_credits<0 then raise exception 'Initial credits cannot be negative'; end if;
 insert into public.clients(name,slug,industry,initials) values(p_name,p_slug,p_industry,upper(left(p_name,2))) returning id into result_id;
 insert into public.credit_accounts(client_id,balance) values(result_id,0);
 if p_initial_credits>0 then
  perform private.lock_credit_client(result_id);
  perform private.post_credit_entry(result_id,private.current_month(),p_initial_credits,'allocation','Initial credit allocation','initial:'||result_id);
  perform private.sync_credit_account(result_id);
 end if;
 perform private.audit('client.created',result_id);
 return result_id;
end $$;

create or replace function public.accept_briefing(p_briefing_id uuid, p_month date default null) returns uuid
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
  target := private.assert_open_month(coalesce(p_month, least(
    greatest(private.month_of(b.due_date), private.current_month()),
    (private.current_month() + interval '11 months')::date)));
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
       and (p_charge_month is null or existing.difference <= 0
            or existing.charged_month is not distinct from private.month_of(p_charge_month)) then
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

-- Same signatures, so the existing grants carry over; the sweep is restated as elsewhere.
revoke execute on all functions in schema public from public, anon;
