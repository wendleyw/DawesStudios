-- The studio approves a designer's round before it is shared with the client (user decision,
-- 2026-09-28): designer sends to the studio -> studio requests changes or approves the round ->
-- the approved round is shared -> the client approves or requests changes -> the studio sends the
-- board back to its designer from Working files. An approved round is a recorded request outcome.
alter table public.board_work_requests drop constraint board_work_requests_outcome_check;
alter table public.board_work_requests add constraint board_work_requests_outcome_check
 check (outcome in ('open','submitted','approved','shared','closed'));
alter table public.board_work_requests drop constraint board_work_requests_check1;
alter table public.board_work_requests add constraint board_work_requests_round_check
 check (outcome not in ('submitted','approved','shared') or round_id is not null);

create function public.approve_board_round(p_board_id uuid,p_round_id uuid,
 p_expected_board_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.design_boards; p public.projects; r public.board_work_requests;
 replay jsonb; payload jsonb; result jsonb;
begin
 perform private.assert_agency();
 payload:=jsonb_build_object('boardId',p_board_id,'roundId',p_round_id,
  'expectedBoardRevision',p_expected_board_revision);
 replay:=private.workflow_replay(p_request_id,'approve_round',payload);
 if replay is not null then return replay; end if;
 select * into b from public.design_boards where id=p_board_id;
 if not found then raise exception 'Board not found' using errcode='P0002'; end if;
 p:=private.require_active_project(b.project_id);
 select * into b from public.design_boards where id=p_board_id for update;
 if b.workflow_revision<>p_expected_board_revision then
  raise exception 'Board changed while you were reviewing' using errcode='PT409'; end if;
 if b.activity<>'active' then raise exception 'This board is closed' using errcode='22023'; end if;
 select * into r from public.board_work_requests where board_id=b.id and current for update;
 if not found or r.outcome<>'submitted' or r.round_id is distinct from p_round_id then
  raise exception 'This round is no longer waiting for studio review' using errcode='PT409'; end if;
 update public.board_work_requests set outcome='approved',updated_at=now() where id=r.id;
 update public.design_boards set workflow_revision=workflow_revision+1 where id=b.id;
 update public.projects set workflow_revision=workflow_revision+1 where id=p.id;
 insert into public.notifications(user_id,client_id,project_id,title,body)
 select b.designer_id,p.client_id,p.id,'Round approved by the studio',b.name
 where exists(select 1 from public.project_assignments a
  join public.profiles u on u.id=a.designer_id and u.role='designer' and u.removed_at is null
  where a.project_id=p.id and a.designer_id=b.designer_id);
 result:=jsonb_build_object('boardId',b.id,'roundId',p_round_id,'outcome','approved',
  'workflowRevision',b.workflow_revision+1);
 perform private.audit('round.approved',p_round_id,jsonb_build_object('board',b.id,'request',r.id));
 insert into private.workflow_attempts(request_id,actor_id,operation,payload,result)
 values(p_request_id,auth.uid(),'approve_round',payload,result);
 return result;
end $$;
revoke execute on function public.approve_board_round(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.approve_board_round(uuid,uuid,integer,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.share_workflow_version(p_project_id uuid, p_url text, p_note text, p_source_round_ids uuid[], p_expected_latest_publication_id uuid, p_expected_review_revision integer, p_confirm_replacement boolean, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  raise exception 'Latest client version changed' using errcode='PT409'; end if;
 if latest.id is not null then
  select * into review from public.publication_reviews where publication_id=latest.id for update;
  if review.review_revision is distinct from p_expected_review_revision then
   raise exception 'Client review changed' using errcode='PT409'; end if;
  if review.status in ('pending','approved') and not coalesce(p_confirm_replacement,false) then
   raise exception 'Confirm replacement of the latest client version' using errcode='22023'; end if;
 elsif p_expected_review_revision is not null then
  raise exception 'No prior client review exists' using errcode='PT409';
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
  -- A studio-approved round, or a submitted one cited in a direct share, becomes shared.
  if found and work.current and work.outcome in ('submitted','approved') and work.round_id=source_id then
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
end $function$;

create or replace function public.get_project_workflow(p_project_id uuid) returns jsonb
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
    'release',agency and p.activity='active' and p.status<>'delivered' and b.activity='active'
     and exists(select 1 from public.project_assignments a join public.profiles u
      on u.id=a.designer_id and u.removed_at is null
      where a.project_id=p.id and a.designer_id=b.designer_id),
    'submit',designer_user and b.designer_id=auth.uid() and p.activity='active'
       and p.status<>'delivered' and b.activity='active' and r.outcome='open',
    'approve',agency and p.activity='active' and p.status<>'delivered'
       and b.activity='active' and r.outcome='submitted',
    'share',agency and p.activity='active' and p.status<>'delivered'
       and b.activity='active' and r.outcome='approved',
    'requestChanges',agency and p.activity='active' and p.status<>'delivered'
       and b.activity='active' and r.outcome in ('submitted','approved'),
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
select ('share_round:'||r.round_id::text),'share_round',p.client_id,p.id,r.round_id,r.board_id,
 (p.title||' · '||b.name)::text,r.updated_at
from public.board_work_requests r join public.design_boards b on b.id=r.board_id
join public.projects p on p.id=r.project_id
where private.is_agency() and p.activity='active' and p.status<>'delivered' and b.activity='active'
 and r.current and r.outcome='approved'
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
 and p.status<>'delivered' and private.can_receive_project_action(p.id);;

notify pgrst,'reload schema';
