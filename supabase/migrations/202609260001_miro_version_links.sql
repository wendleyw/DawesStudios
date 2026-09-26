-- Miro frame links on versions. One table per channel, so the client board and the internal board
-- never meet under one filter: each reads under the same rule as the versions it annotates, and
-- neither touches the immutable publication snapshot. Only the agency writes, through the RPCs
-- below, which parse the pasted URL here so no raw URL is stored.
create table public.publication_miro_links (
  publication_id uuid primary key,
  project_id uuid not null,
  board_id text not null check (board_id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  widget_id text check (widget_id ~ '^[0-9]{1,32}$'),
  updated_by uuid not null references public.profiles,
  updated_at timestamptz not null default now(),
  foreign key (publication_id, project_id)
    references public.published_versions (id, project_id) on delete cascade
);
create index publication_miro_links_project on public.publication_miro_links(project_id);

create table public.design_version_miro_links (
  version_id uuid primary key,
  project_id uuid not null,
  board_id text not null check (board_id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  widget_id text check (widget_id ~ '^[0-9]{1,32}$'),
  updated_by uuid not null references public.profiles,
  updated_at timestamptz not null default now(),
  foreign key (version_id, project_id)
    references public.design_versions (id, project_id) on delete cascade
);
create index design_version_miro_links_project on public.design_version_miro_links(project_id);

alter table public.publication_miro_links enable row level security;
alter table public.design_version_miro_links enable row level security;
create policy publication_miro_links_read on public.publication_miro_links
  for select to authenticated using (private.can_client_channel(project_id));
create policy design_version_miro_links_read on public.design_version_miro_links
  for select to authenticated using (private.can_produce(project_id));
revoke all on public.publication_miro_links, public.design_version_miro_links from public, anon, authenticated;
grant select on public.publication_miro_links, public.design_version_miro_links to authenticated;
grant all on public.publication_miro_links, public.design_version_miro_links to service_role;

-- `https://miro.com/app/board/<board>/` with an optional query that may carry
-- `moveToWidget=<frame>`. Miro board ids often end in `=`, which some copies encode as `%3D`.
create function private.parse_miro_board_url(p_url text, out board_id text, out widget_id text)
language plpgsql immutable set search_path='' as $$
declare parts text[];
begin
  parts := regexp_match(btrim(coalesce(p_url, '')),
    '^https://(?:www\.)?miro\.com/app/board/([A-Za-z0-9_=%-]{6,80})/?(\?[^#[:space:]]*)?(#[^[:space:]]*)?$');
  if parts is null then
    raise exception 'Paste a Miro board or frame link (https://miro.com/app/board/…)' using errcode = '22023';
  end if;
  board_id := replace(parts[1], '%3D', '=');
  if board_id !~ '^[A-Za-z0-9_=-]{6,64}$' then
    raise exception 'This Miro board link is not valid' using errcode = '22023';
  end if;
  widget_id := (regexp_match(coalesce(parts[2], ''), '[?&]moveToWidget=([^&]*)'))[1];
  if widget_id is not null and widget_id !~ '^[0-9]{1,32}$' then
    raise exception 'This Miro frame link is not valid' using errcode = '22023';
  end if;
end $$;

create function public.set_publication_miro_link(p_publication_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select project_id into v_project from public.published_versions where id = p_publication_id;
  if not found then raise exception 'Publication not found' using errcode = 'P0002'; end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by)
  values (p_publication_id, v_project, v_board, v_widget, auth.uid())
  on conflict (publication_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('publication.miro_link_set', v_project);
end $$;

create function public.clear_publication_miro_link(p_publication_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
  perform private.assert_agency();
  delete from public.publication_miro_links where publication_id = p_publication_id
    returning project_id into v_project;
  if v_project is not null then perform private.audit('publication.miro_link_cleared', v_project); end if;
end $$;

create function public.set_version_miro_link(p_version_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select project_id into v_project from public.design_versions where id = p_version_id;
  if not found then raise exception 'Version not found' using errcode = 'P0002'; end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (p_version_id, v_project, v_board, v_widget, auth.uid())
  on conflict (version_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('version.miro_link_set', v_project);
end $$;

create function public.clear_version_miro_link(p_version_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
  perform private.assert_agency();
  delete from public.design_version_miro_links where version_id = p_version_id
    returning project_id into v_project;
  if v_project is not null then perform private.audit('version.miro_link_cleared', v_project); end if;
end $$;

revoke all on function private.parse_miro_board_url(text) from public, anon, authenticated;
revoke execute on function public.set_publication_miro_link(uuid, text), public.clear_publication_miro_link(uuid),
  public.set_version_miro_link(uuid, text), public.clear_version_miro_link(uuid) from public, anon;
grant execute on function public.set_publication_miro_link(uuid, text), public.clear_publication_miro_link(uuid),
  public.set_version_miro_link(uuid, text), public.clear_version_miro_link(uuid) to authenticated;
