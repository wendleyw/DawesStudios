-- Preserve workspace-only boards and their files as inaccessible legacy records. NOT VALID
-- leaves those rows untouched while enforcing project scope for every future insert/update,
-- including privileged direct writes. Moving old content requires an explicit project decision.
alter table public.playground_boards add constraint playground_requires_project
  check(project_id is not null) not valid;

-- This shared guard protects direct SELECT, every item/cleanup RPC, and every Storage policy.
-- A known legacy board or item UUID must not regain access through a different entry point.
create or replace function private.can_access_playground(p_board_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.playground_boards b
    join public.projects p on p.id=b.project_id and p.client_id=b.client_id
    where b.id=p_board_id and b.role=private.current_role()
      and private.can_access_client(b.client_id) and private.can_access_project(p.id))
$$;

-- Retain the default only to give older/omitted-scope requests an explicit authorization error.
-- No authenticated caller can resolve or create a workspace-only board.
create or replace function public.get_playground_board(p_client_id uuid,p_project_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller_role public.app_role; result_id uuid;
begin
  caller_role:=private.current_role();
  if caller_role is null or not private.can_access_client(p_client_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  if p_project_id is null then
    raise exception 'A project is required for Playground' using errcode='42501';
  end if;
  if not exists(select 1 from public.projects
    where id=p_project_id and client_id=p_client_id and private.can_access_project(id)) then
    raise exception 'The project is unavailable in this workspace' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'playground-scope:'||p_client_id::text||':'||p_project_id::text||':'||caller_role::text,0));
  select id into result_id from public.playground_boards
    where client_id=p_client_id and project_id=p_project_id and role=caller_role;
  if found then return result_id; end if;
  insert into public.playground_boards(client_id,project_id,role)
    values(p_client_id,p_project_id,caller_role) returning id into result_id;
  return result_id;
end $$;

revoke execute on function private.can_access_playground(uuid),public.get_playground_board(uuid,uuid)
  from public,anon;
grant execute on function private.can_access_playground(uuid),public.get_playground_board(uuid,uuid)
  to authenticated;
