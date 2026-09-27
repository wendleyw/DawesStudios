-- Serialize invitation delivery and acceptance with member removal. A client may return only
-- after the Auth ban has completed; otherwise an in-flight ban could disable the returned account.
create or replace function public.create_invitation(p_email text,p_role public.app_role,p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result_id uuid; token text; target_id uuid; target_role public.app_role;
  target_removed_at timestamptz; target_removal_completed_at timestamptz; normalized_email text;
begin
  perform pg_catalog.pg_advisory_xact_lock(93721,1);
  perform private.assert_agency();
  perform pg_catalog.pg_advisory_xact_lock(7710921);
  update public.invitations set status='revoked' where status='pending' and expires_at<=now();
  if (select count(*) from private.audit_events where actor_id=auth.uid() and event='invitation.created' and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Invitation rate limit reached. Try again in an hour.';
  end if;
  if (select count(*) from public.invitations where status='pending' and expires_at>now())>=50 then
    raise exception 'Resolve pending invitations before inviting more members.';
  end if;
  normalized_email:=lower(trim(p_email));
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid email required';
  end if;
  select u.id,p.role,p.removed_at,p.removal_completed_at
    into target_id,target_role,target_removed_at,target_removal_completed_at
    from auth.users u join public.profiles p on p.id=u.id
    where lower(u.email)=normalized_email;
  if target_role='client' and target_removed_at is not null
    and target_removal_completed_at is null then
    raise exception 'Client removal is still in progress';
  end if;
  if target_id is not null and (
    target_role is distinct from 'client'
    or (target_removed_at is not null and p_role is distinct from 'client')
    or (p_role is distinct from 'client' and exists(
      select 1 from public.client_memberships where user_id=target_id))
    or (p_role='client' and exists(
      select 1 from public.client_memberships where user_id=target_id and client_id=p_client_id
    ) and target_removed_at is null)
  ) then
    raise exception 'Existing members require an administrator-managed role change';
  end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.invitations(email,role,client_id)
    values(normalized_email,p_role,p_client_id) returning id into result_id;
  insert into private.invitation_tokens(invitation_id,token_hash)
    values(result_id,encode(extensions.digest(token,'sha256'),'hex'));
  perform private.audit('invitation.created',result_id);
  return jsonb_build_object('id',result_id,'token',token,
    'existing_user_id',target_id,'existing_removed',target_removed_at is not null);
end $$;

create or replace function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.invitations; user_email text; target_role public.app_role;
  target_removed_at timestamptz; target_removal_completed_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(93721,1);
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invitation' using errcode='42501';
  end if;
  select role,removed_at,removal_completed_at
    into target_role,target_removed_at,target_removal_completed_at from public.profiles
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
  if target_role='client' and target_removed_at is not null
    and target_removal_completed_at is null then
    raise exception 'Client removal is still in progress';
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

-- A valid invitation's confirmed owner can learn only whether this Auth identity lacks a password.
-- The result never exposes the hash and is checked again by accept_invitation after Auth setup.
create function public.invitation_requires_password(p_token text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare target_role public.app_role; target_removed_at timestamptz;
  target_removal_completed_at timestamptz;
  password_required boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invitation' using errcode='42501';
  end if;
  select role,removed_at,removal_completed_at
    into target_role,target_removed_at,target_removal_completed_at from public.profiles
    where id=auth.uid();
  if target_removed_at is not null and target_role is distinct from 'client' then
    raise exception 'Your studio access has been removed' using errcode='42501';
  end if;
  if target_role='client' and target_removed_at is not null
    and target_removal_completed_at is null then
    raise exception 'Client removal is still in progress';
  end if;
  select coalesce(length(u.encrypted_password),0)=0 into password_required
    from auth.users u
    join public.invitations i on lower(i.email)=lower(u.email)
    join private.invitation_tokens t on t.invitation_id=i.id
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and i.status='pending' and i.expires_at>=now();
  if not found then
    raise exception 'Invitation is invalid, expired or belongs to another email' using errcode='42501';
  end if;
  return password_required;
end $$;

revoke execute on function public.invitation_requires_password(text) from public,anon;
grant execute on function public.invitation_requires_password(text) to authenticated;
