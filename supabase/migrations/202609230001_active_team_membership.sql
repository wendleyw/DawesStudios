-- Preserve authored history while making removal a database authorization decision. The Auth
-- ban is a second, retryable step; its failure must never retain agency privileges.
alter table public.profiles add column removed_at timestamptz;
alter table public.profiles add column removal_completed_at timestamptz;
alter table public.profiles add constraint removal_completion_requires_removal
  check (removal_completed_at is null or removed_at is not null);

-- Accounts already blocked by the previous removal path must not count as active administrators.
update public.profiles p set removed_at=now(), removal_completed_at=now()
from auth.users u
where u.id=p.id and p.role in ('agency','designer') and u.banned_until>now();

create or replace function private.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=auth.uid() and removed_at is null
$$;

create or replace function private.can_access_project(target_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.projects p where p.id=target_project and (
    private.is_agency() or private.is_client_member(p.client_id) or (
      private.current_role()='designer' and exists(
        select 1 from public.project_assignments a where a.project_id=p.id and a.designer_id=auth.uid()
      )
    )
  ))
$$;

create or replace function public.set_team_member_role(p_profile_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path='' as $$
declare target_role public.app_role;
begin
  -- All membership writes share one transaction lock, including assignment. Recheck the caller
  -- after waiting: a concurrent removal may have revoked the caller while this request queued.
  perform pg_catalog.pg_advisory_xact_lock(93721, 1);
  perform private.assert_agency();
  if p_role is null or p_role not in ('agency','designer') then
    raise exception 'Team members are agency or designer only' using errcode='P0001';
  end if;
  select role into target_role from public.profiles where id=p_profile_id and removed_at is null;
  if target_role is null or target_role not in ('agency','designer') then
    raise exception 'Target is not an active team member' using errcode='P0001';
  end if;
  if target_role='agency' and p_role<>'agency' and (
    select count(*) from public.profiles where role='agency' and removed_at is null
  )<=1 then
    raise exception 'Cannot change the studio''s only agency member' using errcode='P0001';
  end if;
  if target_role=p_role then return; end if;
  update public.profiles set role=p_role where id=p_profile_id;
  perform private.audit('member.role_changed', p_profile_id, jsonb_build_object('role',p_role));
end $$;

create or replace function public.remove_team_member(p_profile_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_role public.app_role; target_removed_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(93721, 1);
  perform private.assert_agency();
  select role,removed_at into target_role,target_removed_at from public.profiles where id=p_profile_id;
  if target_role is null or target_role not in ('agency','designer') then
    raise exception 'Target is not a team member' using errcode='P0001';
  end if;
  -- A retry completes the Auth half without another audit event or changing the removal time.
  if target_removed_at is not null then return; end if;
  if target_role='agency' and (
    select count(*) from public.profiles where role='agency' and removed_at is null
  )<=1 then
    raise exception 'Cannot remove the studio''s only agency member' using errcode='P0001';
  end if;
  update public.profiles set removed_at=clock_timestamp() where id=p_profile_id;
  delete from public.project_assignments where designer_id=p_profile_id;
  delete from public.notifications where user_id=p_profile_id;
  perform private.audit('member.removed', p_profile_id);
end $$;

create or replace function public.assign_designer(p_project_id uuid,p_designer_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_client uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(93721, 1);
  perform private.assert_agency();
  if not exists(select 1 from public.profiles where id=p_designer_id and role='designer' and removed_at is null) then
    raise exception 'Select an active designer account' using errcode='P0001';
  end if;
  select client_id into target_client from public.projects where id=p_project_id;
  insert into public.project_assignments(project_id,designer_id) values(p_project_id,p_designer_id) on conflict do nothing;
  if not found then return; end if;
  insert into public.notifications(user_id,client_id,project_id,title,body)
    values(p_designer_id,target_client,p_project_id,'New project assignment','A project has been assigned to you.');
  perform private.audit('project.assigned',p_project_id);
end $$;

revoke execute on function private.current_role(), private.can_access_project(uuid) from public,anon;
grant execute on function private.current_role(), private.can_access_project(uuid) to authenticated;
revoke execute on function public.set_team_member_role(uuid,public.app_role), public.remove_team_member(uuid), public.assign_designer(uuid,uuid) from public,anon;
grant execute on function public.set_team_member_role(uuid,public.app_role), public.remove_team_member(uuid), public.assign_designer(uuid,uuid) to authenticated;
