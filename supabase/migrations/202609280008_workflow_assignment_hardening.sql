-- Forward workflow hardening after independent authorization and notification review.
-- Every assignment removal, including team removal and direct service cleanup, ends
-- that designer's current board obligations before the transaction commits.
create function private.close_work_on_assignment_delete() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.design_boards; touched boolean:=false;
begin
 perform 1 from public.projects where id=old.project_id for update;
 if not found then return old; end if;
 for b in select * from public.design_boards
  where project_id=old.project_id and designer_id=old.designer_id
  order by id for update loop
  update public.board_work_requests set current=false,outcome='closed',
   closed_reason='reassigned',updated_at=now()
   where board_id=b.id and current;
  delete from public.production_brief_drafts where board_id=b.id;
  delete from public.production_briefs where board_id=b.id;
  update public.design_boards set assignment_generation=assignment_generation+1,
   workflow_revision=workflow_revision+1,updated_at=now() where id=b.id;
  touched:=true;
 end loop;
 if touched then
  update public.projects set workflow_revision=workflow_revision+1 where id=old.project_id;
 end if;
 return old;
end $$;
revoke execute on function private.close_work_on_assignment_delete() from public,anon,authenticated;
create trigger project_assignment_work_closed after delete on public.project_assignments
 for each row execute function private.close_work_on_assignment_delete();

-- Metadata must pass the expected timestamp and workflow revision guard. Canvas moves
-- retain their separate direct column grant.
revoke update(title,description,due_date,start_date) on public.projects from authenticated;
grant update(board_position) on public.projects to authenticated;

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
 update public.projects set status='delivered',delivered_at=now(),workflow_revision=workflow_revision+1 where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;

create or replace function public.save_project_details_with_activity(p_project_id uuid,p_title text,
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
  raise exception 'Project changed while you were editing' using errcode='PT409'; end if;
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
   from public.design_boards b
   join public.project_assignments a on a.project_id=b.project_id and a.designer_id=b.designer_id
   join public.profiles u on u.id=b.designer_id and u.role='designer' and u.removed_at is null
   where b.project_id=p.id;
 end if;
 result:=jsonb_build_object('projectId',p.id,'updatedAt',p.updated_at,
  'activity',p.activity,'workflowRevision',p.workflow_revision);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'save_project_details',payload,result);
 return result;
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
   raise exception 'Latest client version changed' using errcode='PT409'; end if;
  select * into review from public.publication_reviews where publication_id=latest.id for update;
  if review.status<>'changes_requested' or review.review_revision is distinct from p_expected_review_revision
    or exists(select 1 from private.feedback_handoff_receipts where publication_id=latest.id) then
   raise exception 'Client feedback already changed or was handled' using errcode='PT409'; end if;
 elsif p_expected_review_revision is not null then
  raise exception 'A review revision needs a publication' using errcode='22023';
 elsif exists(select 1 from public.published_versions v join public.publication_reviews r
  on r.publication_id=v.id where v.id=(select id from public.published_versions
  where project_id=p.id order by version_number desc,id desc limit 1) and r.status='changes_requested'
  and not exists(select 1 from private.feedback_handoff_receipts h where h.publication_id=v.id)) then
  raise exception 'Handle the current client feedback with its review revision' using errcode='PT409'; end if;
 -- Lock every selected board before changing any of them. An invalid row aborts the batch.
 perform 1 from public.design_boards where id in
  (select (x->>'boardId')::uuid from jsonb_array_elements(p_board_decisions) x)
  order by id for update;
 for d in select value from jsonb_array_elements(p_board_decisions)
  order by (value->>'boardId')::uuid loop
  select * into b from public.design_boards where id=(d->>'boardId')::uuid;
  if not found or b.project_id<>p.id or b.workflow_revision<>(d->>'expectedBoardRevision')::integer
   or b.assignment_generation<>(d->>'expectedAssignmentGeneration')::integer then
   raise exception 'Board changed while preparing the handoff' using errcode='PT409'; end if;
  if b.activity<>'active' then raise exception 'Reactivate closed boards separately' using errcode='22023'; end if;
  if d->>'action'='continue' then
   select coalesce(revision,0) into expected_brief from public.production_brief_drafts where board_id=b.id;
   if coalesce(expected_brief,0)<>(d->>'expectedBriefRevision')::integer then
    raise exception 'Production instructions changed while preparing the handoff' using errcode='PT409'; end if;
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
    select b.designer_id,p.client_id,p.id,'No further work needed',b.name
    where exists(select 1 from public.project_assignments a
     join public.profiles u on u.id=a.designer_id and u.role='designer' and u.removed_at is null
     where a.project_id=p.id and a.designer_id=b.designer_id);
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
create or replace function public.close_board_work(p_board_id uuid,p_expected_revision integer,p_request_id uuid)
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
 if b.workflow_revision<>p_expected_revision then raise exception 'Board changed' using errcode='PT409'; end if;
 if b.activity<>'active' then raise exception 'Board already closed' using errcode='22023'; end if;
 update public.board_work_requests set current=false,outcome='closed',closed_reason='direction_closed',updated_at=now()
  where board_id=b.id and current;
 update public.design_boards set activity='closed',workflow_revision=workflow_revision+1 where id=b.id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 insert into public.notifications(user_id,client_id,project_id,title,body)
 select b.designer_id,p.client_id,p.id,'No further work needed',b.name
 where exists(select 1 from public.project_assignments a
  join public.profiles u on u.id=a.designer_id and u.role='designer' and u.removed_at is null
  where a.project_id=p.id and a.designer_id=b.designer_id);
 result:=jsonb_build_object('boardId',b.id,'activity','closed','workflowRevision',b.workflow_revision+1);
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'close_board',payload,result);
 return result;
end $$;
create or replace function public.post_comment(
  p_project_id uuid, p_channel text, p_body text,
  p_version_id uuid default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid; target_client uuid; sender_name text; trimmed_body text;
  existing_internal public.internal_comments; existing_client public.client_comments;
begin
  trimmed_body := trim(p_body);
  select client_id into target_client from public.projects where id = p_project_id;
  if p_channel = 'internal' then
    if not private.can_produce(p_project_id) then
      raise exception 'Internal channel access required' using errcode = '42501';
    end if;
    if p_idempotency_key is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
      select * into existing_internal from public.internal_comments
        where idempotency_key = p_idempotency_key and project_id = p_project_id;
      if found then
        if existing_internal.version_id is distinct from p_version_id
           or existing_internal.body is distinct from trimmed_body then
          raise exception 'Idempotency key conflicts with a different comment';
        end if;
        return existing_internal.id;
      end if;
      if exists(select 1 from public.internal_comments where idempotency_key = p_idempotency_key) then
        raise exception 'Idempotency key conflicts with a different comment';
      end if;
    end if;
    insert into public.internal_comments(project_id, version_id, author_id, body, idempotency_key)
    values (p_project_id, p_version_id, auth.uid(), trimmed_body, p_idempotency_key)
    returning id into result_id;
    if private.is_agency() then
      -- A round note reaches only that board's designer; a project note reaches every assignee.
      insert into public.notifications(user_id, client_id, project_id, title)
      select pa.designer_id, target_client, p_project_id, 'New studio message'
        from public.project_assignments pa
        join public.profiles recipient on recipient.id=pa.designer_id
          and recipient.role='designer' and recipient.removed_at is null
       where pa.project_id = p_project_id
         and (p_version_id is null or exists(
              select 1 from public.design_versions dv
              join public.design_boards db on db.id=dv.board_id
              where dv.id=p_version_id and dv.project_id=p_project_id
                and db.designer_id=pa.designer_id
                and dv.assignment_generation=db.assignment_generation));
    else
      perform private.notify_agency(target_client, p_project_id, 'New internal message');
    end if;
  elsif p_channel = 'client' then
    if not private.can_client_channel(p_project_id) then
      raise exception 'Client channel access required' using errcode = '42501';
    end if;
    if p_idempotency_key is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
      select * into existing_client from public.client_comments
        where idempotency_key = p_idempotency_key and project_id = p_project_id;
      if found then
        if existing_client.publication_id is distinct from p_version_id
           or existing_client.body is distinct from trimmed_body then
          raise exception 'Idempotency key conflicts with a different comment';
        end if;
        return existing_client.id;
      end if;
      if exists(select 1 from public.client_comments where idempotency_key = p_idempotency_key) then
        raise exception 'Idempotency key conflicts with a different comment';
      end if;
    end if;
    select case when private.is_agency() then 'Studio' else display_name end into sender_name
      from public.profiles where id = auth.uid();
    insert into public.client_comments(project_id, publication_id, author_label, author_kind, body, idempotency_key)
    values (p_project_id, p_version_id, sender_name,
            case when private.is_agency() then 'studio' else 'client' end, trimmed_body, p_idempotency_key)
    returning id into result_id;
    insert into private.client_comment_authors(comment_id, author_id) values (result_id, auth.uid());
    if private.is_agency() then
      perform private.notify_client(target_client, p_project_id, 'New message from Studio');
    else
      perform private.notify_agency(target_client, p_project_id, 'New client message');
    end if;
  else
    raise exception 'Invalid comment channel';
  end if;
  return result_id;
end $$;
notify pgrst,'reload schema';
