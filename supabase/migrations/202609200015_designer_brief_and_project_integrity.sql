alter policy briefings_read on public.briefings using(private.is_agency() or private.is_client_member(client_id));
create function public.get_assigned_briefings(p_client_id uuid default null) returns table(
 id uuid,client_id uuid,campaign_id uuid,title text,service_type text,status public.briefing_status,
 overview text,goals text,direction jsonb,requested_deliverables jsonb,due_date date,created_at timestamptz,updated_at timestamptz
) language plpgsql security definer set search_path='' as $$
 begin
 if private.current_role() is distinct from 'designer' then raise exception 'Designer access required' using errcode='42501'; end if;
 return query select b.id,b.client_id,b.campaign_id,b.title,b.service_type,b.status,b.overview,b.goals,
 jsonb_strip_nulls(jsonb_build_object('source',b.direction->'source','audience',b.direction->'audience','style',b.direction->'style','messaging',b.direction->'messaging','questions',b.direction->'questions','tone',b.direction->'tone')),
 (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name',d->'name','format',d->'format','width',d->'width','height',d->'height','quantity',d->'quantity','scope',d->'scope'))),'[]') from jsonb_array_elements(b.requested_deliverables) d),
 b.due_date,b.created_at,b.updated_at
 from public.briefings b join public.projects p on p.briefing_id=b.id join public.project_assignments a on a.project_id=p.id
 where a.designer_id=auth.uid() and b.status='accepted' and (p_client_id is null or b.client_id=p_client_id);
 end
$$;
revoke execute on function public.get_assigned_briefings(uuid) from public,anon;
grant execute on function public.get_assigned_briefings(uuid) to authenticated;
alter table public.projects add constraint project_title_valid check(length(trim(title)) between 1 and 200);
alter table public.projects add constraint project_dates_valid check(due_date is null or start_date is null or due_date>=start_date);
create function private.touch_project() returns trigger language plpgsql set search_path='' as $$
 begin new.updated_at:=clock_timestamp(); return new; end
$$;
create trigger project_updated_at before update on public.projects for each row execute function private.touch_project();
revoke execute on function private.touch_project() from public,anon,authenticated;
create or replace function public.assign_designer(p_project_id uuid,p_designer_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare target_client uuid; begin
 perform private.assert_agency();
 if not exists(select 1 from public.profiles where id=p_designer_id and role='designer') then raise exception 'Select a designer account'; end if;
 select client_id into target_client from public.projects where id=p_project_id;
 insert into public.project_assignments(project_id,designer_id) values(p_project_id,p_designer_id) on conflict do nothing;
 if not found then return; end if;
 insert into public.notifications(user_id,client_id,project_id,title,body) values(p_designer_id,target_client,p_project_id,'New project assignment','A project has been assigned to you.');
 perform private.audit('project.assigned',p_project_id);
end $$;
create function public.revoke_design_assignment(p_project_id uuid,p_designer_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.assert_agency();
 delete from public.project_assignments where project_id=p_project_id and designer_id=p_designer_id;
 if not found then return; end if;
 delete from public.notifications where project_id=p_project_id and user_id=p_designer_id;
 perform private.audit('project.assignment_revoked',p_project_id);
end $$;
revoke execute on function public.revoke_design_assignment(uuid,uuid) from public,anon;
grant execute on function public.revoke_design_assignment(uuid,uuid) to authenticated;
