-- Security review finding on 202609220002 (TOCTOU): the last-agency-member guard in both
-- set_team_member_role and remove_team_member reads `select count(*) from public.profiles where
-- role='agency'` with no lock. Two concurrent calls targeting two different agency members can both
-- read count=2, both see "more than one, safe", and both proceed -- leaving zero agency members,
-- exactly the outcome the guard exists to prevent. `adjust_credits` locks the row it is about to act
-- on (`for update`) for the identical reason; the row here is not a single balance but the whole
-- agency-role set, so this locks that set instead: `for update` re-evaluates its WHERE clause against
-- committed state once any blocking transaction releases its lock, so a concurrent transaction that
-- already demoted one agency member is seen correctly rather than read from a stale snapshot.
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
    select count(*) into agency_count from public.profiles where role = 'agency' for update;
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
    select count(*) into agency_count from public.profiles where role = 'agency' for update;
    if agency_count <= 1 then
      raise exception 'Cannot remove the studio''s only agency member' using errcode = 'P0001';
    end if;
  end if;
  delete from public.project_assignments where designer_id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('member.removed', p_profile_id);
end $$;
