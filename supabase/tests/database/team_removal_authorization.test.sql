begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;
select public.set_team_member_role(md5('dawes:designer-1')::uuid, 'agency');
select public.remove_team_member(md5('dawes:designer-1')::uuid);
select ok(
  (select removed_at is not null and removal_completed_at is null from public.profiles where id=md5('dawes:designer-1')::uuid),
  'The data half persists pending removal before the Auth ban'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-1')::uuid, 'designer')$$,
  'P0001', 'Target is not an active team member', 'Role changes cannot reactivate a removed member'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-2')::uuid, null)$$,
  'P0001', 'Team members are agency or designer only', 'Null role input is refused explicitly'
);
reset role;
create temp table removal_retry_before as
  select removed_at,(select count(*) from private.audit_events where event='member.removed' and entity_id=md5('dawes:designer-1')::uuid) as events
  from public.profiles where id=md5('dawes:designer-1')::uuid;
set local role authenticated;
select public.remove_team_member(md5('dawes:designer-1')::uuid);
reset role;
select is(
  (select removed_at from public.profiles where id=md5('dawes:designer-1')::uuid),
  (select removed_at from removal_retry_before), 'Removal retries preserve the original removal time'
);
select is(
  (select count(*) from private.audit_events where event='member.removed' and entity_id=md5('dawes:designer-1')::uuid),
  (select events from removal_retry_before), 'Removal retries do not duplicate audit events'
);
set local role authenticated;

select throws_ok(
  $$select public.set_team_member_role(md5('dawes:agency')::uuid, 'designer')$$,
  'P0001', 'Cannot change the studio''s only agency member',
  'A removed agency does not permit demotion of the last active agency'
);
-- Restore the caller if a broken implementation incorrectly allowed the demotion, so the next
-- assertion independently exercises removal. The surrounding transaction restores the fixture.
reset role;
update public.profiles set role='agency' where id=md5('dawes:agency')::uuid;
set local role authenticated;
select throws_ok(
  $$select public.remove_team_member(md5('dawes:agency')::uuid)$$,
  'P0001', 'Cannot remove the studio''s only agency member',
  'A removed agency does not permit removal of the last active agency'
);

select set_config('request.jwt.claim.sub', md5('dawes:designer-1')::uuid::text, true);
select ok(not private.is_agency(), 'A removed agency immediately loses agency privileges');
select throws_ok(
  $$select public.accept_invitation('irrelevant-after-removal')$$,
  '42501', 'Your studio access has been removed', 'An invitation cannot reactivate a removed member'
);
select is((select count(*)::int from public.projects), 0, 'An issued token cannot read projects after removal');
select is((select count(*)::int from public.internal_comments), 0, 'A removed agency cannot read internal comments');
select is((select count(*)::int from public.brand_assets), 0, 'A removed agency cannot read brand assets');
select throws_ok(
  $$update public.profiles set removed_at=null where id=auth.uid()$$,
  '42501', null, 'A removed member cannot clear its removal marker directly'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-2')::uuid, 'agency')$$,
  '42501', 'Agency access required', 'A removed agency cannot grant new agency access'
);
reset role;
-- Even stale/directly provisioned relationships must not turn missing-role predicates into NULL.
insert into public.client_memberships(client_id,user_id)
  select id,md5('dawes:designer-1')::uuid from public.clients limit 1;
insert into public.project_assignments(project_id,designer_id)
  select id,md5('dawes:designer-1')::uuid from public.projects limit 1;
select is(private.is_client_member((select client_id from public.client_memberships where user_id=md5('dawes:designer-1')::uuid)),false,
  'A missing role with a stale membership returns false, not NULL');
select is(private.can_produce((select project_id from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid)),false,
  'A missing role with a stale assignment returns false, not NULL');
select is(private.can_access_client((select client_id from public.client_memberships where user_id=md5('dawes:designer-1')::uuid)),false,
  'Stale relationships cannot restore workspace access');
-- Simulate an in-flight notification committing after removal; the read policy is the final gate.
insert into public.notifications(user_id,title,body)
  values(md5('dawes:designer-1')::uuid,'Internal activity','Private project update');
set local role authenticated;
select is((select count(*)::int from public.notifications),0,'Removed members cannot read later notifications');
reset role;
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
select private.notify_agency(null,null,'New activity','Must not reach removed accounts');
select is((select count(*)::int from public.notifications where user_id=md5('dawes:designer-1')::uuid and title='New activity'),0,
  'Agency notifications exclude removed members');
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;
select public.remove_team_member(md5('dawes:designer-2')::uuid);
select throws_ok(
  $$select public.assign_designer((select id from public.projects limit 1),md5('dawes:designer-2')::uuid)$$,
  'P0001', 'Select an active designer account', 'A removed designer cannot receive a new assignment'
);
select is((select count(*)::int from public.project_assignments where designer_id=md5('dawes:designer-2')::uuid),0,
  'Removal clears all designer assignments');
reset role;
select * from finish();
rollback;
