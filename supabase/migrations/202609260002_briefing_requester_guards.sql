-- Client team final-review fixes: a requester-only change must not re-run the briefing scope
-- triggers, and a studio save must not keep a departed person as requester. Spec:
-- docs/superpowers/specs/2026-09-25-client-team-design.md.

-- Group 2. `set_briefing_requester` only ever touches `requested_by`, but both scope-validation
-- triggers on `public.briefings` (disabled around the backfill in
-- 202609250002_client_team.sql, about line 20) re-check a submitted briefing's catalog scope on
-- every update, including this one. After a catalog change, an older submitted briefing would then
-- refuse a requester-only change. Bodies otherwise identical to the live definitions.
create or replace function private.validate_briefing_scope() returns trigger language plpgsql security definer set search_path='' as $$
 declare service jsonb; item jsonb; format_spec jsonb; begin
 -- a requester change alone does not re-validate scope
 if tg_op = 'UPDATE' and (to_jsonb(new) - 'requested_by') = (to_jsonb(old) - 'requested_by') then return new; end if;
 if new.status='draft' then return new; end if;
 select definition into service from public.service_catalog where id=new.service_type;
 if service is null then raise exception 'Unknown service type'; end if;
 if jsonb_array_length(new.requested_deliverables)=0 then raise exception 'At least one deliverable is required'; end if;
 for item in select value from jsonb_array_elements(new.requested_deliverables) loop
  if length(trim(coalesce(item->>'name','')))=0 or not (service->'formats' ? (item->>'format')) then raise exception 'Select a named deliverable format supported by this service'; end if;
  select definition into format_spec from public.format_catalog where id=item->>'format';
  if format_spec->>'layout'='fixed' and ((item->>'width') is null or (item->>'height') is null or (item->>'width')::integer<=0 or (item->>'height')::integer<=0) then raise exception 'Width and height are required for fixed-size deliverables'; end if;
  if format_spec->>'layout'='fluid' and ((item->>'width') is null or (item->>'width')::integer<=0) then raise exception 'Width is required for fluid deliverables'; end if;
  if coalesce((item->>'quantity')::integer,1) not between 1 and 100 or coalesce(item->>'scope','original') not in ('original','adaptation') then raise exception 'Invalid deliverable quantity or scope'; end if;
 end loop;
 return new;
end $$;
revoke execute on function private.validate_briefing_scope() from public,anon,authenticated;

create or replace function private.validate_service_answers() returns trigger language plpgsql security definer set search_path='' as $$
 declare questions jsonb; question jsonb; answer text; begin
 -- a requester change alone does not re-validate scope
 if tg_op = 'UPDATE' and (to_jsonb(new) - 'requested_by') = (to_jsonb(old) - 'requested_by') then return new; end if;
 if new.status='draft' then return new; end if;
 select definition->'questions' into questions from public.service_catalog where id=new.service_type;
 for question in select value from jsonb_array_elements(coalesce(questions,'[]')) loop
  answer:=trim(coalesce(new.direction->'questions'->>(question->>'id'),''));
  if answer='' then raise exception 'Answer every service question before submitting'; end if;
  if question ? 'options' and not(question->'options' ? answer) then raise exception 'Choose an allowed option for each service question'; end if;
  if question->>'id'='pages' and answer !~ '^[1-9][0-9]*$' then raise exception 'Page count must be a positive whole number'; end if;
 end loop;
 return new;
end $$;
revoke execute on function private.validate_service_answers() from public,anon,authenticated;

-- Group 4. The studio branch kept a stored requester through `coalesce` even after that person
-- stopped being an active client person of this briefing's client (removed, or never one of this
-- client's people any more), which skipped the one-person default and the required choice. Treat a
-- stale stored requester as null before applying those existing rules. Client saves (the `else`
-- branch) are unchanged. Same signature as the live definition, so grants are unaffected.
create or replace function public.save_briefing(
  p_client_id uuid,
  p_service_type text,
  p_title text default '',
  p_campaign_id uuid default null,
  p_overview text default '',
  p_goals text default '',
  p_direction jsonb default '{}'::jsonb,
  p_deliverables jsonb default '[]'::jsonb,
  p_due_date date default null,
  p_estimated_credits integer default 1,
  p_briefing_id uuid default null,
  p_expected_updated_at timestamptz default null,
  p_requested_by uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result_id uuid;
  existing public.briefings;
  studio boolean := private.is_agency();
  requester uuid;
  people integer;
begin
  if not (studio or private.is_client_member(p_client_id)) then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  if studio and p_requested_by is not null
     and not private.is_active_client_person(p_client_id, p_requested_by) then
    raise exception 'Choose a person from this client as the requester' using errcode = 'P0001';
  end if;
  if p_briefing_id is not null then
    select * into existing from public.briefings
      where id = p_briefing_id and client_id = p_client_id for update;
    if not found then raise exception 'Briefing not found'; end if;
    if p_expected_updated_at is null or existing.updated_at <> p_expected_updated_at then
      raise exception 'This draft changed in another session. Reload before saving.' using errcode = 'PT409';
    end if;
    if existing.status <> 'draft' then raise exception 'Only draft briefings can be edited'; end if;
  end if;
  if studio then
    if existing.requested_by is not null
       and not private.is_active_client_person(p_client_id, existing.requested_by) then
      existing.requested_by := null;
    end if;
    requester := coalesce(p_requested_by, existing.requested_by);
    if requester is null then
      select (array_agg(m.user_id))[1], count(*) into requester, people
        from public.client_memberships m
        join public.profiles p on p.id = m.user_id
        where m.client_id = p_client_id and p.role = 'client' and p.removed_at is null;
      if people <> 1 then requester := null; end if;
    end if;
  else
    requester := coalesce(existing.requested_by, auth.uid());
  end if;
  if p_briefing_id is not null then
    update public.briefings set service_type = p_service_type, title = p_title,
      campaign_id = p_campaign_id, overview = p_overview, goals = p_goals, direction = p_direction,
      requested_deliverables = p_deliverables, due_date = p_due_date,
      estimated_credits = p_estimated_credits, requested_by = requester,
      updated_at = clock_timestamp()
      where id = p_briefing_id;
    result_id := p_briefing_id;
  else
    insert into public.briefings(client_id, service_type, title, campaign_id, overview, goals,
      direction, requested_deliverables, due_date, estimated_credits, created_by, requested_by)
      values (p_client_id, p_service_type, p_title, p_campaign_id, p_overview, p_goals,
      p_direction, p_deliverables, p_due_date, p_estimated_credits, auth.uid(), requester)
      returning id into result_id;
  end if;
  if studio and requester is null and people > 0 then
    raise exception 'Choose who requested this briefing' using errcode = 'P0001';
  end if;
  return result_id;
end $$;
revoke execute on function public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) from public, anon;
grant execute on function public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) to authenticated;
