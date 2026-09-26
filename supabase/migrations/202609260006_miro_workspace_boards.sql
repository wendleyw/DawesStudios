-- Miro workspace, part 1: named internal design boards (one designer each), their rounds, and
-- the designer-to-designer privacy rule. A round is a design_versions row with a board and no
-- deliverable. See docs/superpowers/specs/2026-09-26-miro-workspace-design.md.

create table public.design_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null check (length(name) between 1 and 80 and name = btrim(name)),
  designer_id uuid not null references public.profiles,
  board_id text not null check (board_id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  widget_id text check (widget_id ~ '^[0-9]{1,32}$'),
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create unique index design_boards_name on public.design_boards(project_id, lower(name));
create index design_boards_designer on public.design_boards(designer_id);

alter table public.design_versions alter column deliverable_id drop not null;
alter table public.design_versions add column board_id uuid;
alter table public.design_versions add column request_key uuid;
alter table public.design_versions add constraint design_versions_board_fk
  foreign key (board_id, project_id) references public.design_boards(id, project_id);
alter table public.design_versions add constraint design_versions_one_parent
  check ((deliverable_id is null) <> (board_id is null));
create unique index design_versions_board_number on public.design_versions(board_id, version_number)
  where board_id is not null;
create unique index design_versions_request_key on public.design_versions(request_key)
  where request_key is not null;

-- Privacy helpers. Security definer so policies can consult boards and profiles the caller
-- cannot read directly.
create function private.can_see_board(target_board uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.is_agency() or exists(
    select 1 from public.design_boards b
    where b.id = target_board and b.designer_id = auth.uid() and private.can_produce(b.project_id)
  ), false)
$$;
-- A version is visible when it is not a round, or when its board is visible. Null (a comment on
-- no version) counts as visible.
create function private.can_see_version(target_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select v.board_id is null or private.can_see_board(v.board_id)
    from public.design_versions v where v.id = target_version), true)
$$;
create function private.is_agency_profile(target_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id = target_profile and role = 'agency')
$$;
-- A designer reads an internal comment only when its version is visible and it was written by
-- themselves or by the studio: another designer's comment and identity never reach them.
create function private.can_read_internal_comment(target_version uuid, target_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_agency() or (private.can_see_version(target_version)
    and (target_author = auth.uid() or private.is_agency_profile(target_author)))
$$;
revoke all on function private.can_see_board(uuid), private.can_see_version(uuid),
  private.is_agency_profile(uuid), private.can_read_internal_comment(uuid, uuid)
  from public, anon, authenticated;
-- RLS policies evaluate as the caller, so the three helpers used in policies must be executable by
-- signed-in users, as private.can_produce is. is_agency_profile is only called from inside them.
grant execute on function private.can_see_board(uuid), private.can_see_version(uuid),
  private.can_read_internal_comment(uuid, uuid) to authenticated;

alter table public.design_boards enable row level security;
create policy design_boards_read on public.design_boards for select to authenticated
  using (private.can_see_board(id));
revoke all on public.design_boards from public, anon, authenticated;
grant select on public.design_boards to authenticated;
grant all on public.design_boards to service_role;

drop policy versions_read on public.design_versions;
create policy versions_read on public.design_versions for select to authenticated
  using (private.can_produce(project_id) and (board_id is null or private.can_see_board(board_id)));

drop policy design_version_miro_links_read on public.design_version_miro_links;
create policy design_version_miro_links_read on public.design_version_miro_links
  for select to authenticated using (private.can_produce(project_id) and private.can_see_version(version_id));

drop policy internal_comments_read on public.internal_comments;
create policy internal_comments_read on public.internal_comments for select to authenticated
  using (private.can_produce(project_id) and private.can_read_internal_comment(version_id, author_id));

-- post_comment and resolve_comment are security definer and check only project access. This
-- trigger adds the privacy rule to every write they (or anything else acting as a person) make.
create function private.guard_internal_comment_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or private.is_agency() then return new; end if;
  if not private.can_read_internal_comment(new.version_id,
      case when tg_op = 'INSERT' then auth.uid() else old.author_id end) then
    raise exception 'Comment access required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger internal_comments_privacy before insert or update on public.internal_comments
  for each row execute function private.guard_internal_comment_privacy();

-- Round links: the board's designer may relink their own rounds; everything else stays agency-only.
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
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (p_version_id, v_project, v_board, v_widget, auth.uid())
  on conflict (version_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('version.miro_link_set', v_project);
end $$;

create function public.create_design_board(p_project_id uuid, p_name text, p_url text, p_designer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_board text; v_widget text; result_id uuid;
begin
  perform private.assert_agency();
  if not exists(select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Name the board (up to 80 characters)' using errcode = '22023';
  end if;
  if not exists(select 1 from public.project_assignments where project_id = p_project_id and designer_id = p_designer_id) then
    raise exception 'Assign this designer to the project first' using errcode = '22023';
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  begin
    insert into public.design_boards(project_id, name, designer_id, board_id, widget_id, created_by)
    values (p_project_id, v_name, p_designer_id, v_board, v_widget, auth.uid()) returning id into result_id;
  exception when unique_violation then
    raise exception 'A board with this name already exists in this project' using errcode = '23505';
  end;
  perform private.audit('design_board.created', result_id, jsonb_build_object('project', p_project_id));
  return result_id;
end $$;

create function public.update_design_board(p_board_id uuid, p_name text, p_url text, p_designer_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name, '')); b public.design_boards; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select * into b from public.design_boards where id = p_board_id for update;
  if not found then raise exception 'Board not found' using errcode = 'P0002'; end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Name the board (up to 80 characters)' using errcode = '22023';
  end if;
  if not exists(select 1 from public.project_assignments where project_id = b.project_id and designer_id = p_designer_id) then
    raise exception 'Assign this designer to the project first' using errcode = '22023';
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  begin
    update public.design_boards set name = v_name, designer_id = p_designer_id, board_id = v_board,
      widget_id = v_widget, updated_at = now() where id = p_board_id;
  exception when unique_violation then
    raise exception 'A board with this name already exists in this project' using errcode = '23505';
  end;
  perform private.audit('design_board.updated', p_board_id, jsonb_build_object('project', b.project_id));
end $$;

create function public.send_board_round(p_board_id uuid, p_note text default '', p_frame_url text default null,
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
        raise exception 'Idempotency key conflicts with a different round';
      end if;
      return existing.id;
    end if;
  end if;
  select client_id into target_client from public.projects where id = b.project_id for update;
  if exists(select 1 from public.projects where id = b.project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot receive new rounds';
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

revoke execute on function public.create_design_board(uuid, text, text, uuid),
  public.update_design_board(uuid, text, text, uuid),
  public.send_board_round(uuid, text, text, uuid) from public, anon;
grant execute on function public.create_design_board(uuid, text, text, uuid),
  public.update_design_board(uuid, text, text, uuid),
  public.send_board_round(uuid, text, text, uuid) to authenticated;

alter publication supabase_realtime add table public.design_boards;
