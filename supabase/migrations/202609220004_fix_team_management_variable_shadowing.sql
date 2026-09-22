-- Fix: rename current_role variable to target_role to avoid shadowing PostgreSQL's reserved CURRENT_ROLE
create or replace function public.set_team_member_role(p_profile_id uuid, p_role public.app_role) returns void
  language plpgsql security definer set search_path='' as $$
declare target_role public.app_role;
begin
  perform private.assert_agency();
  if p_role not in ('agency', 'designer') then
    raise exception 'Team members are agency or designer only' using errcode = 'P0001';
  end if;
  select role into target_role from public.profiles where id = p_profile_id;
  if target_role is null or target_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if target_role = 'agency' and p_role <> 'agency'
     and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot change the studio''s only agency member' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  perform private.audit('member.role_changed', p_profile_id, jsonb_build_object('role', p_role));
end $$;

create or replace function public.remove_team_member(p_profile_id uuid) returns void
  language plpgsql security definer set search_path='' as $$
declare target_role public.app_role;
begin
  perform private.assert_agency();
  select role into target_role from public.profiles where id = p_profile_id;
  if target_role is null or target_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if target_role = 'agency' and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot remove the studio''s only agency member' using errcode = 'P0001';
  end if;
  delete from public.project_assignments where designer_id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('member.removed', p_profile_id);
end $$;
