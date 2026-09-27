-- Fix round 1 for 202609270009_project_drive_link.sql: `btrim(p_url)` only strips spaces, so a
-- value that is only tabs/newlines raised the "invalid link" error instead of clearing the link,
-- and a trailing newline (e.g. pasted from some clients) was refused outright instead of trimmed.
-- Same signature, same security definer/search_path, same grants and revokes as before; only the
-- trim character set widens to also strip tabs, carriage returns and newlines.

create or replace function public.set_project_drive_link(p_project_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_url text := btrim(coalesce(p_url, ''), e' \t\r\n');
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
