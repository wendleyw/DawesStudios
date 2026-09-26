-- Fix forward on 202609260006: the Miro frame IS the round's design, so a round (a design_versions
-- row with board_id not null) must never carry an uploaded design record. Without this, designs_read
-- only checked private.can_produce(project_id), so a design attached to a round would be readable
-- by (and addable by) any producer on the project, not just the round's own designer/the agency.

create function private.guard_round_designs() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.design_versions where id = new.version_id and board_id is not null) then
    raise exception 'Rounds carry no uploaded designs' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger designs_no_round_uploads before insert or update on public.designs
  for each row execute function private.guard_round_designs();

drop policy designs_read on public.designs;
create policy designs_read on public.designs for select to authenticated
  using (private.can_produce(project_id) and private.can_see_version(version_id));

drop policy designs_edit on public.designs;
create policy designs_edit on public.designs for update to authenticated
  using (private.can_produce(project_id) and private.can_see_version(version_id))
  with check (private.can_produce(project_id) and private.can_see_version(version_id));
