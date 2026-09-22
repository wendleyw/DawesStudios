-- Changing a member's role between agency and designer. A client profile is never a valid target —
-- Team management is scoped to people who work IN the studio, never the people it serves.
create function public.set_team_member_role(p_profile_id uuid, p_role public.app_role) returns void
  language plpgsql security definer set search_path='' as $$
declare current_role public.app_role;
begin
  perform private.assert_agency();
  if p_role not in ('agency', 'designer') then
    raise exception 'Team members are agency or designer only' using errcode = 'P0001';
  end if;
  select role into current_role from public.profiles where id = p_profile_id;
  if current_role is null or current_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if current_role = 'agency' and p_role <> 'agency'
     and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot change the studio''s only agency member' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  perform private.audit('member.role_changed', p_profile_id, jsonb_build_object('role', p_role));
end $$;
revoke execute on function public.set_team_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_team_member_role(uuid, public.app_role) to authenticated;

-- Removing a member's access to studio data. This is the DATA half only — it never touches
-- auth.users. The privileged half (banning the Auth account so the person cannot sign in at all)
-- lives in `apps/web/app/api/team-members/[id]/remove/route.ts`, Task 2, because only a server
-- holding the service-role key can call the Auth Admin API; a Postgres function running as
-- `authenticated` cannot.
create function public.remove_team_member(p_profile_id uuid) returns void
  language plpgsql security definer set search_path='' as $$
declare current_role public.app_role;
begin
  perform private.assert_agency();
  select role into current_role from public.profiles where id = p_profile_id;
  if current_role is null or current_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if current_role = 'agency' and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot remove the studio''s only agency member' using errcode = 'P0001';
  end if;
  delete from public.project_assignments where designer_id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('member.removed', p_profile_id);
end $$;
revoke execute on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.remove_team_member(uuid) to authenticated;
