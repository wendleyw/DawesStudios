-- Split the one Google Drive backup link per project (202609270009, 202609270010) into two
-- channel-isolated links. `projects.drive_url` was one column read by the agency, the assigned
-- designer AND the client through `projects_read`'s `can_access_project` policy, which breaks the
-- product rule that nothing internal/design reaches the client and nothing client-side reaches the
-- designer. Each project may now hold up to two links: an `internal` one (agency, assigned
-- designer) and a `client` one (agency, client). Neither channel is visible to the other's readers.

create table public.project_drive_links (
  project_id uuid not null references public.projects(id) on delete cascade,
  channel text not null check (channel in ('internal','client')),
  url text not null check (url ~ '^https://drive\.google\.com(/[^[:space:]]*)?$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  primary key (project_id, channel)
);
alter table public.project_drive_links enable row level security;
create policy project_drive_links_read on public.project_drive_links for select to authenticated
  using((channel='internal' and private.can_produce(project_id)) or (channel='client' and private.can_client_channel(project_id)));
-- Column-privilege idiom from 202609260011: `updated_by` carries who set the link, but nothing in
-- the application reads it, so it stays out of the API the same way `project_covers.updated_by` does.
revoke all on public.project_drive_links from public, anon, authenticated;
grant select (project_id, channel, url, updated_at) on public.project_drive_links to authenticated;
grant all on public.project_drive_links to service_role;

-- Data move: every existing non-null link was the one everyone (including the client) could read,
-- so it becomes a client-channel row. Then the old column and its check constraint are dropped.
insert into public.project_drive_links(project_id, channel, url)
  select id, 'client', drive_url from public.projects where drive_url is not null;

alter table public.projects drop constraint project_drive_url_valid;
alter table public.projects drop column drive_url;

-- The writer: same shape as before (agency only, missing project P0002, blank clears, invalid URL
-- refused with the same message), now also taking a channel and writing/clearing a row instead of a
-- column. An unknown channel is refused the same way an invalid URL is (22023).
drop function public.set_project_drive_link(uuid, text);

create function public.set_project_drive_link(p_project_id uuid, p_channel text, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_url text := btrim(coalesce(p_url, ''), e' \t\r\n');
begin
  perform private.assert_agency();
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if p_channel not in ('internal','client') then
    raise exception 'Unknown channel' using errcode = '22023';
  end if;
  if v_url = '' then
    delete from public.project_drive_links where project_id = p_project_id and channel = p_channel;
    perform private.audit('project.drive_link_cleared', p_project_id, jsonb_build_object('channel', p_channel));
    return;
  end if;
  if v_url !~ '^https://drive\.google\.com(/[^[:space:]]*)?$' then
    raise exception 'Paste a Google Drive link (https://drive.google.com/…)' using errcode = '22023';
  end if;
  insert into public.project_drive_links(project_id, channel, url, updated_at, updated_by)
    values(p_project_id, p_channel, v_url, now(), auth.uid())
    on conflict(project_id, channel) do update set url = excluded.url, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform private.audit('project.drive_link_set', p_project_id, jsonb_build_object('channel', p_channel));
end $$;
revoke all on function public.set_project_drive_link(uuid, text, text) from public, anon;
grant execute on function public.set_project_drive_link(uuid, text, text) to authenticated;

-- Realtime: `public.projects` is already published (202609200005); the channel-scoped link streams
-- the same way, rechecking SELECT RLS for each subscriber.
alter publication supabase_realtime add table public.project_drive_links;
