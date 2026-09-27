-- Preserve the established removed-staff denial before token lookup.
create or replace function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.invitations; user_email text; target_role public.app_role;
  target_removed_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(93721,1);
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invitation' using errcode='42501';
  end if;
  select role,removed_at into target_role,target_removed_at from public.profiles
    where id=auth.uid() for update;
  if target_removed_at is not null and target_role is distinct from 'client' then
    raise exception 'Your studio access has been removed' using errcode='42501';
  end if;
  select email into user_email from auth.users
    where id=auth.uid() and email_confirmed_at is not null;
  select i.* into inv from public.invitations i
    join private.invitation_tokens t on t.invitation_id=i.id
    where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update of i;
  if not found or inv.status<>'pending' or inv.expires_at<now()
    or lower(inv.email)<>lower(coalesce(user_email,'')) then
    raise exception 'Invitation is invalid, expired or belongs to another email' using errcode='42501';
  end if;
  if target_role is distinct from 'client'
    or exists(select 1 from public.project_assignments where designer_id=auth.uid())
    or (target_removed_at is not null and inv.role is distinct from 'client')
    or (target_removed_at is null and inv.role is distinct from 'client'
        and exists(select 1 from public.client_memberships where user_id=auth.uid()))
    or (target_removed_at is null and inv.role='client'
        and exists(select 1 from public.client_memberships
          where user_id=auth.uid() and client_id=inv.client_id)) then
    raise exception 'Existing members require an administrator-managed role change';
  end if;
  if target_removed_at is not null then
    -- The last-client removal retains its membership as a pending-removal record. Drop every
    -- stale relationship before clearing the removal marker so only the invited client returns.
    delete from public.client_memberships where user_id=auth.uid();
    delete from public.notifications where user_id=auth.uid();
    update public.profiles set removed_at=null,removal_completed_at=null where id=auth.uid();
  end if;
  update public.profiles set role=inv.role where id=auth.uid();
  if inv.role='client' then
    insert into public.client_memberships(client_id,user_id) values(inv.client_id,auth.uid());
  end if;
  update public.invitations set status='accepted' where id=inv.id;
  perform private.audit('invitation.accepted',inv.id);
end $$;

