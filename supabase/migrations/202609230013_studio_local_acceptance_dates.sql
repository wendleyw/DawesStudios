-- Defect: accepting a briefing inserted no explicit `start_date`, so `projects.start_date`'s column
-- default (`current_date`, evaluated in the database session's UTC timezone — 202609200001) applied.
-- From 8pm EDT onward that default is already tomorrow in UTC, while a briefing's `due_date` is the
-- studio's local today, so accepting a same-day-due briefing in the evening violated
-- `project_dates_valid` (`due_date>=start_date`, 202609200015). A briefing whose due date had
-- already passed could never be accepted either, for the same reason.
--
-- Fix: `accept_briefing` now computes the studio-local calendar day from `workspace_settings.timezone`
-- and inserts it explicitly, clamped down to `due_date` when the due date is already earlier — so a
-- past-due briefing is accepted with `start_date=due_date` instead of failing the same check. The
-- column default is intentionally left alone (draft/manual project creation still wants "today").
--
-- Every lock, the idempotency short-circuit, the balance check, the debit and the status transition
-- are unchanged from 202609200002/202609200015. The signature is unchanged, so `create or replace`
-- preserves the existing `execute` grant to `authenticated` (revoked from `public`/`anon`) without
-- reissuing it — verified after this migration with a `has_function_privilege` query, following the
-- precedent of same-signature bugfixes such as 202609220004_fix_team_management_variable_shadowing.sql.
create or replace function public.accept_briefing(p_briefing_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare b public.briefings; result_id uuid; current_balance integer; item jsonb; position integer:=0; studio_today date; project_start date; begin
 perform private.assert_agency();
 select * into b from public.briefings where id=p_briefing_id for update;
 if not found then raise exception 'Briefing not found'; end if;
 if b.status='accepted' then select id into result_id from public.projects where briefing_id=b.id; return result_id; end if;
 if b.status<>'budget_confirmed' or b.confirmed_credits is null then raise exception 'Confirm the budget before accepting'; end if;
 select balance into current_balance from public.credit_accounts where client_id=b.client_id for update;
 if not found or current_balance<b.confirmed_credits then raise exception 'Insufficient credit balance' using errcode='P0001'; end if;
 if jsonb_array_length(b.requested_deliverables)=0 then raise exception 'At least one deliverable is required'; end if;
 select (now() at time zone coalesce((select timezone from public.workspace_settings limit 1),'UTC'))::date into studio_today;
 project_start:=case when b.due_date is not null and b.due_date<studio_today then b.due_date else studio_today end;
 insert into public.projects(client_id,campaign_id,briefing_id,title,description,service_type,due_date,start_date) values(b.client_id,b.campaign_id,b.id,b.title,b.overview,b.service_type,b.due_date,project_start) returning id into result_id;
 for item in select value from jsonb_array_elements(b.requested_deliverables) loop
  if length(trim(coalesce(item->>'name','')))=0 or length(trim(coalesce(item->>'format','')))=0 then raise exception 'Each deliverable requires a name and format'; end if;
  insert into public.deliverables(project_id,name,format,width,height,quantity,scope,sort_order) values(result_id,item->>'name',item->>'format',(item->>'width')::integer,(item->>'height')::integer,coalesce((item->>'quantity')::integer,1),coalesce(item->>'scope','original'),position);
  position:=position+1;
 end loop;
 update public.credit_accounts set balance=balance-b.confirmed_credits,updated_at=now() where client_id=b.client_id;
 insert into public.credit_ledger(client_id,project_id,amount,balance_after,kind,description,idempotency_key) values(b.client_id,result_id,-b.confirmed_credits,current_balance-b.confirmed_credits,'project_debit',b.title,'briefing:'||b.id);
 update public.briefings set status='accepted',updated_at=now() where id=b.id;
 perform private.notify_client(b.client_id,result_id,'Your project is ready',b.title);
 perform private.audit('briefing.accepted',b.id,jsonb_build_object('project_id',result_id));
 return result_id;
end $$;
