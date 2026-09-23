-- Keep legacy widget preferences intact while the interface moves to one selected view.
alter table public.board_preferences add column active_view text;
alter table public.board_preferences add constraint board_view_valid
  check (active_view in ('canvas','list','timeline','kanban','calendar'));
grant update(active_view) on public.board_preferences to authenticated;

create function public.save_board_view(p_client_id uuid,p_active_view text) returns text
language sql security invoker set search_path='' as $$
  insert into public.board_preferences(user_id,client_id,active_view)
  values(auth.uid(),p_client_id,p_active_view)
  on conflict(user_id,client_id) do update set active_view=excluded.active_view
  returning active_view
$$;
revoke execute on function public.save_board_view(uuid,text) from public,anon;
grant execute on function public.save_board_view(uuid,text) to authenticated;

comment on column public.board_preferences.active_view is
  'Personal board view; null uses Canvas on desktop and List on mobile. Legacy widget choices are preserved separately.';
comment on table public.board_preferences is
  'Private per-user, per-client board presentation preferences, subject to current client access.';
