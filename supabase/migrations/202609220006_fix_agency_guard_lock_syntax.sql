-- 202609220005 is invalid SQL: `select count(*) ... for update` raises "FOR UPDATE is not allowed
-- with aggregate functions" at call time (PL/pgSQL does not validate a function body's embedded SQL
-- at CREATE time, only at first execution, so the previous migration applied cleanly and the defect
-- was invisible until the guard actually ran). `FOR UPDATE` locks individual row versions; an
-- aggregate collapses rows into one scalar, and Postgres rejects combining the two in one statement.
-- Locking and counting are split into two statements instead: the first locks every matching row
-- (a plain `for update` scan, no aggregate), the second counts them now that they cannot change
-- under a concurrent transaction until this one commits or rolls back.
create or replace function public.set_team_member_role(p_profile_id uuid, p_role public.app_role) returns void
  language plpgsql security definer set search_path='' as $$
declare target_role public.app_role; agency_count integer;
begin
  perform private.assert_agency();
  if p_role not in ('agency', 'designer') then
    raise exception 'Team members are agency or designer only' using errcode = 'P0001';
  end if;
  select role into target_role from public.profiles where id = p_profile_id;
  if target_role is null or target_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if target_role = 'agency' and p_role <> 'agency' then
    perform 1 from public.profiles where role = 'agency' for update;
    select count(*) into agency_count from public.profiles where role = 'agency';
    if agency_count <= 1 then
      raise exception 'Cannot change the studio''s only agency member' using errcode = 'P0001';
    end if;
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  perform private.audit('member.role_changed', p_profile_id, jsonb_build_object('role', p_role));
end $$;

create or replace function public.remove_team_member(p_profile_id uuid) returns void
  language plpgsql security definer set search_path='' as $$
declare target_role public.app_role; agency_count integer;
begin
  perform private.assert_agency();
  select role into target_role from public.profiles where id = p_profile_id;
  if target_role is null or target_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if target_role = 'agency' then
    perform 1 from public.profiles where role = 'agency' for update;
    select count(*) into agency_count from public.profiles where role = 'agency';
    if agency_count <= 1 then
      raise exception 'Cannot remove the studio''s only agency member' using errcode = 'P0001';
    end if;
  end if;
  delete from public.project_assignments where designer_id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('member.removed', p_profile_id);
end $$;
