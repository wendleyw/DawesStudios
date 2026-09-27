begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create temp table invitation_cases(name text primary key, invitation_id uuid, token text,
  existing_user_id uuid, existing_removed boolean);
grant all on invitation_cases to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  (md5('test:reinvit:active')::uuid,'reinvit-active@fixture.local',now(),'{}'),
  (md5('test:reinvit:removed')::uuid,'reinvit-removed@fixture.local',now(),'{}'),
  (md5('test:reinvit:other')::uuid,'reinvit-other@fixture.local',now(),'{}'),
  (md5('test:reinvit:staff')::uuid,'reinvit-staff@fixture.local',now(),'{}');
update auth.users set encrypted_password='existing-password-hash'
  where id in (md5('test:reinvit:active')::uuid,md5('test:reinvit:removed')::uuid);
insert into public.client_memberships(client_id,user_id) values
  (md5('dawes:client-org-1')::uuid,md5('test:reinvit:active')::uuid),
  (md5('dawes:client-org-3')::uuid,md5('test:reinvit:active')::uuid),
  (md5('dawes:client-org-1')::uuid,md5('test:reinvit:removed')::uuid),
  (md5('dawes:client-org-3')::uuid,md5('test:reinvit:removed')::uuid);
update public.profiles set removed_at=now(),removal_completed_at=now()
  where id=md5('test:reinvit:removed')::uuid;
update public.profiles set role='designer',removed_at=now(),removal_completed_at=now()
  where id=md5('test:reinvit:staff')::uuid;

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
insert into invitation_cases
  select 'active',(v->>'id')::uuid,v->>'token',(v->>'existing_user_id')::uuid,
    (v->>'existing_removed')::boolean from (
    select public.create_invitation('reinvit-active@fixture.local','client',md5('dawes:client-org-2')::uuid) v) x;
insert into invitation_cases
  select 'removed',(v->>'id')::uuid,v->>'token',(v->>'existing_user_id')::uuid,
    (v->>'existing_removed')::boolean from (
    select public.create_invitation('reinvit-removed@fixture.local','client',md5('dawes:client-org-2')::uuid) v) x;
insert into invitation_cases
  select 'new',(v->>'id')::uuid,v->>'token',(v->>'existing_user_id')::uuid,
    (v->>'existing_removed')::boolean from (
    select public.create_invitation('reinvit-new@fixture.local','client',md5('dawes:client-org-2')::uuid) v) x;
select is((select existing_user_id from invitation_cases where name='active'),
  md5('test:reinvit:active')::uuid,'Agency gets the active Auth identity for link delivery');
select is((select existing_removed from invitation_cases where name='removed'),true,
  'Agency gets the removed-client delivery flag');
select is((select existing_user_id from invitation_cases where name='new'),null::uuid,
  'The new-account invitation records that no Auth identity existed yet');
reset role;
select is((select requires_password from private.invitation_tokens
  where invitation_id=(select invitation_id from invitation_cases where name='new')),true,
  'New-account password intent is stored before Auth delivery');
select is((select requires_password from private.invitation_tokens
  where invitation_id=(select invitation_id from invitation_cases where name='active')),false,
  'An existing account never receives new-account password intent');
set local role authenticated;
select throws_ok($$select public.create_invitation('reinvit-staff@fixture.local','client',md5('dawes:client-org-2')::uuid)$$,
  'P0001','Existing members require an administrator-managed role change',
  'A removed staff account cannot be invited as a client');
select throws_ok($$select public.create_invitation('reinvit-active@fixture.local','designer')$$,
  'P0001',null,'An active client cannot be invited into a staff role');
select throws_ok($$select public.create_invitation('reinvit-removed@fixture.local','designer')$$,
  'P0001',null,'A removed client cannot be invited into a staff role');
reset role;
insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data) values
  (md5('test:reinvit:new')::uuid,'reinvit-new@fixture.local',now(),
   'auth-invite-placeholder-hash','{}');

select set_config('request.jwt.claim.sub',md5('test:reinvit:staff')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.accept_invitation('irrelevant-after-removal')$$,
  '42501','Your studio access has been removed',
  'A removed staff member remains blocked before invitation-token lookup');
reset role;

update public.profiles set removal_completed_at=null
  where id=md5('test:reinvit:removed')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.create_invitation('reinvit-removed@fixture.local','client',md5('dawes:client-org-2')::uuid)$$,
  'P0001','Client removal is still in progress',
  'Agency cannot send a return invitation while the Auth ban is unfinished');
reset role;
select set_config('request.jwt.claim.sub',md5('test:reinvit:removed')::uuid::text,true);
set local role authenticated;
select throws_ok(format('select public.accept_invitation(%L)',
  (select token from invitation_cases where name='removed')),
  'P0001','Client removal is still in progress',
  'A previously prepared invitation cannot outrun an in-flight Auth ban');
select throws_ok(format('select public.invitation_requires_password(%L)',
  (select token from invitation_cases where name='removed')),
  'P0001','Client removal is still in progress',
  'Password setup also waits for the client removal to finish');
reset role;
update public.profiles set removal_completed_at=now()
  where id=md5('test:reinvit:removed')::uuid;

select set_config('request.jwt.claim.sub',md5('test:reinvit:removed')::uuid::text,true);
set local role authenticated;
select is(public.invitation_requires_password((select token from invitation_cases where name='removed')),false,
  'An existing removed client retains the original password');
select is(private.is_client_member(md5('dawes:client-org-1')::uuid),false,
  'Removed client has no old-client access before consent');
select is(private.is_client_member(md5('dawes:client-org-2')::uuid),false,
  'Removed client has no invited-client access before consent');
select throws_ok(format('select public.accept_invitation(%L)',
  (select token from invitation_cases where name='active')),
  '42501','Invitation is invalid, expired or belongs to another email',
  'A token for another verified email cannot restore access');
reset role;
select is((select count(*)::int from public.client_memberships
  where user_id=md5('test:reinvit:removed')::uuid),2,
  'A rejected token leaves stale memberships untouched and blocked');

select set_config('request.jwt.claim.sub',md5('test:reinvit:active')::uuid::text,true);
set local role authenticated;
select is(public.invitation_requires_password((select token from invitation_cases where name='active')),false,
  'An existing active client is not prompted to replace its password');
select throws_ok(format('select public.invitation_requires_password(%L)',
  (select token from invitation_cases where name='new')),
  '42501','Invitation is invalid, expired or belongs to another email',
  'A wrong-email caller cannot pass password setup validation');
select public.accept_invitation((select token from invitation_cases where name='active'));
select ok(private.is_client_member(md5('dawes:client-org-1')::uuid),
  'Accepting a second client preserves the first membership');
select ok(private.is_client_member(md5('dawes:client-org-3')::uuid),
  'Accepting a second client preserves another active membership');
select ok(private.is_client_member(md5('dawes:client-org-2')::uuid),
  'Accepting adds only the invited client');
select throws_ok(format('select public.accept_invitation(%L)',
  (select token from invitation_cases where name='active')),
  '42501','Invitation is invalid, expired or belongs to another email',
  'An accepted token cannot be replayed');
reset role;

select set_config('request.jwt.claim.sub',md5('test:reinvit:new')::uuid::text,true);
set local role authenticated;
select is(public.invitation_requires_password((select token from invitation_cases where name='new')),true,
  'A freshly invited Auth identity still needs setup after GoTrue fills a placeholder hash');
reset role;

select set_config('request.jwt.claim.sub',md5('test:reinvit:removed')::uuid::text,true);
set local role authenticated;
select public.accept_invitation((select token from invitation_cases where name='removed'));
select ok(private.is_client_member(md5('dawes:client-org-2')::uuid),
  'Valid token restores only the explicitly invited client');
select is(private.is_client_member(md5('dawes:client-org-1')::uuid),false,
  'Old client access is not resurrected');
select is(private.is_client_member(md5('dawes:client-org-3')::uuid),false,
  'Another stale membership is not resurrected');
reset role;
select is((select count(*)::int from public.client_memberships
  where user_id=md5('test:reinvit:removed')::uuid),1,
  'Every retained stale membership is removed at acceptance');
select ok((select removed_at is null and removal_completed_at is null from public.profiles
  where id=md5('test:reinvit:removed')::uuid),'Both removal markers are cleared after consent');

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
insert into invitation_cases
  select 'revoked',(v->>'id')::uuid,v->>'token',(v->>'existing_user_id')::uuid,
    (v->>'existing_removed')::boolean from (
    select public.create_invitation('reinvit-other@fixture.local','client',md5('dawes:client-org-2')::uuid) v) x;
reset role;
select set_config('request.jwt.claim.sub',md5('test:reinvit:other')::uuid::text,true);
set local role authenticated;
select is(public.invitation_requires_password((select token from invitation_cases where name='revoked')),false,
  'A pre-existing Auth identity with no password is not mistaken for a new invite');
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select public.revoke_invitation((select invitation_id from invitation_cases where name='revoked'));
reset role;
select set_config('request.jwt.claim.sub',md5('test:reinvit:other')::uuid::text,true);
set local role authenticated;
select throws_ok(format('select public.invitation_requires_password(%L)',
  (select token from invitation_cases where name='revoked')),
  '42501','Invitation is invalid, expired or belongs to another email',
  'A revoked token cannot authorize password setup');
select throws_ok(format('select public.accept_invitation(%L)',
  (select token from invitation_cases where name='revoked')),
  '42501','Invitation is invalid, expired or belongs to another email',
  'A revoked token grants no membership');
reset role;
select * from finish();
rollback;
