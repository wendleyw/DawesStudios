begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Isolate preferences within the rolled-back transaction; restore any actual viewer choices afterward.
delete from public.board_preferences;

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select is(public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['timeline','kanban']),
  array['timeline','kanban'],'Agency can show both widgets in an accessible client');
select is(public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['kanban']),
  array['kanban'],'Saving replaces only the current caller preference');
select is((select count(*)::int from public.board_preferences where client_id=md5('dawes:client-org-1')::uuid),1,
  'Repeated saves maintain one preference per user and client');
select is(public.save_board_widgets(md5('dawes:client-org-2')::uuid,array['timeline']),
  array['timeline'],'Another client has an independent choice');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['unknown'])$$,
  '23514',null,'Unknown widgets fail database validation');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['timeline','timeline'])$$,
  '23514',null,'Duplicate widget identifiers are refused');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-1')::uuid,array[null]::text[])$$,
  '23514',null,'Null widget identifiers are refused');
select throws_ok($$update public.board_preferences set user_id=md5('dawes:client-1')::uuid$$,
  '42501',null,'Preference owners cannot be reassigned');
select throws_ok($$update public.board_preferences set client_id=md5('dawes:client-org-2')::uuid$$,
  '42501',null,'Preference client scopes cannot be reassigned');

select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
select is((select count(*)::int from public.board_preferences),0,
  'Clients cannot read agency choices in their own workspace');
select is(public.save_board_widgets(md5('dawes:client-org-1')::uuid,array[]::text[]),
  array[]::text[],'Clients may intentionally hide every widget');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-2')::uuid,array['kanban'])$$,
  '42501',null,'Clients cannot save preferences for another tenant');
select throws_ok($$insert into public.board_preferences(user_id,client_id,visible_widgets)
  values(md5('dawes:agency')::uuid,md5('dawes:client-org-3')::uuid,array['timeline'])$$,
  '42501',null,'Supplying another user id cannot create a preference for them');
with changed as (
  update public.board_preferences set visible_widgets=array['timeline'] where user_id=md5('dawes:agency')::uuid returning user_id
) select is((select count(*)::int from changed),0,'Client writes cannot alter agency preferences');

-- A second member of the same client is still a different viewer.
reset role;
insert into public.client_memberships(client_id,user_id)
  values(md5('dawes:client-org-1')::uuid,md5('dawes:client-2')::uuid) on conflict do nothing;
select set_config('request.jwt.claim.sub',md5('dawes:client-2')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.board_preferences where client_id=md5('dawes:client-org-1')::uuid),0,
  'Same-client viewers cannot read each other choices');
select is(public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['timeline']),
  array['timeline'],'A second same-client viewer saves an independent preference');

select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
select is(public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['kanban']),
  array['kanban'],'An assigned designer can save their own choice');
reset role;
delete from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid;
set local role authenticated;
select is((select count(*)::int from public.board_preferences),0,
  'Losing workspace assignments also hides designer preferences');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['timeline'])$$,
  '42501',null,'A designer cannot change preferences after workspace access is revoked');

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
select is((select visible_widgets from public.board_preferences where client_id=md5('dawes:client-org-1')::uuid),
  array['kanban'],'Other viewers never changed the agency choice');
select is((select visible_widgets from public.board_preferences where client_id=md5('dawes:client-org-2')::uuid),
  array['timeline'],'Changes in another client preserve this workspace choice');
select is((select count(*)::int from public.board_preferences),2,
  'Agency has no override for other users preferences');

reset role;
update public.profiles set removed_at=now() where id=md5('dawes:client-1')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.board_preferences),0,
  'A removed viewer cannot read persisted preferences with an old token');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['timeline'])$$,
  '42501',null,'Removed viewers cannot update their saved choices');
reset role;
set local role anon;
select throws_ok($$select * from public.board_preferences$$,'42501',null,
  'Anonymous requests cannot read board preferences');
select throws_ok($$select public.save_board_widgets(md5('dawes:client-org-1')::uuid,array['timeline'])$$,
  '42501',null,'Anonymous requests cannot save board preferences');
reset role;
select ok(not has_function_privilege('anon','public.save_board_widgets(uuid,text[])','EXECUTE'),
  'Anonymous requests have no permission to invoke the preference writer');
select * from finish();
rollback;
