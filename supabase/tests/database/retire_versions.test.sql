begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Retire Versions, Phase 2 (202609270007_retire_versions_schema.sql): the legacy per-deliverable
-- Versions schema is gone, and every function the Miro workspace still relies on compiles and
-- behaves (post_comment, resolve_comment, review_publication, share_workflow_version,
-- send_board_round_for_request, set_version_miro_link, accept_briefing). Every fixture is created here and
-- rolled back, so nothing depends on the seed or the SABRE demonstration overlay.

-- 1. The dropped schema.
select hasnt_table('public','designs','designs is dropped');
select hasnt_table('public','published_designs','published_designs is dropped');
select hasnt_column('public','design_versions','deliverable_id','Rounds carry no deliverable');
select hasnt_column('public','published_versions','deliverable_id','Client versions carry no deliverable');
select hasnt_column('public','internal_comments','design_id','Internal comments carry no design');
select hasnt_column('public','client_comments','design_id','Client comments carry no design');
select ok(not exists(select 1 from information_schema.columns where table_schema='public'
  and table_name in ('internal_comments','client_comments') and column_name in ('pin_x','pin_y','pin_t')),
  'Neither comment table carries a pin');
select ok(not exists(select 1 from information_schema.columns where table_schema='private'
  and table_name='sanitized_assets' and column_name='source_design_id'),'Attestations carry no source design');
select col_not_null('public','design_versions','board_id','Every round has a board');
select ok(not exists(select 1 from pg_constraint where conname='design_versions_one_parent'),'The one-parent check is gone');
select ok(to_regprocedure('public.add_design(uuid,text,jsonb,text)') is null,'add_design is dropped');
select ok(to_regprocedure('public.create_design_version(uuid,text,uuid)') is null,'create_design_version is dropped');
select ok(to_regprocedure('public.submit_design_version(uuid)') is null,'submit_design_version is dropped');
select ok(to_regprocedure('public.publish_version(uuid,text,jsonb,uuid)') is null,'publish_version is dropped');
select ok(to_regprocedure('public.discard_prepared_assets(text[])') is null,'discard_prepared_assets is dropped');
select ok(to_regprocedure('public.register_sanitized_video(uuid,text,text,text,bigint,uuid,text)') is null,'register_sanitized_video is dropped');
select ok(to_regprocedure('public.find_sanitized_video_by_source(uuid,text)') is null,'find_sanitized_video_by_source is dropped');
select ok(to_regprocedure('public.list_stale_video_uploads()') is null,'list_stale_video_uploads is dropped');
select ok(to_regprocedure('private.guard_round_designs()') is null,'The round-designs guard is dropped');
select ok(to_regprocedure('public.post_comment(uuid,text,text,uuid,uuid,numeric,numeric,numeric,text)') is null,'The design-and-pin post_comment is dropped');
select ok(to_regprocedure('public.post_comment(uuid,text,text,uuid,text)') is not null,'post_comment keeps a design-free signature');
select ok(not has_function_privilege('anon','public.post_comment(uuid,text,text,uuid,text)','execute'),'The anon role cannot post a comment');
select ok(has_function_privilege('authenticated','public.post_comment(uuid,text,text,uuid,text)','execute'),'Signed-in users can call post_comment');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename in ('designs','published_designs')),'Realtime lists no dropped table');
select ok(not exists(select 1 from pg_policies where schemaname='storage' and policyname='published_storage_read'),'No browser policy reads published-assets');
select ok(exists(select 1 from pg_policies where schemaname='storage' and policyname='internal_storage_delete'),'Working files can still be deleted');
select ok(not exists(select 1 from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ '\m(designs|published_designs)\M'),'No policy reads a dropped table');
select ok(not exists(select 1 from private.sanitized_assets where bucket_id='published-assets'),'No publication attestation is left');
-- Task 2 (202609270008_drop_published_assets_bucket.sql): the cleanup script emptied the bucket
-- (`supabase/scripts/cleanup_versions_storage.py --apply`) and this migration dropped the bucket
-- itself and the private table that only existed to hand the script its inventory.
select hasnt_table('private','retired_version_objects','The retired-object inventory table is dropped');
select ok(not exists(select 1 from storage.buckets where id='published-assets'),'The published-assets bucket is dropped');
select ok(not exists(select 1 from storage.objects where bucket_id='published-assets'),'No published-assets object remains');
-- Privacy is unchanged: the comment read policies and the designer privacy trigger are still in place.
select ok(exists(select 1 from pg_policies where tablename='internal_comments' and policyname='internal_comments_read'
  and qual ~ 'can_read_internal_comment'),'Internal comments keep their per-board read policy');
select ok(exists(select 1 from pg_policies where tablename='client_comments' and policyname='client_comments_read'
  and qual ~ 'can_client_channel'),'Client comments keep their client-channel read policy');
select ok(exists(select 1 from pg_trigger where tgname='internal_comments_privacy'),'The designer privacy trigger is still in place');

-- 2. Fixture: an agency, a client member, two designers on one project, a funded client and a
-- confirmed briefing.
create temporary table rv(key text primary key, value uuid);
grant all on rv to authenticated, service_role;
insert into rv values
  ('agency',md5('rv:agency')::uuid),('client',md5('rv:client')::uuid),
  ('designer-a',md5('rv:designer-a')::uuid),('designer-b',md5('rv:designer-b')::uuid),
  ('client-org',md5('rv:client-org')::uuid),('project',md5('rv:project')::uuid),
  ('briefing',md5('rv:briefing')::uuid);
create function pg_temp.k(p text) returns uuid language sql as $$ select value from rv where key=p $$;
create function pg_temp.act_as(p text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true) $$;
create function pg_temp.remember(p text, v uuid) returns uuid language sql as $$
  insert into rv values(p,v) on conflict(key) do update set value=excluded.value returning value $$;
create function pg_temp.brief() returns jsonb language sql as $$
 select jsonb_build_object('title','Internal work','serviceId','social','overview','Prepare a direction',
 'goals','Explore','direction',jsonb_build_object('notes','Private instructions'),
 'deliverables',jsonb_build_array(jsonb_build_object('name','Concept','format','feed',
 'quantity',1,'scope','original','width',1080,'height',1350)),
 'dueDate','2026-10-01','references',jsonb_build_array())
$$;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.k('agency'),'rv-agency@fixture.local','{"display_name":"RV Agency"}'),
  (pg_temp.k('client'),'rv-client@fixture.local','{"display_name":"RV Client"}'),
  (pg_temp.k('designer-a'),'rv-a@fixture.local','{"display_name":"RV Alpha"}'),
  (pg_temp.k('designer-b'),'rv-b@fixture.local','{"display_name":"RV Beta"}');
update public.profiles set role='agency' where id=pg_temp.k('agency');
update public.profiles set role='designer' where id in (pg_temp.k('designer-a'),pg_temp.k('designer-b'));
insert into public.clients(id,name,slug) values (pg_temp.k('client-org'),'RV Client','rv-client');
insert into public.client_memberships(client_id,user_id) values (pg_temp.k('client-org'),pg_temp.k('client'));
insert into public.credit_accounts(client_id) values (pg_temp.k('client-org'));
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.k('project'),pg_temp.k('client-org'),'RV project','ai','in_progress');
insert into public.project_assignments(project_id,designer_id) values
  (pg_temp.k('project'),pg_temp.k('designer-a')),(pg_temp.k('project'),pg_temp.k('designer-b'));
insert into public.briefings(id,client_id,title,service_type,status,overview,goals,direction,requested_deliverables,estimated_credits,confirmed_credits,budget_note,created_by)
values (pg_temp.k('briefing'),pg_temp.k('client-org'),'RV briefing','social','budget_confirmed','Retire versions fixture.','Prove acceptance.',
  '{"source":"brand_hub","questions":{"content":"I’ll provide the content"}}',
  '[{"name":"Launch post","format":"feed","width":1080,"height":1350,"quantity":1,"scope":"original"}]',10,10,'Fixture budget.',pg_temp.k('agency'));

-- 3. accept_briefing still creates one project and one debit.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.adjust_credits(pg_temp.k('client-org'),50,'Opening balance','rv:open')$$,'The agency funds the client');
select lives_ok($$select pg_temp.remember('accepted',public.accept_briefing(pg_temp.k('briefing')))$$,'accept_briefing creates a project');
select is(public.accept_briefing(pg_temp.k('briefing')),pg_temp.k('accepted'),'A repeated acceptance returns the same project');
reset role;
select is((select count(*)::int from public.credit_ledger where project_id=pg_temp.k('accepted') and kind='project_debit'),1,'Acceptance writes exactly one debit');
select is((select count(*)::int from public.deliverables where project_id=pg_temp.k('accepted')),1,'Acceptance still copies the requested deliverables');

-- 4. send_board_round and set_version_miro_link.
select pg_temp.act_as('agency');
set local role authenticated;
select pg_temp.remember('board-a',public.create_design_board(pg_temp.k('project'),'Alpha','https://miro.com/app/board/uXjVRvAlpha=/',pg_temp.k('designer-a')));
select pg_temp.remember('board-b',public.create_design_board(pg_temp.k('project'),'Beta','https://miro.com/app/board/uXjVRvBeta0=/',pg_temp.k('designer-b')));
select is(save_production_brief(pg_temp.k('board-a'),pg_temp.brief(),0,true,
 md5('rv:release-a')::uuid,1,1),1,'Agency releases the first request');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select lives_ok($$select pg_temp.remember('round-a',public.send_board_round_for_request(pg_temp.k('board-a'),
 (select id from board_work_requests where board_id=pg_temp.k('board-a') and current),2,
 'First pass',null,md5('rv:round-a')::uuid))$$,'A designer sends a round on their board');
select is(public.send_board_round_for_request(pg_temp.k('board-a'),
 (select id from board_work_requests where board_id=pg_temp.k('board-a') and current),2,
 'First pass',null,md5('rv:round-a')::uuid),pg_temp.k('round-a'),'A round retry returns the same round');
select throws_ok($$select public.send_board_round_for_request(pg_temp.k('board-b'),gen_random_uuid(),1,'Not mine',null,
 md5('rv:wrong-board')::uuid)$$,'42501',null,'A designer cannot send a round on another designer''s board');
select lives_ok($$select public.set_version_miro_link(pg_temp.k('round-a'),'https://miro.com/app/board/uXjVRvAlpha=/?moveToWidget=42')$$,'The board''s designer relinks its round');
reset role;
select is((select widget_id from public.design_version_miro_links where version_id=pg_temp.k('round-a')),'42','The round link is stored');
select is((select board_id from public.design_versions where id=pg_temp.k('round-a')),pg_temp.k('board-a'),'The round belongs to its board');
select pg_temp.act_as('designer-b');
set local role authenticated;
select throws_ok($$select public.set_version_miro_link(pg_temp.k('round-a'),'https://miro.com/app/board/uXjVRvAlpha=/')$$,'42501',null,'Another designer cannot relink the round');
select is((select count(*)::int from public.design_versions where id=pg_temp.k('round-a')),0,'Another designer cannot read the round');
reset role;

-- 5. post_comment and resolve_comment on both channels, with designer-to-designer privacy.
select pg_temp.act_as('designer-a');
set local role authenticated;
select lives_ok($$select pg_temp.remember('note-a',public.post_comment(pg_temp.k('project'),'internal','Round note',pg_temp.k('round-a'),'rv:note-a'))$$,'A designer comments on their round');
select is(public.post_comment(pg_temp.k('project'),'internal','Round note',pg_temp.k('round-a'),'rv:note-a'),pg_temp.k('note-a'),'A comment retry returns the same comment');
select throws_ok($$select public.post_comment(pg_temp.k('project'),'internal','Edited note',pg_temp.k('round-a'),'rv:note-a')$$,'P0001','Idempotency key conflicts with a different comment','A reused key for a different comment is refused');
select throws_ok($$select public.post_comment(pg_temp.k('project'),'client','Not my channel')$$,'42501','Client channel access required','A designer cannot post to the client');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select throws_ok($$select public.post_comment(pg_temp.k('project'),'internal','Sneaky',pg_temp.k('round-a'))$$,'42501',null,'Another designer cannot comment on the round');
select is((select count(*)::int from public.internal_comments where id=pg_temp.k('note-a')),0,'Another designer cannot read the round note');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.resolve_comment(pg_temp.k('note-a'),'internal',true)$$,'The agency resolves an internal comment');
reset role;
select is((select resolved from public.internal_comments where id=pg_temp.k('note-a')),true,'The internal comment is resolved');
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.post_comment(pg_temp.k('project'),'internal','Peek')$$,'42501','Internal channel access required','The client cannot post internally');
select is((select count(*)::int from public.internal_comments where project_id=pg_temp.k('project')),0,'The client reads no internal comment');
select lives_ok($$select pg_temp.remember('client-note',public.post_comment(pg_temp.k('project'),'client','Client note'))$$,'The client posts in its channel');
select lives_ok($$select public.resolve_comment(pg_temp.k('client-note'),'client',true)$$,'The client resolves its own channel comment');
reset role;
select is((select author_label from public.client_comments where id=pg_temp.k('client-note')),'RV Client','The client comment keeps its label');

-- 6. share_miro_version and review_publication.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('v1',public.share_workflow_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVRvClient=/','First',
 array[pg_temp.k('round-a')],null,null,false,md5('rv:share-1')::uuid))$$,'The agency shares a round');
select lives_ok($$select pg_temp.remember('v2',public.share_workflow_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVRvClient=/?moveToWidget=2','Second',
 '{}'::uuid[],pg_temp.k('v1'),1,true,md5('rv:share-2')::uuid))$$,'The agency shares a second version');
reset role;
select is((select array_agg(version_number order by version_number) from public.published_versions where project_id=pg_temp.k('project')),array[1,2],'Client versions are numbered per project');
select throws_ok($$insert into public.published_versions(project_id,version_number) values(pg_temp.k('project'),2)$$,'23505',null,'A client version number is unique per project');
select pg_temp.act_as('client');
set local role authenticated;
select lives_ok($$select public.post_comment(pg_temp.k('project'),'client','On V1',pg_temp.k('v1'))$$,'The client comments on a client version');
select throws_ok($$select public.review_publication(pg_temp.k('v1'),'approved','')$$,'PT409','Review the latest published version','An older client version cannot be reviewed');
select throws_ok($$select public.review_publication(pg_temp.k('v2'),'changes_requested','')$$,'22023','Choose a decision and describe requested changes','Requested changes need a description');
select lives_ok($$select public.review_publication(pg_temp.k('v2'),'changes_requested','Brighter')$$,'The client requests changes on the latest version');
select lives_ok($$select public.review_publication(pg_temp.k('v2'),'changes_requested','Brighter')$$,'The same decision retried is accepted');
reset role;
select is((select status::text from public.projects where id=pg_temp.k('project')),'changes_requested','A client decision sets the project status');
select pg_temp.act_as('designer-a');
set local role authenticated;
select throws_ok($$select public.review_publication(pg_temp.k('v2'),'approved','')$$,'42501',null,'A designer cannot review a client version');
select is((select count(*)::int from public.published_versions),0,'A designer reads no client version');
reset role;

select * from finish();
rollback;
