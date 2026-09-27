-- Distinguish simultaneous actions for multiple internal boards on the same project.
-- These labels appear only to the agency and the authorized board designer.

create or replace view public.action_notifications
with (security_invoker = true, security_barrier = true) as
with latest_round as (
  select distinct on (board_id) id, board_id, project_id, status, created_at
  from public.design_versions
  order by board_id, version_number desc, id desc
),
latest_publication as (
  select distinct on (project_id) id, project_id, version_number, published_at
  from public.published_versions
  order by project_id, version_number desc, id desc
)
-- Agency: budget review and acceptance are separate workflow decisions.
select ('review_briefing:' || b.id::text) as id,
  'review_briefing'::text as kind, b.client_id, null::uuid as project_id,
  b.id as entity_id, null::uuid as board_id, b.title::text as subject,
  b.updated_at as created_at
from public.briefings b
where private.is_agency() and b.status = 'awaiting_review'
  and not exists (select 1 from public.projects p where p.briefing_id = b.id)
union all
select ('start_project:' || b.id::text), 'start_project'::text,
  b.client_id, null::uuid, b.id, null::uuid, b.title::text, b.updated_at
from public.briefings b
where private.is_agency() and b.status = 'budget_confirmed'
  and not exists (select 1 from public.projects p where p.briefing_id = b.id)
union all
select ('review_credit_request:' || request.id::text), 'review_credit_request'::text,
  request.client_id, null::uuid, request.id, null::uuid,
  (client.name || ' - ' || request.amount::text || ' credits')::text, request.created_at
from public.credit_requests request
join public.clients client on client.id = request.client_id
where private.is_agency() and request.status = 'pending'
union all
select ('prepare_project:' || p.id::text), 'prepare_project'::text,
  p.client_id, p.id, p.id, null::uuid, p.title::text, p.created_at
from public.projects p
where private.is_agency() and p.status <> 'delivered'
  and not exists (select 1 from public.design_boards board where board.project_id = p.id)
  and not exists (select 1 from public.published_versions version where version.project_id = p.id)
union all
select ('review_round:' || round.id::text), 'review_round'::text,
  p.client_id, p.id, round.id, board.id, (p.title || ' · ' || board.name)::text, round.created_at
from latest_round round
join public.design_boards board on board.id = round.board_id
join public.projects p on p.id = board.project_id
where private.is_agency() and round.status = 'submitted'
  and p.status <> 'delivered'
union all
select ('respond_feedback:' || publication.id::text), 'respond_feedback'::text,
  p.client_id, p.id, publication.id, null::uuid, p.title::text,
  coalesce(review.reviewed_at, publication.published_at)
from latest_publication publication
join public.publication_reviews review on review.publication_id = publication.id
join public.projects p on p.id = publication.project_id
where private.is_agency() and review.status = 'changes_requested'
  and p.status <> 'delivered'
union all
select ('deliver_project:' || publication.id::text), 'deliver_project'::text,
  p.client_id, p.id, publication.id, null::uuid, p.title::text,
  coalesce(review.reviewed_at, publication.published_at)
from latest_publication publication
join public.publication_reviews review on review.publication_id = publication.id
join public.projects p on p.id = publication.project_id
where private.is_agency() and review.status = 'approved'
  and p.status = 'approved'
union all
-- Designers see only their current board assignment. A newer draft reopens the submit action;
-- an already submitted or reviewed latest round closes it.
select ('submit_round:' || board.id::text), 'submit_round'::text,
  p.client_id, p.id, board.id, board.id, (p.title || ' · ' || board.name)::text,
  coalesce(round.created_at, board.created_at)
from public.design_boards board
join public.projects p on p.id = board.project_id
join public.project_assignments assignment on assignment.project_id = p.id
  and assignment.designer_id = board.designer_id
left join latest_round round on round.board_id = board.id
where private.current_role() = 'designer' and board.designer_id = auth.uid()
  and p.status <> 'delivered' and (round.id is null or round.status = 'draft')
union all
-- Client actions follow the same requester/notify_all routing as publication notifications.
select ('review_version:' || publication.id::text), 'review_version'::text,
  p.client_id, p.id, publication.id, null::uuid, p.title::text,
  publication.published_at
from latest_publication publication
join public.publication_reviews review on review.publication_id = publication.id
join public.projects p on p.id = publication.project_id
where private.current_role() = 'client' and review.status = 'pending'
  and p.status <> 'delivered'
  and private.can_receive_project_action(p.id);

