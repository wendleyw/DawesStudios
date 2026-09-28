-- Guard missing latest decisions and malformed handoff rows; make delivery retries safe.
create or replace function public.mark_project_delivered(p_project_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; latest public.published_versions; review public.publication_reviews;
begin
 perform private.assert_agency();
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 if p.activity<>'active' then raise exception 'Resume the project before delivery' using errcode='22023'; end if;
 select * into latest from public.published_versions where project_id=p.id
  order by version_number desc,id desc limit 1;
 select * into review from public.publication_reviews where publication_id=latest.id for update;
 if latest.id is null or review.status is distinct from 'approved'
  or p.status not in ('approved','delivered') then
  raise exception 'Approve the latest client version before delivery' using errcode='22023'; end if;
 if not exists(select 1 from public.delivery_files where project_id=p.id) then
  raise exception 'Add a delivery file before marking delivered' using errcode='22023'; end if;
 if p.status='delivered' then return; end if;
 update public.projects set status='delivered',workflow_revision=workflow_revision+1 where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;

create or replace function public.handoff_board_work(p_project_id uuid,p_latest_publication_id uuid,
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
  where x->>'action' is null or x->>'action' not in ('continue','close')
   or x->>'boardId' is null
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
notify pgrst,'reload schema';
