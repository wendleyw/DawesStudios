-- Several people in one client: who asked for each briefing, who decided on each version, and each
-- person's notification choice. Spec: docs/superpowers/specs/2026-09-25-client-team-design.md.

alter table public.briefings
  add column requested_by uuid references public.profiles(id) on delete set null;
alter table public.publication_reviews
  add column reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.client_memberships
  add column notify_all boolean not null default false;

create index briefings_requested_by_idx on public.briefings(requested_by)
  where requested_by is not null;
create index publication_reviews_reviewed_by_idx on public.publication_reviews(reviewed_by)
  where reviewed_by is not null;

-- Existing briefings take their creator when that person is one of the client's people, and stay
-- empty otherwise. The two scope triggers re-validate every submitted briefing on any update; this
-- backfill changes no scope, so they pause for it instead of re-judging old rows against today's
-- catalog.
alter table public.briefings disable trigger validate_submitted_briefing_scope;
alter table public.briefings disable trigger validate_submitted_service_answers;
update public.briefings b set requested_by = b.created_by
where b.requested_by is null
  and exists (
    select 1 from public.client_memberships m
    join public.profiles p on p.id = m.user_id
    where m.client_id = b.client_id and m.user_id = b.created_by and p.role = 'client'
  );
alter table public.briefings enable trigger validate_submitted_briefing_scope;
alter table public.briefings enable trigger validate_submitted_service_answers;

-- One of a client's active people: a client-role member who has not been removed.
create function private.is_active_client_person(target_client uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_memberships m
    join public.profiles p on p.id = m.user_id
    where m.client_id = target_client and m.user_id = target_user
      and p.role = 'client' and p.removed_at is null
  )
$$;
revoke all on function private.is_active_client_person(uuid, uuid) from public, anon, authenticated;

-- A client's active people with their sign-in emails, for the studio and for that client's own
-- people only; anyone else receives no rows. Profile and membership policies stay narrow: this is
-- the one widened read, and designers are never part of a team.
create function public.client_team(p_client_id uuid)
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, coalesce(u.email, '')::text
  from public.client_memberships m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.client_id = p_client_id
    and p.role = 'client'
    and p.removed_at is null
    and (private.is_agency() or private.is_client_member(p_client_id))
  order by lower(p.display_name), p.id
$$;
revoke execute on function public.client_team(uuid) from public, anon;
grant execute on function public.client_team(uuid) to authenticated;

-- A person's own choice for one of their clients: false is My requests (the briefings they asked
-- for, and conversations they joined), true is every project at that client. The studio cannot set it.
create function public.set_client_notifications(p_client_id uuid, p_all boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_all is null then
    raise exception 'Choose which notifications to receive' using errcode = '22023';
  end if;
  if not private.is_client_member(p_client_id) then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  update public.client_memberships set notify_all = p_all
  where client_id = p_client_id and user_id = auth.uid();
end $$;
revoke execute on function public.set_client_notifications(uuid, boolean) from public, anon;
grant execute on function public.set_client_notifications(uuid, boolean) to authenticated;

-- A new trailing argument would leave an overload behind, so both signatures are replaced.
drop function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz);
drop function public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz);

-- The body of 202609200023_draft_conflict_response.sql plus the requester. A client person's first
-- save names them and later saves by anyone at the client keep it; a client person's
-- p_requested_by is ignored. The studio names one of the client's active people; when the client
-- has exactly one, that person is the only possible answer and is filled in; with several, a
-- missing choice is refused. That check runs after the write, so a scope error (such as another
-- client's campaign) keeps its own code.
create function public.save_briefing(
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

-- The body of 202609200022_atomic_draft_revision.sql, passing the requester through.
create function public.save_briefing_revision(
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
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result_id uuid; result_revision timestamptz;
begin
  result_id := public.save_briefing(p_client_id, p_service_type, p_title, p_campaign_id,
    p_overview, p_goals, p_direction, p_deliverables, p_due_date, p_estimated_credits,
    p_briefing_id, p_expected_updated_at, p_requested_by);
  select updated_at into result_revision from public.briefings where id = result_id;
  return jsonb_build_object('id', result_id, 'updated_at', result_revision);
end $$;
revoke execute on function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) from public, anon;
grant execute on function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) to authenticated;

-- The studio changes who a briefing's work is for, for example after the requester leaves: any
-- status, one of the client's active people, never empty. `updated_at` is left alone, so a
-- client's open draft does not read the change as a conflicting edit.
create function public.set_briefing_requester(p_briefing_id uuid, p_requested_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.briefings;
begin
  perform private.assert_agency();
  select * into target from public.briefings where id = p_briefing_id for update;
  if not found then raise exception 'Briefing not found'; end if;
  if not private.is_active_client_person(target.client_id, p_requested_by) then
    raise exception 'Choose a person from this client as the requester' using errcode = 'P0001';
  end if;
  if target.requested_by is not distinct from p_requested_by then return; end if;
  update public.briefings set requested_by = p_requested_by where id = target.id;
  perform private.audit('briefing.requester_changed', target.id,
    jsonb_build_object('requested_by', p_requested_by));
end $$;
revoke execute on function public.set_briefing_requester(uuid, uuid) from public, anon;
grant execute on function public.set_briefing_requester(uuid, uuid) to authenticated;

-- The body of 202609200018_review_serialization.sql plus `reviewed_by=auth.uid()`: the person
-- deciding. Same signature, so its grants are kept.
create or replace function public.review_publication(p_publication_id uuid, p_decision text, p_feedback text default '')
returns void language plpgsql security definer set search_path = '' as $$
 declare target_project uuid;target_client uuid;target_deliverable uuid;publication_number integer;existing public.publication_reviews;project_state public.project_status; begin
 select v.project_id,p.client_id,v.deliverable_id,v.version_number into target_project,target_client,target_deliverable,publication_number from public.published_versions v join public.projects p on p.id=v.project_id where v.id=p_publication_id;
 if not found or not private.is_client_member(target_client) then raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 p_feedback:=trim(coalesce(p_feedback,''));
 if p_decision='changes_requested' and p_feedback='' then raise exception 'Describe the requested changes'; end if;
 select status into project_state from public.projects where id=target_project for update;
 if exists(select 1 from public.published_versions where deliverable_id=target_deliverable and version_number>publication_number) then raise exception 'Review the latest published version'; end if;
 select * into existing from public.publication_reviews where publication_id=p_publication_id for update;
 if existing.status<>'pending' then
  if existing.status=p_decision and existing.feedback=p_feedback then return; end if;
  raise exception 'This publication already has a review decision';
 end if;
 if project_state='delivered' then raise exception 'Delivered projects cannot be reviewed'; end if;
 update public.publication_reviews set status=p_decision,feedback=p_feedback,reviewed_at=now(),reviewed_by=auth.uid() where publication_id=p_publication_id;
 update public.projects set status=case
  when exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.project_id=target_project and r.status='changes_requested' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=v.deliverable_id)) then 'changes_requested'::public.project_status
  when exists(select 1 from public.deliverables d where d.project_id=target_project and not exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.deliverable_id=d.id and r.status='approved' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=d.id))) then 'client_review'::public.project_status
  else 'approved'::public.project_status end,updated_at=now() where id=target_project;
 perform private.notify_agency(target_client,target_project,case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,p_feedback);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;
