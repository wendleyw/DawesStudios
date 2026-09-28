-- The queue needs this helper, but clients must not infer private handoff receipts by calling it.
create or replace function private.has_feedback_handoff(p_publication_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_agency() and exists(
  select 1 from private.feedback_handoff_receipts where publication_id=p_publication_id)
$$;

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
notify pgrst,'reload schema';
