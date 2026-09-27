-- Fix forward on 202609260006/0009: tighten Miro workspace retries, round sharing, and delivered
-- projects. Bodies are copied verbatim from their latest definitions; only the listed behavior
-- changes below.

-- send_board_round: the idempotency-key conflict and the delivered-project refusal now carry their
-- SQLSTATEs (23505 and 22023) instead of the generic P0001 default. Messages are unchanged.
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
  update public.projects set status = 'internal_review', updated_at = now() where id = b.project_id;
  perform private.notify_agency(target_client, b.project_id, 'Design ready for studio review', b.name);
  perform private.audit('round.sent', result_id, jsonb_build_object('board', b.id));
  return result_id;
end $$;

-- share_miro_version: (a) the idempotency-conflict check also compares the parsed board/frame link,
-- so the URL is now parsed before that check; (b) a source round can only be shared once, tracked
-- through private.publication_sources; (c) the delivered-project refusal carries errcode 22023; (d)
-- an idempotency key that collides with a request_key already written by a different
-- publication_sources row (as public.publish_version does) is caught and reported with the same
-- conflict message and 23505, instead of surfacing the raw unique-constraint error.
create or replace function public.share_miro_version(p_project_id uuid, p_url text, p_note text default '',
  p_source_round uuid default null, p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_note text := btrim(coalesce(p_note, '')); v_board text; v_widget text; next_number integer;
  result_id uuid; target_client uuid; req private.miro_share_requests; req_board text; req_widget text;
begin
  perform private.assert_agency();
  if p_idempotency_key is null then p_idempotency_key := gen_random_uuid(); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  select * into req from private.miro_share_requests where request_key = p_idempotency_key;
  if found then
    select board_id, widget_id into req_board, req_widget from public.publication_miro_links
      where publication_id = req.publication_id;
    if req.project_id <> p_project_id or req.source_round is distinct from p_source_round
       or (select release_note from public.published_versions where id = req.publication_id) <> v_note
       or req_board is distinct from v_board or req_widget is distinct from v_widget then
      raise exception 'Idempotency key conflicts with a different version' using errcode = '23505';
    end if;
    return req.publication_id;
  end if;
  select client_id into target_client from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.projects where id = p_project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot publish new revisions' using errcode = '22023';
  end if;
  if p_source_round is not null and not exists(
    select 1 from public.design_versions where id = p_source_round and project_id = p_project_id and board_id is not null
  ) then
    raise exception 'Round not found in this project' using errcode = 'P0002';
  end if;
  if p_source_round is not null and exists(
    select 1 from private.publication_sources where internal_version_id = p_source_round
  ) then
    raise exception 'This round is already shared' using errcode = '23505';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.published_versions where project_id = p_project_id and deliverable_id is null;
  insert into public.published_versions(project_id, deliverable_id, version_number, release_note)
  values (p_project_id, null, next_number, v_note) returning id into result_id;
  insert into public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by)
  values (result_id, p_project_id, v_board, v_widget, auth.uid());
  insert into public.publication_reviews(publication_id, project_id) values (result_id, p_project_id);
  if p_source_round is not null then
    begin
      insert into private.publication_sources(publication_id, internal_version_id, published_by, request_key, request_note)
      values (result_id, p_source_round, auth.uid(), p_idempotency_key, v_note);
    exception when unique_violation then
      raise exception 'Idempotency key conflicts with a different version' using errcode = '23505';
    end;
    update public.design_versions set status = 'reviewed' where id = p_source_round;
  end if;
  insert into private.miro_share_requests(request_key, publication_id, project_id, source_round, requested_by)
  values (p_idempotency_key, result_id, p_project_id, p_source_round, auth.uid());
  update public.projects set status = 'client_review', updated_at = now() where id = p_project_id;
  perform private.notify_client(target_client, p_project_id, 'New designs ready for review', v_note);
  perform private.audit('version.published', result_id);
  return result_id;
end $$;

-- set_version_miro_link: the board's designer (a non-agency caller) can no longer relink a round
-- once its project is delivered. The agency is unaffected.
create or replace function public.set_version_miro_link(p_version_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_board_ref uuid; v_board text; v_widget text;
begin
  select project_id, board_id into v_project, v_board_ref from public.design_versions where id = p_version_id;
  if not found then
    perform private.assert_agency();
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  if not (private.is_agency() or (v_board_ref is not null and private.can_see_board(v_board_ref))) then
    raise exception 'Agency access required' using errcode = '42501';
  end if;
  if not private.is_agency() and exists(select 1 from public.projects where id = v_project and status = 'delivered') then
    raise exception 'Delivered projects cannot change links' using errcode = '22023';
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (p_version_id, v_project, v_board, v_widget, auth.uid())
  on conflict (version_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('version.miro_link_set', v_project);
end $$;
