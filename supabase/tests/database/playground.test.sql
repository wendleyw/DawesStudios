begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
-- Match the Storage API's transaction flag while checking its actual DELETE RLS policy.
set local storage.allow_delete_query='true';
select no_plan();

-- The transaction owns all test notes, metadata and membership changes; the canonical fixture
-- survives the entire suite. Resolve assignments rather than coupling project scope to a title.
create temporary table playground_test_context(key text primary key,value uuid);
grant all on playground_test_context to authenticated;
insert into playground_test_context values
  ('client',md5('dawes:client-org-1')::uuid),
  ('other-client',md5('dawes:client-org-2')::uuid),
  ('note',md5('playground-test-note')::uuid),
  ('file',md5('playground-test-file')::uuid),
  ('other-file',md5('playground-test-other-file')::uuid),
  ('legacy-client',md5('playground-test-legacy-client')::uuid),
  ('legacy-board',md5('playground-test-legacy-board')::uuid),
  ('legacy-file',md5('playground-test-legacy-file')::uuid),
  ('designer',md5('dawes:designer-1')::uuid);
insert into playground_test_context
  select 'project',p.id from public.projects p where p.client_id=md5('dawes:client-org-1')::uuid limit 1;
insert into playground_test_context
  select 'second-project',p.id from public.projects p where p.client_id=md5('dawes:client-org-1')::uuid
    and p.id<>(select value from playground_test_context where key='project') limit 1;
insert into playground_test_context
  select 'assigned-project',p.id from public.projects p join public.project_assignments a on a.project_id=p.id
  where a.designer_id=md5('dawes:designer-1')::uuid limit 1;
insert into playground_test_context
  select 'assigned-client',client_id from public.projects where id=(select value from playground_test_context where key='assigned-project');
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from playground_test_context where key=p_key
$$;
create function pg_temp.note(p_id uuid,p_body text default 'A private brainstorm') returns jsonb language sql as $$
  select jsonb_build_object('id',p_id,'kind','note','title','Test note','body',p_body,
    'asset_path',null,'mime_type',null,'x',10,'y',20,'width',280,'height',180)
$$;
create function pg_temp.asset_path(p_key text) returns text language sql as $$
  select pg_temp.context('client-board')::text||'/'||pg_temp.context(p_key)::text||'/document.pdf'
$$;
create function pg_temp.file_item(p_id uuid,p_path text) returns jsonb language sql as $$
  select pg_temp.note(p_id)||jsonb_build_object('kind','file','asset_path',p_path,'mime_type','application/pdf')
$$;
create function pg_temp.legacy_path() returns text language sql as $$
  select pg_temp.context('legacy-board')::text||'/'||pg_temp.context('legacy-file')::text||'/legacy.pdf'
$$;

-- Recreate a pre-migration row only inside this rollback-contained transaction. The table lock
-- keeps the temporarily absent CHECK invisible to concurrent writes; restore it before testing.
alter table public.playground_boards drop constraint playground_requires_project;
insert into public.clients(id,name,slug) values(pg_temp.context('legacy-client'),'Playground legacy SQL fixture','playground-legacy-sql-fixture');
insert into public.client_memberships(client_id,user_id) values(pg_temp.context('legacy-client'),md5('dawes:client-1')::uuid);
insert into public.playground_boards(id,client_id,role)
  values(pg_temp.context('legacy-board'),pg_temp.context('legacy-client'),'client');
alter table public.playground_boards add constraint playground_requires_project check(project_id is not null) not valid;
insert into public.playground_items(id,board_id,kind,title,body,asset_path,mime_type,x,y,width,height)
  values(pg_temp.context('legacy-file'),pg_temp.context('legacy-board'),'file','Legacy document','Preserved legacy body',
    pg_temp.legacy_path(),'application/pdf',10,20,280,180);
insert into storage.objects(bucket_id,name,owner_id,metadata)
  values('playground-assets',pg_temp.legacy_path(),md5('dawes:client-1')::uuid::text,'{"mimetype":"application/pdf","size":120}');
select throws_ok($$insert into public.playground_boards(client_id,role) values(pg_temp.context('legacy-client'),'agency')$$,
  '23514',null,'The project requirement also rejects privileged direct workspace-only inserts');

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
insert into playground_test_context values('agency-board',public.get_playground_board(pg_temp.context('client'),pg_temp.context('project')));
select is(public.get_playground_board(pg_temp.context('client'),pg_temp.context('project')),pg_temp.context('agency-board'),
  'Resolving a scope twice returns one persistent role board');
select lives_ok($$select public.save_playground_item(pg_temp.context('agency-board'),pg_temp.note(md5('playground-agency-note')::uuid),null)$$,
  'Agency can persist its own project brainstorm');
select throws_ok($$select public.get_playground_board(pg_temp.context('client'))$$,
  '42501','A project is required for Playground','Agency cannot omit the project scope');
select throws_ok($$select public.get_playground_board(pg_temp.context('other-client'),pg_temp.context('project'))$$,
  '42501','The project is unavailable in this workspace','A project cannot be attached to a different client scope');

select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
insert into playground_test_context values('client-board',public.get_playground_board(pg_temp.context('client'),pg_temp.context('project')));
insert into playground_test_context values('project-board',public.get_playground_board(pg_temp.context('client'),pg_temp.context('second-project')));
select isnt(pg_temp.context('client-board'),pg_temp.context('agency-board'),'Client and agency receive separate boards for the same project');
select isnt(pg_temp.context('client-board'),pg_temp.context('project-board'),'Two projects in the same client keep separate boards');
select throws_ok($$select public.get_playground_board(pg_temp.context('client'),null)$$,
  '42501','A project is required for Playground','Explicit null cannot create or resolve a workspace-only board');
select throws_ok($$select public.get_playground_board(pg_temp.context('legacy-client'))$$,
  '42501','A project is required for Playground','Existing workspace-only boards are not returned by the resolver');
select is((select count(*)::integer from public.playground_boards where id=pg_temp.context('legacy-board')),0,
  'A known own-role legacy board is invisible through direct SELECT');
select is((select count(*)::integer from public.playground_items where id=pg_temp.context('legacy-file')),0,
  'A known legacy item is invisible through direct SELECT');
select throws_ok($$select public.save_playground_item(pg_temp.context('legacy-board'),pg_temp.note(md5('legacy-new-note')::uuid),null)$$,
  '42501','Playground access required','Legacy boards refuse new notes through a known board ID');
select throws_ok($$select public.save_playground_item(pg_temp.context('legacy-board'),pg_temp.file_item(pg_temp.context('legacy-file'),pg_temp.legacy_path()),1)$$,
  '42501','Playground access required','Legacy item updates are refused before reading the payload');
select throws_ok($$select public.delete_playground_item(pg_temp.context('legacy-board'),pg_temp.context('legacy-file'),1,pg_temp.legacy_path())$$,
  '42501','Playground access required','Known legacy items cannot be removed');
select throws_ok($$select public.get_playground_cleanup(pg_temp.context('legacy-board'))$$,
  '42501','Playground access required','Legacy files never enter cleanup discovery');
select is(private.playground_asset_read(pg_temp.legacy_path(),auth.uid()::text),false,
  'Even the original uploader cannot read a legacy object');
select is(private.playground_asset_insert(pg_temp.legacy_path(),auth.uid()::text),false,
  'Legacy Storage prefixes cannot accept uploads');
select is(private.playground_asset_delete(pg_temp.legacy_path(),auth.uid()::text),false,
  'Legacy Storage objects cannot be deleted by their original uploader');
select is((select count(*)::integer from storage.objects where bucket_id='playground-assets' and name=pg_temp.legacy_path()),0,
  'Storage listing hides legacy metadata');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('playground-assets',
  pg_temp.context('legacy-board')::text||'/'||md5('legacy-new-upload')::uuid::text||'/new.pdf',auth.uid()::text)$$,
  '42501',null,'Storage INSERT policy refuses a fresh path inside a legacy board');
with removed as(delete from storage.objects where bucket_id='playground-assets' and name=pg_temp.legacy_path() returning id)
select is((select count(*)::integer from removed),0,'Storage DELETE policy preserves legacy metadata');
select is((select count(*)::integer from public.playground_boards where id=pg_temp.context('agency-board')),0,
  'Clients cannot select an agency board directly');
select is((select count(*)::integer from public.playground_items where board_id=pg_temp.context('agency-board')),0,
  'Clients receive no agency brainstorm item payloads');
select throws_ok($$select public.save_playground_item(pg_temp.context('agency-board'),pg_temp.note(pg_temp.context('note')),null)$$,
  '42501','Playground access required','Clients cannot write into a known agency board ID');
select throws_ok($$select public.get_playground_board(pg_temp.context('other-client'))$$,
  '42501','Playground access required','Cross-tenant board creation is refused');
select throws_ok($$insert into public.playground_boards(client_id,role) values(pg_temp.context('client'),'agency')$$,
  '42501',null,'Direct table writes cannot choose another role');
select throws_ok($$insert into public.playground_items(id,board_id,kind,title,body,x,y,width,height)
  values(pg_temp.context('note'),pg_temp.context('client-board'),'note','Bypass','Bypass',0,0,200,200)$$,
  '42501',null,'Direct item writes cannot bypass revision and file validation');

select is((public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note')),null)->>'revision')::integer,1,
  'New notes start at revision one');
select is((select count(*)::integer from public.playground_items where board_id=pg_temp.context('project-board') and id=pg_temp.context('note')),0,
  'A saved note never appears on the same role second project');
select throws_ok($$select public.save_playground_item(pg_temp.context('project-board'),pg_temp.note(pg_temp.context('note')),1)$$,
  '42501','This Playground item is unavailable','A known item cannot be reassigned to another project');
select is((public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note')),null)->>'revision')::integer,1,
  'Identical insert retry returns the saved note without duplicating it');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note'),'Different insert'),null)$$,
  'PT409',null,'A reused item ID with different content conflicts');
select is((public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note'),'Changed'),1)->>'revision')::integer,2,
  'A matching revision updates the note once');
select is((public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note'),'Changed'),1)->>'revision')::integer,2,
  'A lost update response can be retried without a second revision');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note'),'Stale'),1)$$,
  'PT409',null,'A stale edit cannot overwrite the current note');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(md5('oversized-note')::uuid,repeat('x',20001)),null)$$,
  '22023',null,'Oversized note bodies are refused by the backend');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(md5('small-note')::uuid)||'{"width":1}'::jsonb,null)$$,
  '22023',null,'Invalid canvas geometry is refused');
select throws_ok($$select public.delete_playground_item(pg_temp.context('client-board'),pg_temp.context('note'),1,null)$$,
  'PT409',null,'Stale deletion cannot remove a newer edit');
select lives_ok($$select public.delete_playground_item(pg_temp.context('client-board'),pg_temp.context('note'),2,null)$$,
  'Current revision can be deleted');
select lives_ok($$select public.delete_playground_item(pg_temp.context('client-board'),pg_temp.context('note'),2,null)$$,
  'Deletion can be retried after the item disappears');
select is((select count(*)::integer from public.playground_items where id=pg_temp.context('note')),0,
  'Deleted notes do not appear in canvas reads');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.note(pg_temp.context('note')),null)$$,
  '42501',null,'A late insert retry cannot resurrect a deleted item');

-- Exercise Storage policies on metadata rows, without pretending this proves HTTP byte upload.
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata)
  values('playground-assets',pg_temp.asset_path('file'),auth.uid()::text,'{"mimetype":"application/pdf","size":120}')$$,
  'A client can stage a private document in its role board');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id)
  values('playground-assets',pg_temp.context('agency-board')::text||'/'||pg_temp.context('file')::text||'/other.pdf',auth.uid()::text)$$,
  '42501',null,'Private Storage refuses a different role board');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.file_item(pg_temp.context('other-file'),pg_temp.asset_path('file')),null)$$,
  '42501',null,'A file cannot be attached to a different item ID');
select lives_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.file_item(pg_temp.context('file'),pg_temp.asset_path('file')),null)$$,
  'A staged file owned by the caller attaches to its exact board and item');
select is(private.playground_asset_delete(pg_temp.asset_path('file'),auth.uid()::text),false,
  'Live attached files cannot be discarded directly');
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.file_item(pg_temp.context('file'),pg_temp.asset_path('other-file')),1)$$,
  '22023',null,'An update cannot silently swap an attachment');
select is(public.delete_playground_item(pg_temp.context('client-board'),pg_temp.context('file'),1,pg_temp.asset_path('file')),
  pg_temp.asset_path('file'),'Deletion returns the server-validated cleanup path');
select is(private.playground_asset_delete(pg_temp.asset_path('file'),auth.uid()::text),true,
  'A deleted attachment allows Storage cleanup');
select is(public.delete_playground_item(pg_temp.context('client-board'),pg_temp.context('file'),1,pg_temp.asset_path('file')),
  pg_temp.asset_path('file'),'An interrupted file cleanup returns the same path on retry');
select is((select count(*)::integer from public.get_playground_cleanup(pg_temp.context('client-board')) where path=pg_temp.asset_path('file')),1,
  'Pending file cleanup remains discoverable after a fresh page load');
select throws_ok($$select public.get_playground_cleanup(pg_temp.context('agency-board'))$$,
  '42501','Playground access required','Cleanup discovery cannot reveal another role files');

reset role;
insert into playground_test_context values
  ('old-stage',md5('playground-test-old-stage')::uuid),
  ('recent-stage',md5('playground-test-recent-stage')::uuid),
  ('foreign-stage',md5('playground-test-foreign-stage')::uuid);
insert into storage.objects(bucket_id,name,owner_id,metadata,created_at) values
  ('playground-assets',pg_temp.asset_path('old-stage'),md5('dawes:client-1')::uuid::text,'{"mimetype":"application/pdf","size":120}',now()-interval '25 hours'),
  ('playground-assets',pg_temp.asset_path('recent-stage'),md5('dawes:client-1')::uuid::text,'{"mimetype":"application/pdf","size":120}',now()-interval '1 hour'),
  ('playground-assets',pg_temp.asset_path('foreign-stage'),md5('dawes:client-2')::uuid::text,'{"mimetype":"application/pdf","size":120}',now()-interval '25 hours');
set local role authenticated;
select is((select count(*)::integer from public.get_playground_cleanup(pg_temp.context('client-board')) where path=pg_temp.asset_path('old-stage')),1,
  'Own abandoned staged uploads become eligible after 24 hours');
select is((select count(*)::integer from public.get_playground_cleanup(pg_temp.context('client-board')) where path=pg_temp.asset_path('recent-stage')),0,
  'Recent staged files remain available for an in-progress draft');
select is((select count(*)::integer from public.get_playground_cleanup(pg_temp.context('client-board')) where path=pg_temp.asset_path('foreign-stage')),0,
  'Cleanup never claims a different uploader abandoned stage');
select lives_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.file_item(pg_temp.context('old-stage'),pg_temp.asset_path('old-stage')),null)$$,
  'A stale stage can still be saved before cleanup wins the item lock');
select is(private.playground_asset_delete(pg_temp.asset_path('old-stage'),auth.uid()::text),false,
  'A cleanup candidate saved in the meantime is protected at Storage deletion');
select is((select count(*)::integer from public.get_playground_cleanup(pg_temp.context('client-board')) where path=pg_temp.asset_path('old-stage')),0,
  'A committed item is never swept as an abandoned stage');

-- A second client contact shares the client role board, but cannot adopt someone else's staged
-- upload. Its relationship is test-only and rolled back at the end.
reset role;
insert into public.client_memberships(client_id,user_id) values(pg_temp.context('client'),md5('dawes:client-2')::uuid);
insert into storage.objects(bucket_id,name,owner_id,metadata)
  values('playground-assets',pg_temp.asset_path('other-file'),md5('dawes:client-1')::uuid::text,'{"mimetype":"application/pdf","size":120}');
select set_config('request.jwt.claim.sub',md5('dawes:client-2')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.save_playground_item(pg_temp.context('client-board'),pg_temp.file_item(pg_temp.context('other-file'),pg_temp.asset_path('other-file')),null)$$,
  '42501','Upload your file before saving this item','A same-role collaborator cannot attach another user staged file');
select is(private.playground_asset_read(pg_temp.asset_path('other-file'),md5('dawes:client-1')::uuid::text),false,
  'Unattached staged files are private to their uploader');

select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
insert into playground_test_context values('designer-board',public.get_playground_board(pg_temp.context('assigned-client'),pg_temp.context('assigned-project')));
select lives_ok($$select public.save_playground_item(pg_temp.context('designer-board'),pg_temp.note(md5('designer-playground-note')::uuid),null)$$,
  'An assigned designer has a persistent role-specific project board');
reset role;
delete from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid and project_id=pg_temp.context('assigned-project');
set local role authenticated;
select is((select count(*)::integer from public.playground_boards where id=pg_temp.context('designer-board')),0,
  'Revoking a project assignment closes its existing designer playground');
select throws_ok($$select public.save_playground_item(pg_temp.context('designer-board'),pg_temp.note(md5('after-revoke')::uuid),null)$$,
  '42501','Playground access required','Revoked designers cannot write through a saved board ID');

reset role;
update public.profiles set removed_at=now() where id=md5('dawes:client-1')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::integer from public.playground_boards),0,'Removed members cannot read their previous role boards');
select is(private.playground_asset_read(pg_temp.asset_path('file'),auth.uid()::text),false,
  'Removal also closes private file access for already-issued tokens');
select throws_ok($$select public.get_playground_board(pg_temp.context('client'))$$,
  '42501','Playground access required','Removed members cannot resolve or create a board');
reset role;
select is(has_function_privilege('anon','public.get_playground_board(uuid,uuid)','execute'),false,
  'Anonymous callers cannot execute Playground RPCs');
-- The local image's supautils role-hint crash is addressed by the orchestrator's runtime workaround;
-- exercise the real refused call as well as the independent ACL assertion above.
set local role anon;
select throws_ok($$select public.get_playground_board(md5('dawes:client-org-1')::uuid)$$,
  '42501',null,'Anonymous RPC calls fail at the execution boundary');
reset role;
select is((select body from public.playground_items where id=pg_temp.context('legacy-file')),'Preserved legacy body',
  'Denied legacy requests leave saved content intact');
select is((select count(*)::integer from storage.objects where bucket_id='playground-assets' and name=pg_temp.legacy_path()),1,
  'Denied legacy requests leave the stored object intact');
select is((select project_id from public.playground_boards where id=pg_temp.context('legacy-board')),null::uuid,
  'Legacy content is not silently assigned to a project');
select * from finish();
rollback;
