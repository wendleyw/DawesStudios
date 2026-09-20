-- Return the saved revision under the same transaction lock; no separate read race.
create function public.save_briefing_revision(p_client_id uuid,p_service_type text,p_title text default '',p_campaign_id uuid default null,p_overview text default '',p_goals text default '',p_direction jsonb default '{}',p_deliverables jsonb default '[]',p_due_date date default null,p_estimated_credits integer default 1,p_briefing_id uuid default null,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result_id uuid;result_revision timestamptz; begin
 result_id:=public.save_briefing(p_client_id,p_service_type,p_title,p_campaign_id,p_overview,p_goals,p_direction,p_deliverables,p_due_date,p_estimated_credits,p_briefing_id,p_expected_updated_at);
 select updated_at into result_revision from public.briefings where id=result_id;
 return jsonb_build_object('id',result_id,'updated_at',result_revision);
 end
$$;
revoke execute on function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz) from public,anon;
grant execute on function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz) to authenticated;
