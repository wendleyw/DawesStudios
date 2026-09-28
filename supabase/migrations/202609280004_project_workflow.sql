-- Action-driven project and board work. Existing rows are retained; legacy rounds receive
-- provenance without fabricated instructions or notifications.
alter table public.projects add column activity text not null default 'active'
  check (activity in ('active','backlog'));
alter table public.projects add column workflow_revision integer not null default 1
  check (workflow_revision > 0);
alter table public.design_boards add column activity text not null default 'active'
  check (activity in ('active','closed'));
alter table public.design_boards add column assignment_generation integer not null default 1
  check (assignment_generation > 0);
alter table public.design_boards add column workflow_revision integer not null default 1
  check (workflow_revision > 0);
alter table public.publication_reviews add column review_revision integer not null default 1
  check (review_revision > 0);

create table public.board_work_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  board_id uuid not null,
  recipient_id uuid not null references public.profiles(id),
  assignment_generation integer not null check (assignment_generation > 0),
  sequence integer not null check (sequence > 0),
  kind text not null check (kind in ('initial','revision','reactivation','legacy_round')),
  content jsonb,
  brief_revision integer,
  outcome text not null check (outcome in ('open','submitted','shared','closed')),
  current boolean not null default true,
  round_id uuid references public.design_versions(id),
  closed_reason text check (closed_reason in ('superseded','direction_closed','reassigned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (board_id,project_id) references public.design_boards(id,project_id),
  unique (board_id,sequence), unique (round_id),
  check ((content is null and brief_revision is null and kind='legacy_round')
    or (content is not null and brief_revision is not null)),
  check (outcome not in ('submitted','shared') or round_id is not null)
);
create unique index board_work_one_current on public.board_work_requests(board_id) where current;
create index board_work_recipient on public.board_work_requests(recipient_id,assignment_generation);
alter table public.design_versions add column work_request_id uuid references public.board_work_requests(id);
alter table public.design_versions add column assignment_generation integer not null default 1;

-- A legacy round proves a submission, but not which instructions it answered.
insert into public.board_work_requests(project_id,board_id,recipient_id,assignment_generation,
 sequence,kind,outcome,round_id)
select b.project_id,b.id,b.designer_id,b.assignment_generation,1,'legacy_round','submitted',v.id
from public.design_boards b
join lateral (select id from public.design_versions where board_id=b.id
  order by version_number desc,id desc limit 1) v on true;
update public.design_versions v set work_request_id=r.id
from public.board_work_requests r where r.round_id=v.id;
insert into public.board_work_requests(project_id,board_id,recipient_id,assignment_generation,
 sequence,kind,content,brief_revision,outcome)
select b.project_id,b.id,b.designer_id,b.assignment_generation,1,'initial',pb.content,pb.revision,'open'
from public.design_boards b join public.production_briefs pb on pb.board_id=b.id
where not exists (select 1 from public.board_work_requests r where r.board_id=b.id);

-- Reassignment closes an old generation, including legacy rounds, before a new release.
create or replace function private.can_see_board(target_board uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.is_agency() or exists(
  select 1 from public.design_boards b where b.id=target_board
   and b.designer_id=auth.uid() and private.can_produce(b.project_id)
 ),false)
$$;
drop policy versions_read on public.design_versions;
create policy versions_read on public.design_versions for select to authenticated
 using (private.can_produce(project_id) and private.can_see_board(board_id)
  and (private.is_agency() or assignment_generation=(select assignment_generation
   from public.design_boards where id=design_versions.board_id)));
alter policy production_briefs_read on public.production_briefs using (
 private.is_agency() or (private.can_see_board(board_id) and exists(
  select 1 from public.board_work_requests r join public.design_boards b on b.id=r.board_id
  where r.board_id=production_briefs.board_id and r.current and r.recipient_id=auth.uid()
   and r.assignment_generation=b.assignment_generation and r.content is not null))
);
alter table public.board_work_requests enable row level security;
create policy board_work_read on public.board_work_requests for select to authenticated using (
 private.is_agency() or (recipient_id=auth.uid() and private.can_see_board(board_id)
 and assignment_generation=(select b.assignment_generation from public.design_boards b where b.id=board_work_requests.board_id))
);
revoke all on public.board_work_requests from public,anon,authenticated;
grant select on public.board_work_requests to authenticated;
grant all on public.board_work_requests to service_role;
-- New state is exposed through the guarded projection; direct clients may read project activity.
grant select(activity,workflow_revision) on public.projects to authenticated;
grant select(review_revision) on public.publication_reviews to authenticated;

create table private.workflow_attempts (
 request_id uuid primary key,
 actor_id uuid not null references public.profiles(id),
 operation text not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
revoke all on private.workflow_attempts from public,anon,authenticated;
create table private.feedback_handoff_receipts (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 publication_id uuid not null unique references public.published_versions(id),
 review_revision integer not null,
 decisions jsonb not null,
 actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
revoke all on private.feedback_handoff_receipts from public,anon,authenticated;
create table private.publication_round_sources (
 publication_id uuid not null references public.published_versions(id),
 round_id uuid not null references public.design_versions(id),
 primary key(publication_id,round_id)
);
insert into private.publication_round_sources(publication_id,round_id)
select publication_id,internal_version_id from private.publication_sources;
revoke all on private.publication_round_sources from public,anon,authenticated;

create function private.workflow_replay(p_request_id uuid,p_operation text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.workflow_attempts;
begin
 if p_request_id is null then raise exception 'A request ID is required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into existing from private.workflow_attempts where request_id=p_request_id;
 if not found then return null; end if;
 if existing.actor_id<>auth.uid() or existing.operation<>p_operation or existing.payload<>p_payload then
  raise exception 'Request ID conflicts with a different action' using errcode='23505'; end if;
 return existing.result;
end $$;
revoke execute on function private.workflow_replay(uuid,text,jsonb) from public,anon,authenticated;

create function private.require_active_project(p_project_id uuid) returns public.projects
language plpgsql security definer set search_path='' as $$
declare p public.projects;
begin
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 if p.activity<>'active' then raise exception 'Resume the project before advancing work' using errcode='22023'; end if;
 if p.status='delivered' then raise exception 'Delivered projects cannot advance work' using errcode='22023'; end if;
 return p;
end $$;
revoke execute on function private.require_active_project(uuid) from public,anon,authenticated;

-- Preserve the existing content validator and draft save implementation behind a guarded
-- public release. The legacy implementation has no authenticated execute grant.
alter function public.save_production_brief(uuid,jsonb,integer,boolean,uuid)
 rename to save_production_brief_legacy;
revoke execute on function public.save_production_brief_legacy(uuid,jsonb,integer,boolean,uuid)
 from public,anon,authenticated;
create function public.save_production_brief(p_board_id uuid,p_content jsonb,
 p_expected_revision integer,p_publish boolean,p_request_id uuid,
 p_expected_board_revision integer default null,p_expected_assignment_generation integer default null)
returns integer language plpgsql security definer set search_path='' as $$
declare b public.design_boards; p public.projects; previous public.board_work_requests;
 result_revision integer; sequence_number integer; replay jsonb; payload jsonb;
begin
 perform private.assert_agency();
 if not p_publish then
  return public.save_production_brief_legacy(p_board_id,p_content,p_expected_revision,false,p_request_id);
 end if;
 if p_expected_board_revision is null or p_expected_assignment_generation is null then
  raise exception 'Expected board and assignment revisions are required' using errcode='22023'; end if;
 payload:=jsonb_build_object('boardId',p_board_id,'content',p_content,'expectedRevision',p_expected_revision,
  'expectedBoardRevision',p_expected_board_revision,'expectedAssignmentGeneration',p_expected_assignment_generation);
 replay:=private.workflow_replay(p_request_id,'release_brief',payload);
 if replay is not null then return (replay->>'revision')::integer; end if;
 select * into b from public.design_boards where id=p_board_id;
 if not found then raise exception 'Design board not found' using errcode='P0002'; end if;
 p:=private.require_active_project(b.project_id);
 select * into b from public.design_boards where id=p_board_id for update;
 if b.workflow_revision<>p_expected_board_revision or b.assignment_generation<>p_expected_assignment_generation then
  raise exception 'Board changed while you were editing' using errcode='40001'; end if;
 if b.activity<>'active' then raise exception 'Reactivate the board before releasing instructions' using errcode='22023'; end if;
 if not exists(select 1 from public.project_assignments a join public.profiles u on u.id=a.designer_id
   where a.project_id=p.id and a.designer_id=b.designer_id and u.removed_at is null) then
  raise exception 'Assign an active designer before release' using errcode='22023'; end if;
 select * into previous from public.board_work_requests where board_id=b.id and current for update;
 result_revision:=public.save_production_brief_legacy(p_board_id,p_content,p_expected_revision,true,p_request_id);
 if previous.id is not null then
  update public.board_work_requests set current=false,outcome='closed',closed_reason='superseded',updated_at=now()
   where id=previous.id;
 end if;
 select coalesce(max(sequence),0)+1 into sequence_number from public.board_work_requests where board_id=b.id;
 insert into public.board_work_requests(project_id,board_id,recipient_id,assignment_generation,
  sequence,kind,content,brief_revision,outcome)
 values(p.id,b.id,b.designer_id,b.assignment_generation,sequence_number,
  case when previous.id is null and sequence_number=1 then 'initial'
   when previous.id is null then 'reactivation' else 'revision' end,
  p_content,result_revision,'open');
 update public.design_boards set workflow_revision=workflow_revision+1 where id=b.id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'release_brief',payload,jsonb_build_object('revision',result_revision));
 return result_revision;
end $$;
revoke execute on function public.save_production_brief(uuid,jsonb,integer,boolean,uuid,integer,integer) from public,anon;
grant execute on function public.save_production_brief(uuid,jsonb,integer,boolean,uuid,integer,integer) to authenticated;

create function public.send_board_round_for_request(p_board_id uuid,p_request_id uuid,
 p_expected_board_revision integer,p_note text,p_frame_url text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.design_boards; p public.projects; r public.board_work_requests;
 v_board text; v_widget text; next_number integer; result_id uuid; replay jsonb; payload jsonb;
begin
 payload:=jsonb_build_object('boardId',p_board_id,'requestId',p_request_id,
  'expectedBoardRevision',p_expected_board_revision,'note',btrim(coalesce(p_note,'')),
  'frameUrl',nullif(btrim(coalesce(p_frame_url,'')),''));
 replay:=private.workflow_replay(p_idempotency_key,'submit_round',payload);
 if replay is not null then
  if not private.can_see_board(p_board_id) then raise exception 'Board access required' using errcode='42501'; end if;
  return (replay->>'roundId')::uuid;
 end if;
 select * into b from public.design_boards where id=p_board_id;
 if not found or not private.can_see_board(p_board_id) or b.designer_id<>auth.uid() then
  raise exception 'Board access required' using errcode='42501'; end if;
 p:=private.require_active_project(b.project_id);
 select * into b from public.design_boards where id=p_board_id for update;
 if b.workflow_revision<>p_expected_board_revision then raise exception 'Board changed while you were editing' using errcode='40001'; end if;
 if b.activity<>'active' then raise exception 'This board is closed' using errcode='22023'; end if;
 select * into r from public.board_work_requests where id=p_request_id and board_id=b.id and current for update;
 if not found or r.outcome<>'open' or r.assignment_generation<>b.assignment_generation
   or r.recipient_id<>auth.uid() then
  raise exception 'Current released work request required' using errcode='40001'; end if;
 if nullif(btrim(coalesce(p_frame_url,'')),'') is null then
  v_board:=b.board_id; v_widget:=b.widget_id;
 else
  select board_id,widget_id into v_board,v_widget from private.parse_miro_board_url(p_frame_url);
 end if;
 select coalesce(max(version_number),0)+1 into next_number from public.design_versions where board_id=b.id;
 insert into public.design_versions(project_id,board_id,version_number,notes,status,created_by,
  request_key,work_request_id,assignment_generation)
 values(p.id,b.id,next_number,btrim(coalesce(p_note,'')),'submitted',auth.uid(),p_idempotency_key,
  r.id,b.assignment_generation) returning id into result_id;
 insert into public.design_version_miro_links(version_id,project_id,board_id,widget_id,updated_by)
 values(result_id,p.id,v_board,v_widget,auth.uid());
 update public.board_work_requests set outcome='submitted',round_id=result_id,updated_at=now() where id=r.id;
 update public.design_boards set workflow_revision=workflow_revision+1 where id=b.id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 perform private.notify_agency(p.client_id,p.id,'Design ready for studio review',b.name);
 perform private.audit('round.sent',result_id,jsonb_build_object('board',b.id,'request',r.id));
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_idempotency_key,auth.uid(),'submit_round',payload,jsonb_build_object('roundId',result_id));
 return result_id;
end $$;
revoke execute on function public.send_board_round_for_request(uuid,uuid,integer,text,text,uuid) from public,anon;
grant execute on function public.send_board_round_for_request(uuid,uuid,integer,text,text,uuid) to authenticated;
revoke execute on function public.send_board_round(uuid,text,text,uuid) from public,anon,authenticated;

create function public.share_workflow_version(p_project_id uuid,p_url text,p_note text,
 p_source_round_ids uuid[],p_expected_latest_publication_id uuid,p_expected_review_revision integer,
 p_confirm_replacement boolean,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.projects; latest public.published_versions; review public.publication_reviews;
 round_row public.design_versions; work public.board_work_requests; result_id uuid;
 v_board text; v_widget text; next_number integer; sources uuid[]; source_id uuid;
 replay jsonb; payload jsonb;
begin
 perform private.assert_agency();
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into sources
 from unnest(coalesce(p_source_round_ids,'{}'::uuid[])) id;
 payload:=jsonb_build_object('projectId',p_project_id,'url',p_url,'note',btrim(coalesce(p_note,'')),
  'sources',to_jsonb(sources),'expectedLatestPublicationId',p_expected_latest_publication_id,
  'expectedReviewRevision',p_expected_review_revision,'confirmReplacement',p_confirm_replacement);
 replay:=private.workflow_replay(p_request_id,'share_version',payload);
 if replay is not null then return (replay->>'publicationId')::uuid; end if;
 select board_id,widget_id into v_board,v_widget from private.parse_miro_board_url(p_url);
 p:=private.require_active_project(p_project_id);
 select * into latest from public.published_versions where project_id=p.id
  order by version_number desc,id desc limit 1;
 if latest.id is distinct from p_expected_latest_publication_id then
  raise exception 'Latest client version changed' using errcode='40001'; end if;
 if latest.id is not null then
  select * into review from public.publication_reviews where publication_id=latest.id for update;
  if review.review_revision is distinct from p_expected_review_revision then
   raise exception 'Client review changed' using errcode='40001'; end if;
  if review.status in ('pending','approved') and not coalesce(p_confirm_replacement,false) then
   raise exception 'Confirm replacement of the latest client version' using errcode='22023'; end if;
 elsif p_expected_review_revision is not null then
  raise exception 'No prior client review exists' using errcode='40001';
 end if;
 -- Lock all touched boards in UUID order after the project lock.
 perform 1 from public.design_boards where id in
  (select v.board_id from public.design_versions v where v.id=any(sources)) order by id for update;
 foreach source_id in array sources loop
  select * into round_row from public.design_versions where id=source_id;
  if not found or round_row.project_id<>p.id or round_row.status not in ('submitted','reviewed') then
   raise exception 'Select submitted rounds in this project' using errcode='22023'; end if;
 end loop;
 select coalesce(max(version_number),0)+1 into next_number from public.published_versions where project_id=p.id;
 insert into public.published_versions(project_id,version_number,release_note)
 values(p.id,next_number,btrim(coalesce(p_note,''))) returning id into result_id;
 insert into public.publication_miro_links(publication_id,project_id,board_id,widget_id,updated_by)
 values(result_id,p.id,v_board,v_widget,auth.uid());
 insert into public.publication_reviews(publication_id,project_id) values(result_id,p.id);
 foreach source_id in array sources loop
  insert into private.publication_round_sources(publication_id,round_id) values(result_id,source_id);
  select * into work from public.board_work_requests where id=(select work_request_id
   from public.design_versions where id=source_id) for update;
  if found and work.current and work.outcome='submitted' and work.round_id=source_id then
   update public.board_work_requests set outcome='shared',updated_at=now() where id=work.id;
   update public.design_versions set status='reviewed' where id=source_id;
   update public.design_boards set workflow_revision=workflow_revision+1 where id=work.board_id;
  end if;
 end loop;
 insert into private.miro_share_requests(request_key,publication_id,project_id,source_round,requested_by)
 values(p_request_id,result_id,p.id,case when cardinality(sources)=1 then sources[1] else null end,auth.uid());
 update public.projects set status='client_review',workflow_revision=workflow_revision+1 where id=p.id;
 perform private.notify_client(p.client_id,p.id,'New designs ready for review',btrim(coalesce(p_note,'')));
 perform private.audit('version.published',result_id);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'share_version',payload,jsonb_build_object('publicationId',result_id));
 return result_id;
end $$;
revoke execute on function public.share_workflow_version(uuid,text,text,uuid[],uuid,integer,boolean,uuid) from public,anon;
grant execute on function public.share_workflow_version(uuid,text,text,uuid[],uuid,integer,boolean,uuid) to authenticated;
revoke execute on function public.share_miro_version(uuid,text,text,uuid,uuid) from public,anon,authenticated;

create or replace function public.review_publication(p_publication_id uuid,p_decision text,p_feedback text default '')
returns void language plpgsql security definer set search_path='' as $$
declare publication public.published_versions; p public.projects; review public.publication_reviews;
 feedback_text text:=btrim(coalesce(p_feedback,''));
begin
 select * into publication from public.published_versions where id=p_publication_id;
 if not found then raise exception 'Client version not found' using errcode='P0002'; end if;
 if not private.is_client_member((select client_id from public.projects where id=publication.project_id)) then
  raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') or
   (p_decision='changes_requested' and feedback_text='') then
  raise exception 'Choose a decision and describe requested changes' using errcode='22023'; end if;
 p:=private.require_active_project(publication.project_id);
 if exists(select 1 from public.published_versions where project_id=p.id
  and version_number>publication.version_number) then
  raise exception 'Review the latest published version' using errcode='40001'; end if;
 select * into review from public.publication_reviews where publication_id=p_publication_id for update;
 if review.status<>'pending' then
  if review.status=p_decision and review.feedback=feedback_text then return; end if;
  raise exception 'This publication already has a review decision' using errcode='22023'; end if;
 update public.publication_reviews set status=p_decision,feedback=feedback_text,
  reviewed_at=now(),reviewed_by=auth.uid(),review_revision=review_revision+1
 where publication_id=p_publication_id;
 update public.projects set status=case when p_decision='approved' then 'approved'::public.project_status
  else 'changes_requested'::public.project_status end,workflow_revision=workflow_revision+1 where id=p.id;
 perform private.notify_agency(p.client_id,p.id,
  case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,
  feedback_text);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;

create or replace function public.mark_project_delivered(p_project_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; latest public.published_versions; review public.publication_reviews;
begin
 perform private.assert_agency();
 p:=private.require_active_project(p_project_id);
 select * into latest from public.published_versions where project_id=p.id
  order by version_number desc,id desc limit 1;
 select * into review from public.publication_reviews where publication_id=latest.id for update;
 if p.status<>'approved' or review.status<>'approved' then
  raise exception 'Approve the latest client version before delivery' using errcode='22023'; end if;
 if not exists(select 1 from public.delivery_files where project_id=p.id) then
  raise exception 'Add a delivery file before marking delivered' using errcode='22023'; end if;
 update public.projects set status='delivered',workflow_revision=workflow_revision+1 where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;

create function public.handoff_board_work(p_project_id uuid,p_latest_publication_id uuid,
 p_expected_review_revision integer,p_board_decisions jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects; latest public.published_versions; review public.publication_reviews;
 b public.design_boards; d jsonb; current_work public.board_work_requests;
 decision_count integer; continue_count integer; expected_brief integer; released_revision integer;
 replay jsonb; payload jsonb; result jsonb;
begin
 perform private.assert_agency();
 if jsonb_typeof(p_board_decisions) is distinct from 'array' then
  raise exception 'Board decisions must be an array' using errcode='22023'; end if;
 decision_count:=jsonb_array_length(p_board_decisions);
 if decision_count=0 or decision_count>50 then
  raise exception 'Choose boards for the handoff' using errcode='22023'; end if;
 select count(*) into continue_count from jsonb_array_elements(p_board_decisions) x
  where x->>'action'='continue' and jsonb_typeof(x->'content')='object';
 if continue_count=0 then
  raise exception 'Send valid instructions to at least one continuing board' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_board_decisions) x
  where x->>'action' not in ('continue','close') or x->>'boardId' is null
   or x->>'expectedBoardRevision' is null or x->>'expectedAssignmentGeneration' is null
   or (x->>'action'='continue' and x->>'expectedBriefRevision' is null)) then
  raise exception 'Complete each board decision and expected revision' using errcode='22023'; end if;
 if (select count(distinct x->>'boardId') from jsonb_array_elements(p_board_decisions) x)<>decision_count then
  raise exception 'Each board can appear only once' using errcode='22023'; end if;
 payload:=jsonb_build_object('projectId',p_project_id,'publicationId',p_latest_publication_id,
  'reviewRevision',p_expected_review_revision,'decisions',p_board_decisions);
 replay:=private.workflow_replay(p_request_id,'handoff',payload);
 if replay is not null then return replay; end if;
 p:=private.require_active_project(p_project_id);
 if p_latest_publication_id is not null then
  select * into latest from public.published_versions where project_id=p.id
   order by version_number desc,id desc limit 1;
  if latest.id is distinct from p_latest_publication_id then
   raise exception 'Latest client version changed' using errcode='40001'; end if;
  select * into review from public.publication_reviews where publication_id=latest.id for update;
  if review.status<>'changes_requested' or review.review_revision is distinct from p_expected_review_revision
    or exists(select 1 from private.feedback_handoff_receipts where publication_id=latest.id) then
   raise exception 'Client feedback already changed or was handled' using errcode='40001'; end if;
 elsif p_expected_review_revision is not null then
  raise exception 'A review revision needs a publication' using errcode='22023';
 elsif exists(select 1 from public.published_versions v join public.publication_reviews r
  on r.publication_id=v.id where v.id=(select id from public.published_versions
  where project_id=p.id order by version_number desc,id desc limit 1) and r.status='changes_requested'
  and not exists(select 1 from private.feedback_handoff_receipts h where h.publication_id=v.id)) then
  raise exception 'Handle the current client feedback with its review revision' using errcode='40001'; end if;
 -- Lock every selected board before changing any of them. An invalid row aborts the batch.
 perform 1 from public.design_boards where id in
  (select (x->>'boardId')::uuid from jsonb_array_elements(p_board_decisions) x)
  order by id for update;
 for d in select value from jsonb_array_elements(p_board_decisions)
  order by (value->>'boardId')::uuid loop
  select * into b from public.design_boards where id=(d->>'boardId')::uuid;
  if not found or b.project_id<>p.id or b.workflow_revision<>(d->>'expectedBoardRevision')::integer
   or b.assignment_generation<>(d->>'expectedAssignmentGeneration')::integer then
   raise exception 'Board changed while preparing the handoff' using errcode='40001'; end if;
  if b.activity<>'active' then raise exception 'Reactivate closed boards separately' using errcode='22023'; end if;
  if d->>'action'='continue' then
   select coalesce(revision,0) into expected_brief from public.production_brief_drafts where board_id=b.id;
   if coalesce(expected_brief,0)<>(d->>'expectedBriefRevision')::integer then
    raise exception 'Production instructions changed while preparing the handoff' using errcode='40001'; end if;
  end if;
 end loop;
 for d in select value from jsonb_array_elements(p_board_decisions)
  order by (value->>'boardId')::uuid loop
  select * into b from public.design_boards where id=(d->>'boardId')::uuid;
  if d->>'action'='close' then
   select * into current_work from public.board_work_requests where board_id=b.id and current for update;
   if found then
    update public.board_work_requests set current=false,outcome='closed',closed_reason='direction_closed',updated_at=now()
     where id=current_work.id;
   end if;
   update public.design_boards set activity='closed',workflow_revision=workflow_revision+1 where id=b.id;
   insert into public.notifications(user_id,client_id,project_id,title,body)
    values(b.designer_id,p.client_id,p.id,'No further work needed',b.name);
  else
   released_revision:=public.save_production_brief(b.id,d->'content',
    (d->>'expectedBriefRevision')::integer,true,
    md5(p_request_id::text||b.id::text)::uuid,
    (d->>'expectedBoardRevision')::integer,b.assignment_generation);
  end if;
 end loop;
 if p_latest_publication_id is not null then
  insert into private.feedback_handoff_receipts(project_id,publication_id,review_revision,decisions,actor_id)
   values(p.id,p_latest_publication_id,p_expected_review_revision,p_board_decisions,auth.uid());
  update public.projects set status='in_progress',workflow_revision=workflow_revision+1 where id=p.id;
 else
  update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 end if;
 result:=jsonb_build_object('projectId',p.id,'continued',continue_count,'closed',decision_count-continue_count);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'handoff',payload,result);
 perform private.audit('project.handoff',p.id,jsonb_build_object('continued',continue_count,'closed',decision_count-continue_count));
 return result;
end $$;
revoke execute on function public.handoff_board_work(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.handoff_board_work(uuid,uuid,integer,jsonb,uuid) to authenticated;

create function public.close_board_work(p_board_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.design_boards; p public.projects; result jsonb; replay jsonb; payload jsonb;
begin
 perform private.assert_agency();
 payload:=jsonb_build_object('boardId',p_board_id,'expectedRevision',p_expected_revision);
 replay:=private.workflow_replay(p_request_id,'close_board',payload);
 if replay is not null then return replay; end if;
 select * into b from public.design_boards where id=p_board_id;
 if not found then raise exception 'Board not found' using errcode='P0002'; end if;
 p:=private.require_active_project(b.project_id);
 select * into b from public.design_boards where id=p_board_id for update;
 if b.workflow_revision<>p_expected_revision then raise exception 'Board changed' using errcode='40001'; end if;
 if b.activity<>'active' then raise exception 'Board already closed' using errcode='22023'; end if;
 update public.board_work_requests set current=false,outcome='closed',closed_reason='direction_closed',updated_at=now()
  where board_id=b.id and current;
 update public.design_boards set activity='closed',workflow_revision=workflow_revision+1 where id=b.id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 insert into public.notifications(user_id,client_id,project_id,title,body)
 values(b.designer_id,p.client_id,p.id,'No further work needed',b.name);
 result:=jsonb_build_object('boardId',b.id,'activity','closed','workflowRevision',b.workflow_revision+1);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'close_board',payload,result);
 return result;
end $$;
revoke execute on function public.close_board_work(uuid,integer,uuid) from public,anon;
grant execute on function public.close_board_work(uuid,integer,uuid) to authenticated;

create function public.reactivate_board_work(p_board_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.design_boards; p public.projects; result jsonb; replay jsonb; payload jsonb;
begin
 perform private.assert_agency();
 payload:=jsonb_build_object('boardId',p_board_id,'expectedRevision',p_expected_revision);
 replay:=private.workflow_replay(p_request_id,'reactivate_board',payload);
 if replay is not null then return replay; end if;
 select * into b from public.design_boards where id=p_board_id;
 if not found then raise exception 'Board not found' using errcode='P0002'; end if;
 p:=private.require_active_project(b.project_id);
 select * into b from public.design_boards where id=p_board_id for update;
 if b.workflow_revision<>p_expected_revision then raise exception 'Board changed' using errcode='40001'; end if;
 if b.activity<>'closed' then raise exception 'Board is already active' using errcode='22023'; end if;
 update public.design_boards set activity='active',workflow_revision=workflow_revision+1 where id=b.id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 result:=jsonb_build_object('boardId',b.id,'activity','active','workflowRevision',b.workflow_revision+1);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'reactivate_board',payload,result);
 return result;
end $$;
revoke execute on function public.reactivate_board_work(uuid,integer,uuid) from public,anon;
grant execute on function public.reactivate_board_work(uuid,integer,uuid) to authenticated;

create function public.save_project_details_with_activity(p_project_id uuid,p_title text,
 p_description text,p_due_date date,p_start_date date,p_activity text,
 p_expected_updated_at timestamptz,p_expected_workflow_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects; result jsonb; replay jsonb; payload jsonb; old_activity text;
begin
 perform private.assert_agency();
 payload:=jsonb_build_object('projectId',p_project_id,'title',btrim(coalesce(p_title,'')),
  'description',coalesce(p_description,''),'dueDate',p_due_date,'startDate',p_start_date,
  'activity',p_activity,'expectedUpdatedAt',p_expected_updated_at,
  'expectedWorkflowRevision',p_expected_workflow_revision);
 replay:=private.workflow_replay(p_request_id,'save_project_details',payload);
 if replay is not null then return replay; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 if p.updated_at is distinct from p_expected_updated_at or p.workflow_revision<>p_expected_workflow_revision then
  raise exception 'Project changed while you were editing' using errcode='40001'; end if;
 if p_activity is null or p_activity not in ('active','backlog') or length(btrim(coalesce(p_title,''))) not between 1 and 200
  or length(coalesce(p_description,''))>12000 or (p_due_date is not null and p_start_date>p_due_date) then
  raise exception 'Review project details and activity' using errcode='22023'; end if;
 if p.status='delivered' and p_activity='backlog' then
  raise exception 'Delivered projects cannot enter backlog' using errcode='22023'; end if;
 if p_due_date is not null and exists(select 1 from public.design_boards b
  where b.project_id=p.id and b.due_date>p_due_date) then
  raise exception 'Project due date cannot precede a board deadline' using errcode='22023'; end if;
 old_activity:=p.activity;
 update public.projects set title=btrim(p_title),description=p_description,due_date=p_due_date,
  start_date=p_start_date,activity=p_activity,
  workflow_revision=case when activity is distinct from p_activity then workflow_revision+1 else workflow_revision end
 where id=p.id returning * into p;
 if old_activity<>p.activity then
  perform private.notify_client(p.client_id,p.id,
   case when p.activity='backlog' then 'Project moved to backlog' else 'Project resumed' end,p.title);
  insert into public.notifications(user_id,client_id,project_id,title,body)
   select distinct b.designer_id,p.client_id,p.id,
    case when p.activity='backlog' then 'Project moved to backlog' else 'Project resumed' end,p.title
   from public.design_boards b join public.profiles u on u.id=b.designer_id and u.removed_at is null
   where b.project_id=p.id;
 end if;
 result:=jsonb_build_object('projectId',p.id,'updatedAt',p.updated_at,
  'activity',p.activity,'workflowRevision',p.workflow_revision);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'save_project_details',payload,result);
 return result;
end $$;
revoke execute on function public.save_project_details_with_activity(uuid,text,text,date,date,text,timestamptz,integer,uuid)
 from public,anon;
grant execute on function public.save_project_details_with_activity(uuid,text,text,date,date,text,timestamptz,integer,uuid)
 to authenticated;

-- The existing board editor now closes old work on reassignment, increments generation, and
-- leaves the new assignee waiting for an explicit production release.
create or replace function public.update_design_board(p_board_id uuid,p_name text,p_url text,
 p_designer_id uuid,p_due_date date default null)
returns void language plpgsql security definer set search_path='' as $$
declare b public.design_boards; p public.projects; v_name text:=btrim(coalesce(p_name,''));
 v_board text; v_widget text;
begin
 perform private.assert_agency();
 select * into b from public.design_boards where id=p_board_id;
 if not found then raise exception 'Board not found' using errcode='P0002'; end if;
 p:=private.require_active_project(b.project_id);
 select * into b from public.design_boards where id=p_board_id for update;
 if length(v_name) not between 1 and 80 then
  raise exception 'Name the board (up to 80 characters)' using errcode='22023'; end if;
 if not exists(select 1 from public.project_assignments a join public.profiles u on u.id=a.designer_id
   where a.project_id=p.id and a.designer_id=p_designer_id and u.removed_at is null) then
  raise exception 'Assign an active designer to the project first' using errcode='22023'; end if;
 perform private.assert_board_due_date(p.id,p_due_date);
 select board_id,widget_id into v_board,v_widget from private.parse_miro_board_url(p_url);
 if b.designer_id is distinct from p_designer_id then
  update public.board_work_requests set current=false,outcome='closed',closed_reason='reassigned',updated_at=now()
   where board_id=b.id and current;
  delete from public.production_brief_drafts where board_id=b.id;
  delete from public.production_briefs where board_id=b.id;
  update public.design_boards set name=v_name,designer_id=p_designer_id,board_id=v_board,
   widget_id=v_widget,due_date=p_due_date,assignment_generation=assignment_generation+1,
   workflow_revision=workflow_revision+1,updated_at=now() where id=b.id;
 else
  update public.design_boards set name=v_name,board_id=v_board,widget_id=v_widget,
   due_date=p_due_date,updated_at=now() where id=b.id;
 end if;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 perform private.audit('design_board.updated',b.id,jsonb_build_object('project',p.id));
end $$;

create or replace function private.can_see_version(target_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.can_see_board(v.board_id) and
  (private.is_agency() or v.assignment_generation=b.assignment_generation)
  from public.design_versions v join public.design_boards b on b.id=v.board_id
  where v.id=target_version),true)
$$;
alter policy design_version_miro_links_read on public.design_version_miro_links
 using(private.can_produce(project_id) and private.can_see_version(version_id));

create or replace function public.set_version_miro_link(p_version_id uuid,p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.design_versions; b public.design_boards; v_board text; v_widget text;
begin
 select * into v from public.design_versions where id=p_version_id;
 if not found then raise exception 'Version not found' using errcode='P0002'; end if;
 if not private.can_see_version(v.id) then raise exception 'Round access required' using errcode='42501'; end if;
 select * into b from public.design_boards where id=v.board_id;
 if not private.is_agency() and (b.designer_id<>auth.uid() or
  (select status from public.projects where id=v.project_id)='delivered') then
  raise exception 'Round access required' using errcode='42501'; end if;
 select board_id,widget_id into v_board,v_widget from private.parse_miro_board_url(p_url);
 insert into public.design_version_miro_links(version_id,project_id,board_id,widget_id,updated_by)
 values(v.id,v.project_id,v_board,v_widget,auth.uid())
 on conflict(version_id) do update set board_id=excluded.board_id,widget_id=excluded.widget_id,
  updated_by=excluded.updated_by,updated_at=now();
 perform private.audit('version.miro_link_set',v.project_id);
end $$;

create function public.get_project_workflow(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; latest public.published_versions; review public.publication_reviews;
 agency boolean:=private.is_agency(); client_user boolean; designer_user boolean;
 boards jsonb:='[]'::jsonb; result jsonb;
begin
 if not private.can_access_project(p_project_id) then
  raise exception 'Project access required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id;
 client_user:=private.is_client_member(p.client_id);
 designer_user:=private.current_role()='designer';
 if agency or client_user then
  select * into latest from public.published_versions where project_id=p.id
   order by version_number desc,id desc limit 1;
  if latest.id is not null then
   select * into review from public.publication_reviews where publication_id=latest.id;
  end if;
 end if;
 if agency or designer_user then
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,'name',b.name,'activity',b.activity,
   'designerId',case when agency then b.designer_id else null end,
   'assignmentGeneration',b.assignment_generation,'workflowRevision',b.workflow_revision,
   'briefRevision',case when agency then coalesce(d.revision,0) else null end,
   'briefContent',case when agency then coalesce(d.content,brief.content) else null end,
   'currentRequest',case when r.id is null then null else jsonb_build_object(
    'id',r.id,'sequence',r.sequence,'kind',r.kind,'outcome',r.outcome,
    'roundId',r.round_id,'content',r.content) end,
   'capabilities',jsonb_build_object(
    'release',agency and p.activity='active' and p.status<>'delivered' and b.activity='active',
    'submit',designer_user and b.designer_id=auth.uid() and p.activity='active'
       and p.status<>'delivered' and b.activity='active' and r.outcome='open',
    'requestChanges',agency and p.activity='active' and p.status<>'delivered'
       and b.activity='active' and r.outcome='submitted',
    'close',agency and p.activity='active' and p.status<>'delivered' and b.activity='active',
    'reactivate',agency and p.activity='active' and p.status<>'delivered' and b.activity='closed'))
   order by b.created_at,b.id),'[]'::jsonb) into boards
  from public.design_boards b
  left join public.production_brief_drafts d on d.board_id=b.id and agency
  left join public.production_briefs brief on brief.board_id=b.id and agency
  left join public.board_work_requests r on r.board_id=b.id and r.current
   and (agency or (r.recipient_id=auth.uid() and r.assignment_generation=b.assignment_generation))
  where b.project_id=p.id and (agency or b.designer_id=auth.uid());
 end if;
 result:=jsonb_build_object('project',jsonb_build_object(
  'id',p.id,'status',p.status,'activity',p.activity,'workflowRevision',p.workflow_revision,
  'updatedAt',p.updated_at,
  'latestPublication',case when latest.id is null then null else jsonb_build_object(
   'id',latest.id,'number',latest.version_number,'decision',review.status,
   'reviewRevision',review.review_revision) end),
  'boards',boards,'capabilities',jsonb_build_object(
   'publish',agency and p.activity='active' and p.status<>'delivered',
   'review',client_user and p.activity='active' and review.status='pending',
   'deliver',agency and p.activity='active' and p.status='approved' and review.status='approved',
   'respondFeedback',agency and p.activity='active' and review.status='changes_requested'
    and not exists(select 1 from private.feedback_handoff_receipts where publication_id=latest.id)));
 return result;
end $$;
revoke execute on function public.get_project_workflow(uuid) from public,anon;
grant execute on function public.get_project_workflow(uuid) to authenticated;

create function private.has_feedback_handoff(p_publication_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.feedback_handoff_receipts where publication_id=p_publication_id)
$$;
revoke execute on function private.has_feedback_handoff(uuid) from public,anon;
grant execute on function private.has_feedback_handoff(uuid) to authenticated;

create or replace view public.action_notifications
with (security_invoker=true,security_barrier=true) as
with latest_publication as (
 select distinct on (project_id) id,project_id,published_at
 from public.published_versions order by project_id,version_number desc,id desc
)
select ('review_briefing:'||b.id::text)::text id,'review_briefing'::text kind,
 b.client_id,null::uuid project_id,b.id entity_id,null::uuid board_id,b.title::text subject,b.updated_at created_at
from public.briefings b where private.is_agency() and b.status='awaiting_review'
 and not exists(select 1 from public.projects p where p.briefing_id=b.id)
union all
select ('start_project:'||b.id::text),'start_project',b.client_id,null::uuid,b.id,null::uuid,b.title::text,b.updated_at
from public.briefings b where private.is_agency() and b.status='budget_confirmed'
 and not exists(select 1 from public.projects p where p.briefing_id=b.id)
union all
select ('review_credit_request:'||r.id::text),'review_credit_request',r.client_id,null::uuid,
 r.id,null::uuid,(c.name||' - '||r.amount::text||' credits')::text,r.created_at
from public.credit_requests r join public.clients c on c.id=r.client_id
where private.is_agency() and r.status='pending'
union all
select ('prepare_project:'||p.id::text),'prepare_project',p.client_id,p.id,p.id,null::uuid,p.title::text,p.created_at
from public.projects p where private.is_agency() and p.activity='active' and p.status<>'delivered'
 and not exists(select 1 from public.design_boards b where b.project_id=p.id)
 and not exists(select 1 from public.published_versions v where v.project_id=p.id)
union all
select ('prepare_board:'||b.id::text),'prepare_board',p.client_id,p.id,b.id,b.id,
 (p.title||' · '||b.name)::text,b.created_at
from public.design_boards b join public.projects p on p.id=b.project_id
where private.is_agency() and p.activity='active' and p.status<>'delivered' and b.activity='active'
 and not exists(select 1 from public.board_work_requests r where r.board_id=b.id and r.current)
union all
select ('review_round:'||r.round_id::text),'review_round',p.client_id,p.id,r.round_id,r.board_id,
 (p.title||' · '||b.name)::text,r.updated_at
from public.board_work_requests r join public.design_boards b on b.id=r.board_id
join public.projects p on p.id=r.project_id
where private.is_agency() and p.activity='active' and p.status<>'delivered' and b.activity='active'
 and r.current and r.outcome='submitted'
union all
select ('respond_feedback:'||v.id::text),'respond_feedback',p.client_id,p.id,v.id,null::uuid,
 p.title::text,coalesce(review.reviewed_at,v.published_at)
from latest_publication v join public.publication_reviews review on review.publication_id=v.id
join public.projects p on p.id=v.project_id
where private.is_agency() and p.activity='active' and p.status<>'delivered'
 and review.status='changes_requested'
 and not private.has_feedback_handoff(v.id)
union all
select ('deliver_project:'||v.id::text),'deliver_project',p.client_id,p.id,v.id,null::uuid,
 p.title::text,coalesce(review.reviewed_at,v.published_at)
from latest_publication v join public.publication_reviews review on review.publication_id=v.id
join public.projects p on p.id=v.project_id
where private.is_agency() and p.activity='active' and p.status='approved' and review.status='approved'
union all
select ('submit_round:'||b.id::text),'submit_round',p.client_id,p.id,b.id,b.id,
 (p.title||' · '||b.name)::text,r.created_at
from public.board_work_requests r join public.design_boards b on b.id=r.board_id
join public.projects p on p.id=r.project_id
join public.project_assignments a on a.project_id=p.id and a.designer_id=b.designer_id
where private.current_role()='designer' and b.designer_id=auth.uid() and r.recipient_id=auth.uid()
 and r.assignment_generation=b.assignment_generation and r.current and r.outcome='open' and r.kind='initial'
 and p.activity='active' and p.status<>'delivered' and b.activity='active'
union all
select ('revise_board:'||b.id::text),'revise_board',p.client_id,p.id,b.id,b.id,
 (p.title||' · '||b.name)::text,r.created_at
from public.board_work_requests r join public.design_boards b on b.id=r.board_id
join public.projects p on p.id=r.project_id
join public.project_assignments a on a.project_id=p.id and a.designer_id=b.designer_id
where private.current_role()='designer' and b.designer_id=auth.uid() and r.recipient_id=auth.uid()
 and r.assignment_generation=b.assignment_generation and r.current and r.outcome='open'
 and r.kind in ('revision','reactivation') and p.activity='active' and p.status<>'delivered' and b.activity='active'
union all
select ('review_version:'||v.id::text),'review_version',p.client_id,p.id,v.id,null::uuid,
 p.title::text,v.published_at
from latest_publication v join public.publication_reviews review on review.publication_id=v.id
join public.projects p on p.id=v.project_id
where private.current_role()='client' and review.status='pending' and p.activity='active'
 and p.status<>'delivered' and private.can_receive_project_action(p.id);

-- Work request columns and client decisions stay out of client Realtime publications.
notify pgrst,'reload schema';

create or replace function public.create_design_board(p_project_id uuid,p_name text,p_url text,
 p_designer_id uuid,p_due_date date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.projects; v_name text:=btrim(coalesce(p_name,''));
 v_board text; v_widget text; result_id uuid;
begin
 perform private.assert_agency();
 p:=private.require_active_project(p_project_id);
 if length(v_name) not between 1 and 80 then
  raise exception 'Name the board (up to 80 characters)' using errcode='22023'; end if;
 if not exists(select 1 from public.project_assignments a join public.profiles u on u.id=a.designer_id
  where a.project_id=p.id and a.designer_id=p_designer_id and u.removed_at is null) then
  raise exception 'Assign an active designer to the project first' using errcode='22023'; end if;
 perform private.assert_board_due_date(p.id,p_due_date);
 select board_id,widget_id into v_board,v_widget from private.parse_miro_board_url(p_url);
 insert into public.design_boards(project_id,name,designer_id,board_id,widget_id,due_date,created_by)
 values(p.id,v_name,p_designer_id,v_board,v_widget,p_due_date,auth.uid()) returning id into result_id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 perform private.audit('design_board.created',result_id,jsonb_build_object('project',p.id));
 return result_id;
end $$;
