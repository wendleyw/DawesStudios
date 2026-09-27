-- Fix forward on 202609260001/0009: a project-level client version (no deliverable) is nothing but
-- its Miro link — the client reviews it by opening that board. Removing the link would leave the
-- client with a pending review and nothing to open, so its link can be changed but never cleared.
-- Per-deliverable publications keep an optional link.

create or replace function public.clear_publication_miro_link(p_publication_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
  perform private.assert_agency();
  if exists(select 1 from public.published_versions where id = p_publication_id and deliverable_id is null) then
    raise exception 'A shared version needs its Miro link' using errcode = '22023';
  end if;
  delete from public.publication_miro_links where publication_id = p_publication_id
    returning project_id into v_project;
  if v_project is not null then perform private.audit('publication.miro_link_cleared', v_project); end if;
end $$;
