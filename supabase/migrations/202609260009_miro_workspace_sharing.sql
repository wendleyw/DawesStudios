-- Miro workspace, part 2: client versions that belong to the project (no deliverable), shared
-- from a round or directly, each with its own client-board link, and their review.

alter table public.published_versions alter column deliverable_id drop not null;
create unique index published_versions_project_number on public.published_versions(project_id, version_number)
  where deliverable_id is null;

-- Who shared a project-level version and with which retry key. A direct version has no
-- publication_sources row, so this is where its publisher lives.
create table private.miro_share_requests (
  request_key uuid primary key,
  publication_id uuid not null unique references public.published_versions on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  source_round uuid references public.design_versions,
  requested_by uuid not null references public.profiles,
  created_at timestamptz not null default now()
);

create function public.share_miro_version(p_project_id uuid, p_url text, p_note text default '',
  p_source_round uuid default null, p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_note text := btrim(coalesce(p_note, '')); v_board text; v_widget text; next_number integer;
  result_id uuid; target_client uuid; req private.miro_share_requests;
begin
  perform private.assert_agency();
  if p_idempotency_key is null then p_idempotency_key := gen_random_uuid(); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into req from private.miro_share_requests where request_key = p_idempotency_key;
  if found then
    if req.project_id <> p_project_id or req.source_round is distinct from p_source_round
       or (select release_note from public.published_versions where id = req.publication_id) <> v_note then
      raise exception 'Idempotency key conflicts with a different version';
    end if;
    return req.publication_id;
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  select client_id into target_client from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.projects where id = p_project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot publish new revisions';
  end if;
  if p_source_round is not null and not exists(
    select 1 from public.design_versions where id = p_source_round and project_id = p_project_id and board_id is not null
  ) then
    raise exception 'Round not found in this project' using errcode = 'P0002';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.published_versions where project_id = p_project_id and deliverable_id is null;
  insert into public.published_versions(project_id, deliverable_id, version_number, release_note)
  values (p_project_id, null, next_number, v_note) returning id into result_id;
  insert into public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by)
  values (result_id, p_project_id, v_board, v_widget, auth.uid());
  insert into public.publication_reviews(publication_id, project_id) values (result_id, p_project_id);
  if p_source_round is not null then
    insert into private.publication_sources(publication_id, internal_version_id, published_by, request_key, request_note)
    values (result_id, p_source_round, auth.uid(), p_idempotency_key, v_note);
    update public.design_versions set status = 'reviewed' where id = p_source_round;
  end if;
  insert into private.miro_share_requests(request_key, publication_id, project_id, source_round, requested_by)
  values (p_idempotency_key, result_id, p_project_id, p_source_round, auth.uid());
  update public.projects set status = 'client_review', updated_at = now() where id = p_project_id;
  perform private.notify_client(target_client, p_project_id, 'New designs ready for review', v_note);
  perform private.audit('version.published', result_id);
  return result_id;
end $$;
revoke execute on function public.share_miro_version(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.share_miro_version(uuid, text, text, uuid, uuid) to authenticated;

create or replace function public.review_publication(p_publication_id uuid, p_decision text, p_feedback text default '')
returns void language plpgsql security definer set search_path = '' as $$
 declare target_project uuid;target_client uuid;target_deliverable uuid;publication_number integer;existing public.publication_reviews;project_state public.project_status; begin
 select v.project_id,p.client_id,v.deliverable_id,v.version_number into target_project,target_client,target_deliverable,publication_number from public.published_versions v join public.projects p on p.id=v.project_id where v.id=p_publication_id;
 if not found or not private.is_client_member(target_client) then raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 p_feedback:=trim(coalesce(p_feedback,''));
 if p_decision='changes_requested' and p_feedback='' then raise exception 'Describe the requested changes'; end if;
 select status into project_state from public.projects where id=target_project for update;
 -- changed: a project-level version (null deliverable) competes with the project's other project-level versions
 if exists(select 1 from public.published_versions where project_id=target_project and deliverable_id is not distinct from target_deliverable and version_number>publication_number) then raise exception 'Review the latest published version'; end if;
 select * into existing from public.publication_reviews where publication_id=p_publication_id for update;
 if existing.status<>'pending' then
  if existing.status=p_decision and existing.feedback=p_feedback then return; end if;
  raise exception 'This publication already has a review decision';
 end if;
 if project_state='delivered' then raise exception 'Delivered projects cannot be reviewed'; end if;
 update public.publication_reviews set status=p_decision,feedback=p_feedback,reviewed_at=now(),reviewed_by=auth.uid() where publication_id=p_publication_id;
 if target_deliverable is null then
  -- new: a project-level version stands for the whole project
  update public.projects set status=case when p_decision='approved' then 'approved'::public.project_status else 'changes_requested'::public.project_status end,updated_at=now() where id=target_project;
 else
 update public.projects set status=case
  -- changed: the latest version is found within the same project and deliverable
  when exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.project_id=target_project and v.deliverable_id is not null and r.status='changes_requested' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.project_id=v.project_id and v2.deliverable_id=v.deliverable_id)) then 'changes_requested'::public.project_status
  when exists(select 1 from public.deliverables d where d.project_id=target_project and not exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.deliverable_id=d.id and r.status='approved' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=d.id))) then 'client_review'::public.project_status
  else 'approved'::public.project_status end,updated_at=now() where id=target_project;
 end if;
 perform private.notify_agency(target_client,target_project,case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,p_feedback);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;
