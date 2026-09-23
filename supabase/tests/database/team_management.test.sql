begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- A client cannot call either function, against any target. A subquery for "some client profile"
-- rather than a hand-computed fixture key, for the same reason as the two throws_ok calls below.
select set_config(
  'request.jwt.claim.sub', (select id from public.profiles where role='client' limit 1)::text, true
);
set local role authenticated;
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-1')::uuid,'agency')$$,
  '42501', null, 'A client cannot change a team member''s role'
);
select throws_ok(
  $$select public.remove_team_member(md5('dawes:designer-1')::uuid)$$,
  '42501', null, 'A client cannot remove a team member'
);
reset role;

-- As the agency, exercise the refusals first: they must not depend on setup, only on the seeded
-- dataset already having exactly one agency profile.
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;
select is(
  (select count(*)::int from public.profiles where role='agency'), 1,
  'Precondition: exactly one agency profile in the seeded dataset'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:agency')::uuid,'designer')$$,
  'P0001', 'Cannot change the studio''s only agency member',
  'Refuses to demote the only agency member'
);
select throws_ok(
  $$select public.remove_team_member(md5('dawes:agency')::uuid)$$,
  'P0001', 'Cannot remove the studio''s only agency member',
  'Refuses to remove the only agency member'
);
-- A subquery for "some client profile" rather than a hardcoded fixture-key guess: this test only
-- needs a profile whose role is 'client', not a specific one, and a live query cannot be wrong about
-- which key maps to which seeded row the way a hand-computed md5('dawes:client-N') can be.
select throws_ok(
  $$select public.set_team_member_role((select id from public.profiles where role='client' limit 1),'agency')$$,
  'P0001', 'Target is not an active team member',
  'Refuses a client profile as a role-change target'
);
select throws_ok(
  $$select public.remove_team_member((select id from public.profiles where role='client' limit 1))$$,
  'P0001', 'Target is not a team member',
  'Refuses a client profile as a removal target'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-1')::uuid,'client')$$,
  'P0001', 'Team members are agency or designer only',
  'Refuses an out-of-range role'
);

-- A successful role change round-trips, and is audited.
select public.set_team_member_role(md5('dawes:designer-1')::uuid, 'agency');
select is(
  (select role::text from public.profiles where id=md5('dawes:designer-1')::uuid), 'agency',
  'Role change actually updates profiles.role'
);
-- private.audit_events grants no SELECT to authenticated (it is an internal log, not
-- application-readable), so this check runs with the role impersonation lifted rather than as the
-- agency caller the RPC call above needed.
reset role;
select isnt_empty(
  $$select 1 from private.audit_events where event='member.role_changed' and entity_id=md5('dawes:designer-1')::uuid$$,
  'Role change writes an audit event'
);
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;
select public.set_team_member_role(md5('dawes:designer-1')::uuid, 'designer');
select is(
  (select role::text from public.profiles where id=md5('dawes:designer-1')::uuid), 'designer',
  'Role change reverses cleanly'
);

-- Removal revokes every assignment the designer holds, in one call, not one project at a time —
-- the property this function exists to add over calling revoke_design_assignment per project.
select ok(
  (select count(*)::int from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid) > 0,
  'Precondition: the fixture designer holds at least one assignment before removal'
);
select public.remove_team_member(md5('dawes:designer-1')::uuid);
select is(
  (select count(*)::int from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid), 0,
  'Removal revokes every assignment the designer held'
);
reset role;
select isnt_empty(
  $$select 1 from private.audit_events where event='member.removed' and entity_id=md5('dawes:designer-1')::uuid$$,
  'Removal writes an audit event'
);
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;

-- Removal against a target already holding zero assignments is a no-op, not an error — matching
-- revoke_design_assignment's own behavior (202609200015_designer_brief_and_project_integrity.sql:35).
select lives_ok(
  $$select public.remove_team_member(md5('dawes:designer-1')::uuid)$$,
  'Removing an already-removed member does not error'
);
reset role;

select * from finish();
rollback;
