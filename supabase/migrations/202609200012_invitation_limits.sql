create or replace function public.create_invitation(p_email text,p_role public.app_role,p_client_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result_id uuid; token text; begin
 perform private.assert_agency();
 perform pg_catalog.pg_advisory_xact_lock(7710921);
 update public.invitations set status='revoked' where status='pending' and expires_at<=now();
 if (select count(*) from private.audit_events where actor_id=auth.uid() and event='invitation.created' and created_at>now()-interval '1 hour')>=20 then raise exception 'Invitation rate limit reached. Try again in an hour.'; end if;
 if (select count(*) from public.invitations where status='pending' and expires_at>now())>=50 then raise exception 'Resolve pending invitations before inviting more members.'; end if;
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid email required'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.invitations(email,role,client_id) values(lower(trim(p_email)),p_role,p_client_id) returning id into result_id;
 insert into private.invitation_tokens(invitation_id,token_hash) values(result_id,encode(extensions.digest(token,'sha256'),'hex'));
 perform private.audit('invitation.created',result_id);
 return jsonb_build_object('id',result_id,'token',token);
end $$;
