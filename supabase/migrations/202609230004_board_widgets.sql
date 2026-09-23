-- Board presentation belongs to a viewer in a client workspace, never to a shared studio role.
create table public.board_preferences (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  visible_widgets text[] not null default array['timeline','kanban']::text[],
  primary key(user_id,client_id),
  constraint board_widgets_valid check (
    visible_widgets <@ array['timeline','kanban']::text[]
    and cardinality(visible_widgets)<=2
    and (cardinality(visible_widgets)=0 or (array_ndims(visible_widgets)=1 and array_lower(visible_widgets,1)=1))
    and array_position(visible_widgets,null) is null
    and not (cardinality(visible_widgets)=2 and visible_widgets[1]=visible_widgets[2])
  )
);

alter table public.board_preferences enable row level security;
create policy board_preferences_read on public.board_preferences for select to authenticated
  using(user_id=auth.uid() and private.can_access_client(client_id));
create policy board_preferences_insert on public.board_preferences for insert to authenticated
  with check(user_id=auth.uid() and private.can_access_client(client_id));
create policy board_preferences_update on public.board_preferences for update to authenticated
  using(user_id=auth.uid() and private.can_access_client(client_id))
  with check(user_id=auth.uid() and private.can_access_client(client_id));

revoke all on public.board_preferences from anon,authenticated;
grant select,insert on public.board_preferences to authenticated;
grant update(visible_widgets) on public.board_preferences to authenticated;
grant all on public.board_preferences to service_role;

create function public.save_board_widgets(p_client_id uuid,p_visible_widgets text[]) returns text[]
language sql security invoker set search_path='' as $$
  insert into public.board_preferences(user_id,client_id,visible_widgets)
  values(auth.uid(),p_client_id,p_visible_widgets)
  on conflict(user_id,client_id) do update set visible_widgets=excluded.visible_widgets
  returning visible_widgets
$$;
revoke execute on function public.save_board_widgets(uuid,text[]) from public,anon;
grant execute on function public.save_board_widgets(uuid,text[]) to authenticated;

comment on table public.board_preferences is 'Private per-user, per-client board widget visibility. An empty array intentionally hides every widget.';
