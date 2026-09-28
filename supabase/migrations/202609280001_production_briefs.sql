-- Separate the studio's production instructions from the client's contracted request.
-- No existing client brief is implicitly released to a designer.
create table public.production_brief_drafts (
 board_id uuid primary key references public.design_boards(id) on delete cascade,
 content jsonb not null,
 revision integer not null check (revision > 0),
 updated_at timestamptz not null default now()
);
create table public.production_briefs (
 board_id uuid primary key references public.design_boards(id) on delete cascade,
 content jsonb not null,
 revision integer not null check (revision > 0),
 updated_at timestamptz not null default now()
);
create table private.production_brief_requests (
 request_id uuid primary key,
 board_id uuid not null references public.design_boards(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 content jsonb not null,
 published boolean not null,
 expected_revision integer not null,
 result_revision integer not null,
 created_at timestamptz not null default now()
);
alter table public.production_brief_drafts enable row level security;
alter table public.production_briefs enable row level security;
create policy production_brief_drafts_read on public.production_brief_drafts for select to authenticated
 using (private.is_agency());
create policy production_briefs_read on public.production_briefs for select to authenticated
 using (private.can_see_board(board_id));
revoke all on public.production_brief_drafts, public.production_briefs from public, anon, authenticated;
grant select on public.production_brief_drafts, public.production_briefs to authenticated;
grant all on public.production_brief_drafts, public.production_briefs to service_role;

create function public.save_production_brief(p_board_id uuid, p_content jsonb,
 p_expected_revision integer, p_publish boolean, p_request_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
 board public.design_boards; project public.projects; request private.production_brief_requests;
 prior_revision integer; next_revision integer; item jsonb; field text; due date;
begin
 if not private.is_agency() then raise exception 'Agency access required' using errcode='42501'; end if;
 if p_request_id is null or p_publish is null or p_expected_revision is null or p_expected_revision < 0 then
  raise exception 'A save attempt and expected revision are required' using errcode='22023'; end if;
 select * into board from public.design_boards where id=p_board_id for update;
 if not found then raise exception 'Design board not found' using errcode='22023'; end if;
 select * into request from private.production_brief_requests where request_id=p_request_id;
 if found then
  if request.actor_id <> auth.uid() or request.board_id <> p_board_id or request.content is distinct from p_content
   or request.published <> p_publish or request.expected_revision <> p_expected_revision then
   raise exception 'Save attempt already used for different instructions' using errcode='23505'; end if;
  return request.result_revision;
 end if;
 select * into project from public.projects where id=board.project_id for update;
 if project.status='delivered' then raise exception 'Delivered projects cannot receive production changes' using errcode='22023'; end if;
 select revision into prior_revision from public.production_brief_drafts where board_id=p_board_id;
 if coalesce(prior_revision,0) <> p_expected_revision then
  raise exception 'Production brief changed while you were editing. Reopen it before saving.' using errcode='40001'; end if;
 if jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>100000 then
  raise exception 'Production brief is too large or invalid' using errcode='22023'; end if;
 for field in select jsonb_object_keys(p_content) loop
  if field not in ('title','serviceId','overview','goals','direction','deliverables','dueDate','references') then
   raise exception 'Unknown production brief field' using errcode='22023'; end if;
 end loop;
 foreach field in array array['title','serviceId','overview','goals','dueDate'] loop
  if jsonb_typeof(p_content->field) is distinct from 'string' or length(p_content->>field)>12000 then
   raise exception 'Production text fields are invalid or too long' using errcode='22023'; end if;
 end loop;
 if length(trim(p_content->>'title')) not between 1 and 200 or
    not exists(select 1 from public.service_catalog where id=p_content->>'serviceId') then
  raise exception 'Add a production title and service' using errcode='22023'; end if;
 due := nullif(p_content->>'dueDate','')::date;
 if due > project.due_date then raise exception 'The internal deadline must be on or before the project deadline' using errcode='22023'; end if;
 if jsonb_typeof(p_content->'direction') is distinct from 'object' then
  raise exception 'Production direction is invalid' using errcode='22023'; end if;
 for field,item in select key,value from jsonb_each(p_content->'direction') loop
  if field='questions' then
   if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_each(item) q where jsonb_typeof(q.value)<>'string' or length(q.value#>>'{}')>12000) then
    raise exception 'Service answers are invalid' using errcode='22023'; end if;
  elsif field not in ('audience','messaging','style','resources','inspirations','notes') or jsonb_typeof(item)<>'string' or length(item#>>'{}')>12000 then
   raise exception 'Production direction is invalid' using errcode='22023';
  end if;
 end loop;
 if jsonb_typeof(p_content->'deliverables') is distinct from 'array' then
  raise exception 'Production deliverables are invalid' using errcode='22023'; end if;
 if jsonb_array_length(p_content->'deliverables')>50 or (p_publish and jsonb_array_length(p_content->'deliverables')=0) then
  raise exception 'Add between 1 and 50 production deliverables before sending' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_content->'deliverables') loop
  if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'name',''))) not between 1 and 200
   or not exists(select 1 from public.format_catalog where id=item->>'format')
   or (item->>'quantity') is null or (item->>'quantity') !~ '^[0-9]+$'
   or (item->>'quantity')::integer not between 1 and 100
   or coalesce(item->>'scope','') not in ('original','adaptation') then
   raise exception 'Review production deliverable names, formats and quantities' using errcode='22023'; end if;
  foreach field in array array['width','height'] loop
   if item ? field and item->field <> 'null'::jsonb and ((item->>field) !~ '^[0-9]+$' or (item->>field)::numeric not between 1 and 100000) then
    raise exception 'Deliverable dimensions must be positive whole numbers' using errcode='22023'; end if;
  end loop;
 end loop;
 if jsonb_typeof(p_content->'references') is distinct from 'array' or jsonb_array_length(p_content->'references')>30 then
  raise exception 'Add at most 30 production references' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_content->'references') loop
  if length(trim(coalesce(item->>'name',''))) not between 1 and 200
   or length(coalesce(item->>'url',''))>2000 or coalesce(item->>'url','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$' then
   raise exception 'Each reference needs a name and HTTPS link' using errcode='22023'; end if;
 end loop;
 next_revision := coalesce(prior_revision,0)+1;
 insert into public.production_brief_drafts(board_id,content,revision,updated_at)
  values(p_board_id,p_content,next_revision,clock_timestamp())
  on conflict(board_id) do update set content=excluded.content, revision=excluded.revision, updated_at=excluded.updated_at;
 if p_publish then
  insert into public.production_briefs(board_id,content,revision,updated_at)
   values(p_board_id,p_content,next_revision,clock_timestamp())
   on conflict(board_id) do update set content=excluded.content, revision=excluded.revision, updated_at=excluded.updated_at;
  update public.design_boards set due_date=due where id=p_board_id;
  insert into public.notifications(user_id,client_id,project_id,title,body)
   select board.designer_id,project.client_id,project.id,'Production brief updated','The studio sent production instructions. Open your project briefing.'
   where exists(select 1 from public.project_assignments a join public.profiles p on p.id=a.designer_id
    where a.project_id=project.id and a.designer_id=board.designer_id and p.removed_at is null);
 end if;
 insert into private.production_brief_requests(request_id,board_id,actor_id,content,published,expected_revision,result_revision)
  values(p_request_id,p_board_id,auth.uid(),p_content,p_publish,p_expected_revision,next_revision);
 return next_revision;
end $$;
revoke execute on function public.save_production_brief(uuid,jsonb,integer,boolean,uuid) from public,anon;
grant execute on function public.save_production_brief(uuid,jsonb,integer,boolean,uuid) to authenticated;

-- Retire the former sanitized projection: even its text and quantities belong to the client brief.
create or replace function public.get_assigned_briefings(p_client_id uuid default null) returns table(
 id uuid,client_id uuid,campaign_id uuid,title text,service_type text,status public.briefing_status,
 overview text,goals text,direction jsonb,requested_deliverables jsonb,due_date date,created_at timestamptz,updated_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role() is distinct from 'designer' then raise exception 'Designer access required' using errcode='42501'; end if;
 return;
end $$;
create or replace function private.can_access_briefing(target_briefing uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.briefings b where b.id=target_briefing
  and (private.is_agency() or private.is_client_member(b.client_id)))
$$;
alter policy deliverables_read on public.deliverables using (
 exists(select 1 from public.projects p where p.id=project_id and (private.is_agency() or private.is_client_member(p.client_id)))
);

-- Project descriptions were copied from the client's overview during acceptance. Column grants
-- prevent direct/nested reads; the authenticated projection returns no description to designers.
revoke select on public.projects from authenticated;
grant select(id,client_id,campaign_id,briefing_id,title,status,service_type,due_date,start_date,
 board_position,created_at,updated_at,credit_month,delivered_at) on public.projects to authenticated;
create function public.visible_projects() returns setof public.projects
language sql stable security definer set search_path='' as $$
 select (jsonb_populate_record(null::public.projects,to_jsonb(p) || jsonb_build_object('description',
  case when private.is_agency() or private.is_client_member(p.client_id) then p.description else '' end))).*
 from public.projects p where private.can_access_project(p.id)
$$;
revoke execute on function public.visible_projects() from public,anon;
grant execute on function public.visible_projects() to authenticated;
notify pgrst,'reload schema';
