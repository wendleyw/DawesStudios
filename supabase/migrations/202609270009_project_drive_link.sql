-- Google Drive backup link: one per project, set by the agency, visible to everyone who can
-- already access the project (agency, the client, an assigned designer). It is only a link;
-- nothing syncs, and the column is writable only through `set_project_drive_link`.

alter table public.projects add column drive_url text;
-- Defense in depth alongside the RPC's own check: the scheme must be https and the host exactly
-- `drive.google.com` (no lookalikes such as `drive.google.com.evil.com`).
alter table public.projects add constraint project_drive_url_valid
  check (drive_url is null or drive_url ~ '^https://drive\.google\.com(/[^[:space:]]*)?$');

create function public.set_project_drive_link(p_project_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_url text := btrim(coalesce(p_url, ''));
begin
  perform private.assert_agency();
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if v_url = '' then
    update public.projects set drive_url = null where id = p_project_id;
    perform private.audit('project.drive_link_cleared', p_project_id);
    return;
  end if;
  if v_url !~ '^https://drive\.google\.com(/[^[:space:]]*)?$' then
    raise exception 'Paste a Google Drive link (https://drive.google.com/…)' using errcode = '22023';
  end if;
  update public.projects set drive_url = v_url where id = p_project_id;
  perform private.audit('project.drive_link_set', p_project_id);
end $$;
revoke all on function public.set_project_drive_link(uuid, text) from public, anon;
grant execute on function public.set_project_drive_link(uuid, text) to authenticated;
