begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Self-contained fixture: two agency members, a client member, an assigned designer, one project
-- and a second project of the same client. Nothing depends on the seed or the SABRE overlay.
create temporary table pc(key text primary key, value uuid);
grant all on pc to authenticated, service_role;
insert into pc values
  ('agency',md5('pc:agency')::uuid),('agency-2',md5('pc:agency-2')::uuid),
  ('client',md5('pc:client')::uuid),('designer',md5('pc:designer')::uuid),
  ('client-org',md5('pc:client-org')::uuid),('project',md5('pc:project')::uuid),
  ('other-project',md5('pc:other-project')::uuid);
create function pg_temp.k(p text) returns uuid language sql as $$ select value from pc where key=p $$;
create function pg_temp.act_as(p text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true) $$;
-- An opaque cover path under a project: `<project>/<uuid>.png`.
create function pg_temp.path(p_project text, p_name text) returns text language sql as $$
  select pg_temp.k(p_project)::text||'/'||md5('pc:object:'||p_name)::uuid::text||'.png' $$;
-- A stored object plus its attestation, as the trusted media worker would leave them.
create function pg_temp.attest(p_project text, p_name text, p_by text, p_bucket text default 'project-covers') returns text language sql as $$
  insert into storage.objects(bucket_id,name,owner_id,metadata)
    values('project-covers',pg_temp.path(p_project,p_name),null,'{"size":100,"mimetype":"image/png"}');
  insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by)
    values(p_bucket,pg_temp.path(p_project,p_name),pg_temp.k(p_project),repeat('a',64),'image/png',100,pg_temp.k(p_by));
  select pg_temp.path(p_project,p_name) $$;
grant execute on function pg_temp.k(text),pg_temp.path(text,text) to authenticated, service_role;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.k('agency'),'pc-agency@fixture.local','{"display_name":"PC Agency"}'),
  (pg_temp.k('agency-2'),'pc-agency-2@fixture.local','{"display_name":"PC Agency Two"}'),
  (pg_temp.k('client'),'pc-client@fixture.local','{"display_name":"PC Client"}'),
  (pg_temp.k('designer'),'pc-designer@fixture.local','{"display_name":"PC Designer"}');
update public.profiles set role='agency' where id in (pg_temp.k('agency'),pg_temp.k('agency-2'));
update public.profiles set role='designer' where id=pg_temp.k('designer');
insert into public.clients(id,name,slug) values (pg_temp.k('client-org'),'PC Client','pc-client');
insert into public.client_memberships(client_id,user_id) values (pg_temp.k('client-org'),pg_temp.k('client'));
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.k('project'),pg_temp.k('client-org'),'PC project','ai','in_progress'),
  (pg_temp.k('other-project'),pg_temp.k('client-org'),'PC other project','ai','in_progress');
insert into public.project_assignments(project_id,designer_id) values (pg_temp.k('project'),pg_temp.k('designer'));

select has_table('public','project_covers','Project covers have their own table');

select pg_temp.attest('project','first','agency');
select pg_temp.attest('project','second','agency');
select pg_temp.attest('project','unattested-by-me','agency-2');
select pg_temp.attest('other-project','foreign','agency');
insert into storage.objects(bucket_id,name,owner_id,metadata)
  values('project-covers',pg_temp.path('project','bare'),null,'{"size":100,"mimetype":"image/png"}');

-- 3. Designers and clients cannot call any cover RPC.
select pg_temp.act_as('designer');
set local role authenticated;
select throws_ok($$select public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','first'))$$,'42501',null,'A designer cannot set a cover');
select throws_ok($$select public.set_project_cover_visibility(pg_temp.k('project'),true)$$,'42501',null,'A designer cannot change cover visibility');
select throws_ok($$select public.clear_project_cover(pg_temp.k('project'))$$,'42501',null,'A designer cannot clear a cover');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','first'))$$,'42501',null,'A client cannot set a cover');
select throws_ok($$select public.set_project_cover_visibility(pg_temp.k('project'),true)$$,'42501',null,'A client cannot change cover visibility');
select throws_ok($$select public.clear_project_cover(pg_temp.k('project'))$$,'42501',null,'A client cannot clear a cover');
reset role;

-- 4. Only a path this agency member prepared for this project is accepted.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','bare'))$$,'22023','Prepare the cover through the media service','An unattested path is refused');
select throws_ok($$select public.set_project_cover(pg_temp.k('project'),pg_temp.path('other-project','foreign'))$$,'22023',null,'A path attested for another project is refused');
select throws_ok($$select public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','unattested-by-me'))$$,'22023',null,'A path prepared by another user is refused');
select throws_ok($$select public.set_project_cover(md5('pc:missing')::uuid,pg_temp.path('project','first'))$$,'P0002',null,'A missing project is refused');
select throws_ok($$select public.set_project_cover_visibility(pg_temp.k('project'),true)$$,'P0002',null,'Changing visibility without a cover is refused');
select is(public.clear_project_cover(pg_temp.k('project')),null,'Clearing without a cover returns null');

-- 1 and 2. Set returns null the first time; a replacement returns the previous path.
select is(public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','first')),null,'The first cover returns no previous path');
select is(public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','first')),null,'Setting the same path again returns null');
select is(public.set_project_cover(pg_temp.k('project'),pg_temp.path('project','second')),pg_temp.path('project','first'),'Replacing a cover returns the previous path');
select is((select storage_path from public.project_covers where project_id=pg_temp.k('project')),pg_temp.path('project','second'),'The row holds the new path');
select is((select client_visible from public.project_covers where project_id=pg_temp.k('project')),false,'A cover is hidden from the client by default');
reset role;
select ok(exists(select 1 from private.audit_events where event='project.cover_set' and entity_id=pg_temp.k('project')),'Setting a cover is audited');
select is((select updated_by from public.project_covers where project_id=pg_temp.k('project')),pg_temp.k('agency'),'The row records who set it');

-- 5, 6 and 7. The client reads nothing while hidden; the designer always reads.
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.project_covers),0,'The client reads no hidden cover');
select is((select count(*)::int from storage.objects where bucket_id='project-covers' and name=pg_temp.path('project','second')),0,'The client cannot read a hidden cover object');
reset role;
select pg_temp.act_as('designer');
set local role authenticated;
select is((select storage_path from public.project_covers where project_id=pg_temp.k('project')),pg_temp.path('project','second'),'The assigned designer reads a hidden cover');
select is((select count(*)::int from storage.objects where bucket_id='project-covers' and name=pg_temp.path('project','second')),1,'The designer reads the hidden cover object');
select is((select count(*)::int from storage.objects where bucket_id='project-covers' and name=pg_temp.path('project','first')),0,'The designer cannot read an object that is not a cover');
select throws_ok($$select updated_by from public.project_covers$$,'42501',null,'The designer cannot read who set the cover');
reset role;

select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_project_cover_visibility(pg_temp.k('project'),true)$$,'The agency shows the cover to the client');
reset role;
select ok(exists(select 1 from private.audit_events where event='project.cover_visibility_set' and entity_id=pg_temp.k('project')),'Changing visibility is audited');

select pg_temp.act_as('client');
set local role authenticated;
select is((select storage_path from public.project_covers where project_id=pg_temp.k('project')),pg_temp.path('project','second'),'The client reads a visible cover');
select is((select count(*)::int from storage.objects where bucket_id='project-covers' and name=pg_temp.path('project','second')),1,'The client reads the visible cover object');
select is((select count(*)::int from storage.objects where bucket_id='project-covers' and name=pg_temp.path('project','first')),0,'The client cannot read a replaced cover object');
select throws_ok($$select updated_by from public.project_covers$$,'42501',null,'The client cannot read who set the cover');
select throws_ok($$update public.project_covers set client_visible=false$$,'42501',null,'The client cannot write the table directly');
reset role;

select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$delete from public.project_covers$$,'42501',null,'The agency cannot write the table directly either');
select lives_ok($$select public.set_project_cover_visibility(pg_temp.k('project'),false)$$,'The agency hides the cover again');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.project_covers),0,'A re-hidden cover is unreadable to the client');
select is((select count(*)::int from storage.objects where bucket_id='project-covers' and name=pg_temp.path('project','second')),0,'A re-hidden cover object is unreadable to the client');
reset role;

-- Cleanup must never take a live cover.
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select throws_ok($$select public.discard_sanitized_asset('project-covers',pg_temp.path('project','second'))$$,'P0001','Referenced assets cannot be discarded','A live cover cannot be discarded');
reset role;
update private.sanitized_assets set created_at=now()-interval '25 hours' where bucket_id='project-covers';
set local role service_role;
select ok(not exists(select 1 from public.list_stale_sanitized_assets() s where s.storage_path=pg_temp.path('project','second')),'The stale sweep skips a live cover');
select ok(exists(select 1 from public.list_stale_sanitized_assets() s where s.storage_path=pg_temp.path('project','first')),'The stale sweep lists a replaced cover');
reset role;
select set_config('request.jwt.claim.role','authenticated',true);

-- 8. Clearing returns the path and removes the row.
select pg_temp.act_as('agency');
set local role authenticated;
select is(public.clear_project_cover(pg_temp.k('project')),pg_temp.path('project','second'),'Clearing returns the removed path');
select is((select count(*)::int from public.project_covers where project_id=pg_temp.k('project')),0,'Clearing removes the row');
reset role;
select ok(exists(select 1 from private.audit_events where event='project.cover_cleared' and entity_id=pg_temp.k('project')),'Clearing is audited');

-- 9. The trusted media service may attest a PNG cover and nothing else.
insert into storage.objects(bucket_id,name,owner_id,metadata)
  values('project-covers',pg_temp.path('project','registered'),null,'{"size":100,"mimetype":"image/png"}');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select lives_ok($$select public.register_sanitized_asset(pg_temp.k('project'),'project-covers',pg_temp.path('project','registered'),repeat('b',64),'image/png',100,pg_temp.k('agency'))$$,
  'The media service attests a PNG cover');
select throws_ok($$select public.register_sanitized_asset(pg_temp.k('project'),'project-covers',pg_temp.path('project','registered-jpeg'),repeat('c',64),'image/jpeg',100,pg_temp.k('agency'))$$,
  '22023','Unsupported sanitized cover','A JPEG cover is refused');
reset role;
select ok(exists(select 1 from private.sanitized_assets where bucket_id='project-covers' and storage_path=pg_temp.path('project','registered') and prepared_by=pg_temp.k('agency')),'The cover attestation is stored');

select * from finish();
rollback;
