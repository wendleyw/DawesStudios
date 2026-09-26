-- Route a client's project notifications to the people concerned, and remove one person from one
-- client. Spec: docs/superpowers/specs/2026-09-25-client-team-design.md (sections 1 and 5).

-- The signature of 202609200002_workflows.sql is kept, so its six callers do not change:
-- accept_briefing, publish_version, mark_project_delivered and post_comment (with a project), and
-- fulfill_credit_request and reject_credit_request (client-wide, without one).
create or replace function private.notify_client(
  target_client uuid, target_project uuid, message_title text, message_body text default ''
) returns void language sql security definer set search_path = '' as $$
  with members as (
    -- The client's people: client-role members who have not been removed.
    select m.user_id, m.notify_all
    from public.client_memberships m
    join public.profiles p on p.id = m.user_id
    where m.client_id = target_client and p.role = 'client' and p.removed_at is null
  ),
  requester as (
    -- The project's requester (its briefing's), while they are still one of the client's people.
    select b.requested_by as user_id
    from public.projects pr
    join public.briefings b on b.id = pr.briefing_id
    where pr.id = target_project and b.requested_by in (select user_id from members)
  ),
  recipients as (
    -- Client-wide updates, and projects with no requester left, reach every person, as before.
    select user_id from members
    where target_project is null or not exists (select 1 from requester)
    union
    select user_id from requester
    union
    select user_id from members where notify_all
    union
    -- A studio reply in the client conversation (post_comment's fixed title) also reaches the
    -- client people who wrote in that project's conversation and are still at the client.
    select a.author_id
    from private.client_comment_authors a
    join public.client_comments c on c.id = a.comment_id
    where message_title = 'New message from Studio'
      and c.project_id = target_project
      and c.author_kind = 'client'
      and a.author_id in (select user_id from members)
  )
  insert into public.notifications(user_id, client_id, project_id, title, body)
  select user_id, target_client, target_project, message_title, message_body
  from recipients
  where user_id is distinct from auth.uid()
$$;

-- Removes one person from one client (the studio only, audited). Someone who still belongs to
-- another client loses only this membership and this client's notifications. Their last client
-- also deactivates the account the way remove_team_member does (removed_at, every notification
-- deleted) and keeps the membership row as the record of which client the pending removal belongs
-- to: removed_at already ends every access, and the People dialog lists the row with Finish removal
-- until /api/clients/[clientId]/members/[profileId]/remove has blocked sign-in. Returns true when
-- the account is deactivated, now or by an earlier attempt, which is when that route must finish.
create function public.remove_client_member(p_client_id uuid, p_profile_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_role public.app_role; target_removed_at timestamptz;
begin
  -- Membership writes share the team-management transaction lock; recheck the caller after waiting.
  perform pg_catalog.pg_advisory_xact_lock(93721, 1);
  perform private.assert_agency();
  select role, removed_at into target_role, target_removed_at
    from public.profiles where id = p_profile_id;
  if target_role is distinct from 'client' then
    raise exception 'Target is not a client person' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.client_memberships
                 where client_id = p_client_id and user_id = p_profile_id) then
    raise exception 'This person is not a member of this client' using errcode = 'P0001';
  end if;
  -- A retry completes the Auth half without another audit event or changing the removal time.
  if target_removed_at is not null then return true; end if;
  if exists (select 1 from public.client_memberships
             where user_id = p_profile_id and client_id <> p_client_id) then
    delete from public.client_memberships where client_id = p_client_id and user_id = p_profile_id;
    delete from public.notifications where user_id = p_profile_id and client_id = p_client_id;
    perform private.audit('client_member.removed', p_profile_id,
      jsonb_build_object('client_id', p_client_id, 'deactivated', false));
    return false;
  end if;
  update public.profiles set removed_at = clock_timestamp() where id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('client_member.removed', p_profile_id,
    jsonb_build_object('client_id', p_client_id, 'deactivated', true));
  return true;
end $$;
revoke execute on function public.remove_client_member(uuid, uuid) from public, anon;
grant execute on function public.remove_client_member(uuid, uuid) to authenticated;
