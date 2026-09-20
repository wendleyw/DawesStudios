begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- A second member of the same client still cannot read or update another person's draft.
insert into public.client_memberships(client_id,user_id) values(md5('dawes:client-org-1')::uuid,md5('dawes:client-2')::uuid);
select set_config('request.jwt.claim.sub',md5('dawes:client-2')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.template_drafts where id=md5('dawes:draft-1')::uuid),0,'Same-client members cannot read another personal template draft');
with changed as(update public.template_drafts set name='Unauthorized edit' where id=md5('dawes:draft-1')::uuid returning id) select is((select count(*)::int from changed),0,'Same-client members cannot update another personal draft');
select throws_ok($$select public.update_workspace_settings('Unauthorized','UTC')$$,'42501','Agency access required','Client cannot edit workspace settings');
select throws_ok($$select public.save_service_preset('social',1,2,5)$$,'42501','Agency access required','Client cannot edit service presets');
select throws_ok($$select public.create_client('Unauthorized','unauthorized')$$,'42501','Agency access required','Client cannot create a workspace');
select throws_ok($$select public.create_invitation('attacker@fixture.local','agency')$$,'42501','Agency access required','Client cannot invite a privileged account');
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.template_drafts where id=md5('dawes:draft-1')::uuid),0,'Agency has no override for another personal draft');
select throws_ok($$select public.save_briefing(md5('dawes:client-org-1')::uuid,'social','Cross-tenant parent',md5('dawes:campaign-2')::uuid)$$,'23503',null,'A briefing cannot use a different client campaign');
select throws_ok($$insert into public.project_assets(project_id,name,storage_path,mime_type,file_size) values(md5('dawes:project-2')::uuid,'Invalid',md5('dawes:project-4')::uuid::text||'/'||md5('cross-asset')::uuid::text||'.png','image/png',100)$$,'42501',null,'An asset cannot register bytes from another project');
reset role;

-- Tests use disposable token hashes inside this rolled-back transaction.
insert into public.invitations(id,email,role,client_id,expires_at) values(md5('test:expired-invitation')::uuid,'acme@client.dawes.local','client',md5('dawes:client-org-1')::uuid,now()-interval '1 minute');
insert into private.invitation_tokens(invitation_id,token_hash) values(md5('test:expired-invitation')::uuid,encode(extensions.digest('expired-test-token','sha256'),'hex'));
insert into public.invitations(id,email,role,client_id) values(md5('test:wrong-email-invitation')::uuid,'harbor-pine@client.dawes.local','client',md5('dawes:client-org-2')::uuid);
insert into private.invitation_tokens(invitation_id,token_hash) values(md5('test:wrong-email-invitation')::uuid,encode(extensions.digest('wrong-email-test-token','sha256'),'hex'));
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.accept_invitation('expired-test-token')$$,'42501','Invitation is invalid, expired or belongs to another email','Expired invitation tokens cannot grant access');
select throws_ok($$select public.accept_invitation('wrong-email-test-token')$$,'42501','Invitation is invalid, expired or belongs to another email','Invitation token possession cannot substitute another email');
select throws_ok($$select public.accept_invitation('fabricated-test-token')$$,'42501','Invitation is invalid, expired or belongs to another email','Fabricated invitation tokens cannot grant access');
select is((select role::text from public.profiles where id=auth.uid()),'client','Rejected invitations leave the role unchanged');
select * from finish();
rollback;
