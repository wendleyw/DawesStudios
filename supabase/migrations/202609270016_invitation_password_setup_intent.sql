-- GoTrue assigns an invited user a placeholder password during email verification. Record
-- whether the Auth identity existed before invitation delivery, rather than inspecting that hash.
alter table private.invitation_tokens
  add column requires_password boolean not null default false;

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
  insert into private.invitation_tokens(invitation_id,token_hash,requires_password)
    values(result_id,encode(extensions.digest(token,'sha256'),'hex'),target_id is null);
  perform private.audit('invitation.created',result_id);
  return jsonb_build_object('id',result_id,'token',token,
    'existing_user_id',target_id,'existing_removed',target_removed_at is not null);
end $$;

create or replace function public.invitation_requires_password(p_token text) returns boolean
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
  select t.requires_password into password_required
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
