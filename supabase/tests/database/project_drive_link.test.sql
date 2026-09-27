begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Self-contained fixture: an agency member, a client member, an assigned designer, the client's
-- project and a second client's project (to prove a client reads its own project only). Nothing
-- depends on the seed or the SABRE overlay.
create temporary table pdl(key text primary key, value uuid);
grant all on pdl to authenticated, service_role;
insert into pdl values
  ('agency',md5('pdl:agency')::uuid),('client',md5('pdl:client')::uuid),
  ('designer',md5('pdl:designer')::uuid),('client-org',md5('pdl:client-org')::uuid),
  ('other-client-org',md5('pdl:other-client-org')::uuid),('project',md5('pdl:project')::uuid),
  ('other-project',md5('pdl:other-project')::uuid);
create function pg_temp.k(p text) returns uuid language sql as $$ select value from pdl where key=p $$;
create function pg_temp.act_as(p text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true) $$;
grant execute on function pg_temp.k(text) to authenticated, service_role;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.k('agency'),'pdl-agency@fixture.local','{"display_name":"PDL Agency"}'),
  (pg_temp.k('client'),'pdl-client@fixture.local','{"display_name":"PDL Client"}'),
  (pg_temp.k('designer'),'pdl-designer@fixture.local','{"display_name":"PDL Designer"}');
update public.profiles set role='agency' where id=pg_temp.k('agency');
update public.profiles set role='designer' where id=pg_temp.k('designer');
insert into public.clients(id,name,slug) values
  (pg_temp.k('client-org'),'PDL Client','pdl-client'),
  (pg_temp.k('other-client-org'),'PDL Other Client','pdl-other-client');
insert into public.client_memberships(client_id,user_id) values (pg_temp.k('client-org'),pg_temp.k('client'));
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.k('project'),pg_temp.k('client-org'),'PDL project','ai','in_progress'),
  (pg_temp.k('other-project'),pg_temp.k('other-client-org'),'PDL other project','ai','in_progress');
insert into public.project_assignments(project_id,designer_id) values (pg_temp.k('project'),pg_temp.k('designer'));

select has_column('public','projects','drive_url','Projects have a drive_url column');

-- A missing project is refused before role, same errcode family as the cover RPCs.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(md5('pdl:missing')::uuid,'https://drive.google.com/drive/folders/1')$$,
  'P0002',null,'A missing project is refused');

-- A designer and a client cannot call the RPC at all.
reset role;
select pg_temp.act_as('designer');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'https://drive.google.com/drive/folders/1')$$,
  '42501',null,'A designer cannot set a Drive link');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'https://drive.google.com/drive/folders/1')$$,
  '42501',null,'A client cannot set a Drive link');
reset role;

-- Invalid URLs are refused: wrong scheme, a lookalike host, and a javascript: URL.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'http://drive.google.com/drive/folders/1')$$,
  '22023',null,'A plain http:// link is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'https://drive.google.com.evil.com/x')$$,
  '22023',null,'A lookalike host is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'javascript:alert(1)')$$,
  '22023',null,'A javascript: URL is refused');
select is((select drive_url from public.projects where id=pg_temp.k('project')),null,'No invalid attempt stored a link');

-- 1. The agency sets a link, then clears it with an empty string.
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'  https://drive.google.com/drive/folders/1  ')$$,
  'The agency sets a Drive link');
select is((select drive_url from public.projects where id=pg_temp.k('project')),'https://drive.google.com/drive/folders/1','The stored link is trimmed');
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'')$$,'The agency clears the link with an empty string');
select is((select drive_url from public.projects where id=pg_temp.k('project')),null,'Clearing stores null, never an empty string');
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'https://drive.google.com/drive/folders/2')$$,
  'The agency sets the link again');
reset role;
select ok(exists(select 1 from private.audit_events where event='project.drive_link_set' and entity_id=pg_temp.k('project')),'Setting a link is audited');
select ok(exists(select 1 from private.audit_events where event='project.drive_link_cleared' and entity_id=pg_temp.k('project')),'Clearing a link is audited');

-- 2. A client reads drive_url on its own project only.
select pg_temp.act_as('client');
set local role authenticated;
select is((select drive_url from public.projects where id=pg_temp.k('project')),'https://drive.google.com/drive/folders/2','The client reads the link on its own project');
select is((select count(*)::int from public.projects where id=pg_temp.k('other-project')),0,'The client cannot see a project of another client');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'https://drive.google.com/drive/folders/3')$$,
  '42501',null,'The client still cannot write the link');
reset role;

select * from finish();
rollback;
