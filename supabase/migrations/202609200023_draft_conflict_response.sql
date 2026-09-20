-- A stale editor is a client conflict, not a retriable serialization failure.
create or replace function public.save_briefing(p_client_id uuid,p_service_type text,p_title text default '',p_campaign_id uuid default null,p_overview text default '',p_goals text default '',p_direction jsonb default '{}',p_deliverables jsonb default '[]',p_due_date date default null,p_estimated_credits integer default 1,p_briefing_id uuid default null,p_expected_updated_at timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; existing public.briefings; begin
 if not (private.is_agency() or private.is_client_member(p_client_id)) then raise exception 'Client access required' using errcode='42501'; end if;
 if p_briefing_id is not null then
  select * into existing from public.briefings where id=p_briefing_id and client_id=p_client_id for update;
  if not found then raise exception 'Briefing not found'; end if;
  if p_expected_updated_at is null or existing.updated_at<>p_expected_updated_at then raise exception 'This draft changed in another session. Reload before saving.' using errcode='PT409'; end if;
  if existing.status<>'draft' then raise exception 'Only draft briefings can be edited'; end if;
  update public.briefings set service_type=p_service_type,title=p_title,campaign_id=p_campaign_id,overview=p_overview,goals=p_goals,direction=p_direction,requested_deliverables=p_deliverables,due_date=p_due_date,estimated_credits=p_estimated_credits,updated_at=clock_timestamp() where id=p_briefing_id;
  return p_briefing_id;
 end if;
 insert into public.briefings(client_id,service_type,title,campaign_id,overview,goals,direction,requested_deliverables,due_date,estimated_credits,created_by) values(p_client_id,p_service_type,p_title,p_campaign_id,p_overview,p_goals,p_direction,p_deliverables,p_due_date,p_estimated_credits,auth.uid()) returning id into result_id;
 return result_id;
end $$;
