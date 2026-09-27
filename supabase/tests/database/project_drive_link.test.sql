begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Self-contained fixture: an agency member, a client member, an assigned designer, an unassigned
-- designer, the client's project and a second client's project (to prove a client reads its own
-- project only). Nothing depends on the seed or the SABRE overlay.
create temporary table pdl(key text primary key, value uuid);
grant all on pdl to authenticated, service_role;
insert into pdl values
  ('agency',md5('pdl:agency')::uuid),('client',md5('pdl:client')::uuid),
  ('designer',md5('pdl:designer')::uuid),('other-designer',md5('pdl:other-designer')::uuid),
  ('client-org',md5('pdl:client-org')::uuid),('other-client-org',md5('pdl:other-client-org')::uuid),
  ('project',md5('pdl:project')::uuid),('other-project',md5('pdl:other-project')::uuid);
create function pg_temp.k(p text) returns uuid language sql as $$ select value from pdl where key=p $$;
create function pg_temp.act_as(p text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true) $$;
grant execute on function pg_temp.k(text) to authenticated, service_role;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.k('agency'),'pdl-agency@fixture.local','{"display_name":"PDL Agency"}'),
  (pg_temp.k('client'),'pdl-client@fixture.local','{"display_name":"PDL Client"}'),
  (pg_temp.k('designer'),'pdl-designer@fixture.local','{"display_name":"PDL Designer"}'),
  (pg_temp.k('other-designer'),'pdl-other-designer@fixture.local','{"display_name":"PDL Other Designer"}');
update public.profiles set role='agency' where id=pg_temp.k('agency');
update public.profiles set role='designer' where id in (pg_temp.k('designer'),pg_temp.k('other-designer'));
insert into public.clients(id,name,slug) values
  (pg_temp.k('client-org'),'PDL Client','pdl-client'),
  (pg_temp.k('other-client-org'),'PDL Other Client','pdl-other-client');
insert into public.client_memberships(client_id,user_id) values (pg_temp.k('client-org'),pg_temp.k('client'));
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.k('project'),pg_temp.k('client-org'),'PDL project','ai','in_progress'),
  (pg_temp.k('other-project'),pg_temp.k('other-client-org'),'PDL other project','ai','in_progress');
insert into public.project_assignments(project_id,designer_id) values (pg_temp.k('project'),pg_temp.k('designer'));

select has_table('public','project_drive_links','project_drive_links exists');
select has_column('public','project_drive_links','channel','project_drive_links has a channel column');

-- A missing project is refused before role, same errcode family as the cover RPCs.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(md5('pdl:missing')::uuid,'client','https://drive.google.com/drive/folders/1')$$,
  'P0002',null,'A missing project is refused');

-- An unknown channel is refused.
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'legal','https://drive.google.com/drive/folders/1')$$,
  '22023',null,'An unknown channel is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),null,'')$$,
  '22023','Unknown channel','A null channel cannot silently clear nothing');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),null,'https://drive.google.com/drive/folders/1')$$,
  '22023','Unknown channel','A null channel is rejected before an insert');

-- A designer and a client cannot call the RPC at all, for either channel.
reset role;
select pg_temp.act_as('designer');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'internal','https://drive.google.com/drive/folders/1')$$,
  '42501',null,'A designer cannot set the internal Drive link');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com/drive/folders/1')$$,
  '42501',null,'A designer cannot set the client Drive link');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com/drive/folders/1')$$,
  '42501',null,'A client cannot set a Drive link');
reset role;

-- Direct table writes are refused; only the RPC writes.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$insert into public.project_drive_links(project_id,channel,url) values (pg_temp.k('project'),'client','https://drive.google.com/drive/folders/1')$$,
  '42501',null,'A direct insert is refused, even for the agency');
select throws_ok($$update public.project_drive_links set url='https://drive.google.com/drive/folders/9' where project_id=pg_temp.k('project')$$,
  '42501',null,'A direct update is refused');
reset role;

-- Invalid URLs are refused: wrong scheme, a lookalike host, and a javascript: URL.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','http://drive.google.com/drive/folders/1')$$,
  '22023',null,'A plain http:// link is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com.evil.com/x')$$,
  '22023',null,'A lookalike host is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','javascript:alert(1)')$$,
  '22023',null,'A javascript: URL is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com@evil.com/x')$$,
  '22023',null,'A userinfo lookalike host is refused');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com./x')$$,
  '22023',null,'A trailing-dot lookalike host is refused');
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('project')),0,'No invalid attempt stored a link');

-- 1. The agency sets the client link, then clears it with an empty string. Independently of the
-- internal link on the same project.
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','  https://drive.google.com/drive/folders/1  ')$$,
  'The agency sets the client Drive link');
select is((select url from public.project_drive_links where project_id=pg_temp.k('project') and channel='client'),'https://drive.google.com/drive/folders/1','The stored link is trimmed');
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'internal','https://drive.google.com/drive/folders/internal-1')$$,
  'The agency sets the internal Drive link');
select is((select url from public.project_drive_links where project_id=pg_temp.k('project') and channel='internal'),'https://drive.google.com/drive/folders/internal-1','The internal link is independent of the client link');
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','')$$,'The agency clears the client link with an empty string');
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('project') and channel='client'),0,'Clearing removes the row, never stores blank');
select is((select url from public.project_drive_links where project_id=pg_temp.k('project') and channel='internal'),'https://drive.google.com/drive/folders/internal-1','Clearing the client link leaves the internal link untouched');
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com/drive/folders/2')$$,
  'The agency sets the client link again');
-- A whitespace-only value (tabs/newlines, not just spaces) clears the link, same as an empty string.
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client', e'\t\n \r')$$,
  'A whitespace-only value clears the link');
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('project') and channel='client'),0,'Whitespace-only clears, never stores blank');
-- A value with a trailing newline (e.g. pasted from some clients) is trimmed and stored, not refused.
select lives_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client', e'https://drive.google.com/drive/folders/3\n')$$,
  'A value with a trailing newline is accepted');
select is((select url from public.project_drive_links where project_id=pg_temp.k('project') and channel='client'),'https://drive.google.com/drive/folders/3','The trailing newline is trimmed before storing');
reset role;
select ok(exists(select 1 from private.audit_events where event='project.drive_link_set' and entity_id=pg_temp.k('project') and details->>'channel'='client'),'Setting the client link is audited with its channel');
select ok(exists(select 1 from private.audit_events where event='project.drive_link_set' and entity_id=pg_temp.k('project') and details->>'channel'='internal'),'Setting the internal link is audited with its channel');
select ok(exists(select 1 from private.audit_events where event='project.drive_link_cleared' and entity_id=pg_temp.k('project') and details->>'channel'='client'),'Clearing the client link is audited with its channel');

-- 2. Channel isolation: the assigned designer reads the internal link only, never the client link.
select pg_temp.act_as('designer');
set local role authenticated;
select is((select url from public.project_drive_links where project_id=pg_temp.k('project') and channel='internal'),'https://drive.google.com/drive/folders/internal-1','The assigned designer reads the internal link');
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('project') and channel='client'),0,'The assigned designer never reads the client link');
reset role;

-- 3. The client member reads the client link only, never the internal link, and only on its own
-- project.
select pg_temp.act_as('client');
set local role authenticated;
select is((select url from public.project_drive_links where project_id=pg_temp.k('project') and channel='client'),'https://drive.google.com/drive/folders/3','The client reads the client link on its own project');
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('project') and channel='internal'),0,'The client never reads the internal link');
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('other-project')),0,'The client cannot see links on another client''s project');
select throws_ok($$select public.set_project_drive_link(pg_temp.k('project'),'client','https://drive.google.com/drive/folders/3')$$,
  '42501',null,'The client still cannot write the link');
reset role;

-- 4. An unassigned designer reads neither channel on a project it does not produce.
select pg_temp.act_as('other-designer');
set local role authenticated;
select is((select count(*)::int from public.project_drive_links where project_id=pg_temp.k('project')),0,'An unassigned designer reads no Drive link');

-- 5. `updated_by` is not readable through the API, the same column-privilege idiom as project_covers.
select throws_ok($$select updated_by from public.project_drive_links limit 1$$,'42501',null,'updated_by is not selectable');
reset role;

select * from finish();
rollback;
