-- NULL is not a channel. SQL's three-valued NOT IN previously let a blank-URL request
-- succeed without changing anything, and exposed a constraint error for a nonblank URL.
create or replace function public.set_project_drive_link(p_project_id uuid, p_channel text, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_url text := btrim(coalesce(p_url, ''), e' \t\r\n');
begin
  perform private.assert_agency();
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if p_channel is null or p_channel not in ('internal','client') then
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
