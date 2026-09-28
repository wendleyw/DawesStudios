-- Public project phases and internal board review are independent.
-- New work starts immediately; later internal submissions never overwrite client decisions.
alter table public.projects alter column status set default 'in_progress';

create or replace function public.accept_briefing(p_briefing_id uuid, p_month date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.briefings;
  result_id uuid;
  month_balance integer;
  item jsonb;
  position integer := 0;
  studio_today date;
  project_start date;
  target date;
begin
  perform private.assert_agency();
  select * into b from public.briefings where id = p_briefing_id for update;
  if not found then raise exception 'Briefing not found'; end if;
  if b.status = 'accepted' then select id into result_id from public.projects where briefing_id = b.id; return result_id; end if;
  if b.status <> 'budget_confirmed' or b.confirmed_credits is null then raise exception 'Confirm the budget before accepting'; end if;
  target := private.assert_open_month(coalesce(p_month, least(
    greatest(private.month_of(b.due_date), private.current_month()),
    (private.current_month() + interval '11 months')::date)));
  perform private.lock_credit_client(b.client_id);
  month_balance := private.ensure_credit_month(b.client_id, target);
  if month_balance < b.confirmed_credits then raise exception 'Insufficient credit balance' using errcode = 'P0001'; end if;
  if jsonb_array_length(b.requested_deliverables) = 0 then raise exception 'At least one deliverable is required'; end if;
  select (pg_catalog.now() at time zone coalesce((select timezone from public.workspace_settings limit 1), 'UTC'))::date into studio_today;
  project_start := case when b.due_date is not null and b.due_date < studio_today then b.due_date else studio_today end;
  insert into public.projects(client_id, campaign_id, briefing_id, title, description, service_type, due_date, start_date, credit_month, status)
    values (b.client_id, b.campaign_id, b.id, b.title, b.overview, b.service_type, b.due_date, project_start, target, 'in_progress')
    returning id into result_id;
  for item in select value from jsonb_array_elements(b.requested_deliverables) loop
    if length(trim(coalesce(item->>'name', ''))) = 0 or length(trim(coalesce(item->>'format', ''))) = 0 then
      raise exception 'Each deliverable requires a name and format';
    end if;
    insert into public.deliverables(project_id, name, format, width, height, quantity, scope, sort_order)
      values (result_id, item->>'name', item->>'format', (item->>'width')::integer, (item->>'height')::integer,
              coalesce((item->>'quantity')::integer, 1), coalesce(item->>'scope', 'original'), position);
    position := position + 1;
  end loop;
  perform private.post_credit_entry(b.client_id, target, -b.confirmed_credits, 'project_debit', b.title,
    'briefing:' || b.id, result_id);
  perform private.sync_credit_account(b.client_id);
  update public.briefings set status = 'accepted', updated_at = pg_catalog.now() where id = b.id;
  perform private.notify_client(b.client_id, result_id, 'Your project is ready', b.title);
  perform private.audit('briefing.accepted', b.id, pg_catalog.jsonb_build_object('project_id', result_id, 'month', target));
  return result_id;
end
$$;

create or replace function public.send_board_round(p_board_id uuid, p_note text default '', p_frame_url text default null,
  p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.design_boards; existing public.design_versions; v_board text; v_widget text;
  next_number integer; result_id uuid; target_client uuid;
begin
  select * into b from public.design_boards where id = p_board_id for update;
  if not found or not private.can_see_board(b.id) then
    raise exception 'Board access required' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
    select * into existing from public.design_versions where request_key = p_idempotency_key;
    if found then
      if existing.board_id is distinct from b.id then
        raise exception 'Idempotency key conflicts with a different round' using errcode = '23505';
      end if;
      return existing.id;
    end if;
  end if;
  select client_id into target_client from public.projects where id = b.project_id for update;
  if exists(select 1 from public.projects where id = b.project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot receive new rounds' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_frame_url, '')), '') is null then
    v_board := b.board_id; v_widget := b.widget_id;
  else
    select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_frame_url);
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number from public.design_versions where board_id = b.id;
  insert into public.design_versions(project_id, board_id, version_number, notes, status, created_by, request_key)
  values (b.project_id, b.id, next_number, btrim(coalesce(p_note, '')), 'submitted', auth.uid(), p_idempotency_key)
  returning id into result_id;
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (result_id, b.project_id, v_board, v_widget, auth.uid());
  -- Internal review belongs to this board; preserve the public project phase.
  perform private.notify_agency(target_client, b.project_id, 'Design ready for studio review', b.name);
  perform private.audit('round.sent', result_id, jsonb_build_object('board', b.id));
  return result_id;
end $$;

-- Reconcile only the public phase required by the new constraint. Existing clients are test data;
-- this does not manufacture historical instructions, work requests or notification events.
with latest_review as (
  select distinct on (v.project_id) v.project_id, coalesce(r.status, 'pending') as decision
  from public.published_versions v
  left join public.publication_reviews r on r.publication_id = v.id
  order by v.project_id, v.version_number desc, v.id
)
update public.projects p
set status = case
  when p.delivered_at is not null then 'delivered'::public.project_status
  when (select decision from latest_review where project_id=p.id)='approved' then 'approved'::public.project_status
  when (select decision from latest_review where project_id=p.id)='changes_requested' then 'changes_requested'::public.project_status
  when exists(select 1 from latest_review where project_id=p.id) then 'client_review'::public.project_status
  else 'in_progress'::public.project_status end,
  updated_at=now()
where p.status='internal_review'
  or (p.status='planned' and exists(select 1 from public.briefings b where b.id=p.briefing_id and b.status='accepted'));

alter table public.projects add constraint projects_public_workflow_status
  check (status <> 'internal_review');
notify pgrst, 'reload schema';
