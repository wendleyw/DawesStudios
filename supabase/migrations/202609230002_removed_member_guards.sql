-- A removed membership has no current role. Authorization predicates must return false, never
-- NULL: PL/pgSQL's `if not allowed then` does not reject a NULL result.
create or replace function private.is_client_member(target_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role()='client' and exists(
    select 1 from public.client_memberships where client_id=target_client and user_id=auth.uid()
  ),false)
$$;
create or replace function private.can_produce(target_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.is_agency() or (private.current_role()='designer' and exists(
    select 1 from public.project_assignments where project_id=target_project and designer_id=auth.uid()
  )),false)
$$;
create or replace function private.can_access_client(target_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.is_agency() or private.is_client_member(target_client) or (
    private.current_role()='designer' and exists(
      select 1 from public.projects p join public.project_assignments a on a.project_id=p.id
      where p.client_id=target_client and a.designer_id=auth.uid()
    )
  ),false)
$$;

create or replace function private.notify_agency(target_client uuid,target_project uuid,message_title text,message_body text default '')
returns void language sql security definer set search_path='' as $$
  insert into public.notifications(user_id,client_id,project_id,title,body)
    select id,target_client,target_project,message_title,message_body from public.profiles
    where role='agency' and removed_at is null and id<>auth.uid()
$$;
alter policy notifications_read on public.notifications
  using(user_id=auth.uid() and private.current_role() is not null);
alter policy notifications_edit on public.notifications
  using(user_id=auth.uid() and private.current_role() is not null)
  with check(user_id=auth.uid() and private.current_role() is not null);

create or replace function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.invitations; user_email text;
begin
  perform pg_catalog.pg_advisory_xact_lock(93721,1);
  if auth.uid() is null then raise exception 'Sign in before accepting an invitation' using errcode='42501'; end if;
  if private.current_role() is null then raise exception 'Your studio access has been removed' using errcode='42501'; end if;
  select email into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select i.* into inv from public.invitations i join private.invitation_tokens t on t.invitation_id=i.id
    where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update of i;
  if not found or inv.status<>'pending' or inv.expires_at<now() or lower(inv.email)<>lower(coalesce(user_email,'')) then
    raise exception 'Invitation is invalid, expired or belongs to another email' using errcode='42501';
  end if;
  if exists(select 1 from public.client_memberships where user_id=auth.uid())
    or exists(select 1 from public.project_assignments where designer_id=auth.uid())
    or private.current_role() is distinct from 'client' then
    raise exception 'Existing members require an administrator-managed role change';
  end if;
  update public.profiles set role=inv.role where id=auth.uid();
  if inv.role='client' then insert into public.client_memberships(client_id,user_id) values(inv.client_id,auth.uid()); end if;
  update public.invitations set status='accepted' where id=inv.id;
  perform private.audit('invitation.accepted',inv.id);
end $$;

revoke execute on function private.is_client_member(uuid), private.can_produce(uuid), private.can_access_client(uuid) from public,anon;
grant execute on function private.is_client_member(uuid), private.can_produce(uuid), private.can_access_client(uuid) to authenticated;
revoke execute on function private.notify_agency(uuid,uuid,text,text) from public,anon,authenticated;
revoke execute on function public.accept_invitation(text) from public,anon;
grant execute on function public.accept_invitation(text) to authenticated;
