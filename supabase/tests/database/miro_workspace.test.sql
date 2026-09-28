begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Independent Miro workspace fixture. Workflow transitions are tested in project_workflow.test.sql.
create temporary table mw(key text primary key,value uuid);
grant select,insert,update on mw to authenticated;
insert into mw select name,md5('mw-current:'||name)::uuid
from unnest(array['agency','client','designer-a','designer-b','outsider','client-org','project',
 'board-a','board-b','release-a','round-a','share-v1','comment']) name;
create function pg_temp.k(p text) returns uuid language sql as $$select value from mw where key=p$$;
create function pg_temp.act_as(p text) returns text language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true)$$;
create function pg_temp.brief() returns jsonb language sql as $$
 select jsonb_build_object('title','Internal concepts','serviceId','social',
 'overview','Explore visual directions','goals','Make a concept',
 'direction',jsonb_build_object('notes','Private direction'),
 'deliverables',jsonb_build_array(jsonb_build_object('name','Concept','format','feed',
 'quantity',1,'scope','original','width',1080,'height',1350)),
 'dueDate','2026-10-01','references',jsonb_build_array())
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.k(name),'mw-current-'||name||'@fixture.local',jsonb_build_object('display_name',name)
from unnest(array['agency','client','designer-a','designer-b','outsider']) name;
update profiles set role='agency' where id=pg_temp.k('agency');
update profiles set role='designer' where id in(pg_temp.k('designer-a'),pg_temp.k('designer-b'),pg_temp.k('outsider'));
insert into clients(id,name,slug) values(pg_temp.k('client-org'),'Miro workspace fixture','miro-workspace-current');
insert into client_memberships(client_id,user_id,notify_all)
values(pg_temp.k('client-org'),pg_temp.k('client'),true);
insert into projects(id,client_id,title,service_type,status,due_date)
values(pg_temp.k('project'),pg_temp.k('client-org'),'Miro project','social','in_progress','2026-10-10');
insert into project_assignments(project_id,designer_id)
values(pg_temp.k('project'),pg_temp.k('designer-a')),(pg_temp.k('project'),pg_temp.k('designer-b'));

select has_table('public','design_boards','Design boards have their own table');
select pg_temp.act_as('designer-a'); set local role authenticated;
select throws_ok($$select create_design_board(pg_temp.k('project'),'Forbidden',
 'https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
 '42501',null,'A designer cannot create a board');
reset role;
select pg_temp.act_as('agency'); set local role authenticated;
select ok(create_design_board(pg_temp.k('project'),' Alpha board ',
 'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=11',pg_temp.k('designer-a')) is not null,
 'Agency creates an assigned board');
update mw set value=(select id from design_boards where project_id=pg_temp.k('project') and name='Alpha board')
 where key='board-a';
select ok(create_design_board(pg_temp.k('project'),'Beta board',
 'https://miro.com/app/board/uXjVBeta001=/',pg_temp.k('designer-b')) is not null,
 'Agency creates an independent second board');
update mw set value=(select id from design_boards where project_id=pg_temp.k('project') and name='Beta board')
 where key='board-b';
select is((select widget_id from design_boards where id=pg_temp.k('board-a')),'11','Board frame is retained');
select throws_ok($$select create_design_board(pg_temp.k('project'),'alpha BOARD',
 'https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
 '23505',null,'Board names are unique without case');
select throws_ok($$select create_design_board(pg_temp.k('project'),'Outsider',
 'https://miro.com/app/board/uXjVOutside=/',pg_temp.k('outsider'))$$,
 '22023',null,'Board designer must be assigned');
select throws_ok($$select create_design_board(pg_temp.k('project'),'Bad link',
 'https://evil.example/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
 '22023',null,'Only valid Miro links are stored');
select is((select count(*)::integer from design_boards where project_id=pg_temp.k('project')),
 2,'Rejected boards leave no rows');
select is(save_production_brief(pg_temp.k('board-a'),pg_temp.brief(),0,true,
 pg_temp.k('release-a'),1,1),1,'Agency releases instructions to one board');
reset role;
select pg_temp.act_as('designer-a'); set local role authenticated;
select is((select array_agg(name order by name) from design_boards),array['Alpha board'],
 'Designer A sees only their board');
select is((select count(*)::integer from production_briefs),1,
 'Designer A sees their released brief');
select set_config('mw.round',send_board_round_for_request(pg_temp.k('board-a'),
 (select id from board_work_requests where board_id=pg_temp.k('board-a') and current),2,
 ' First pass ',null,pg_temp.k('round-a'))::text,true);
select is((select notes from design_versions where id=current_setting('mw.round')::uuid),
 'First pass','Round note is trimmed');
select is((select widget_id from design_version_miro_links
 where version_id=current_setting('mw.round')::uuid),'11','Round inherits the board frame');
select lives_ok($$select set_version_miro_link(current_setting('mw.round')::uuid,
 'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=33')$$,
 'Assigned designer may relink their round');
select is((select widget_id from design_version_miro_links
 where version_id=current_setting('mw.round')::uuid),'33','Round link update persists');
select set_config('mw.comment',post_comment(pg_temp.k('project'),'internal','My round',
 current_setting('mw.round')::uuid)::text,true);
reset role;
select pg_temp.act_as('designer-b'); set local role authenticated;
select is((select array_agg(name) from design_boards),array['Beta board'],
 'Designer B sees only their board');
select is((select count(*)::integer from production_briefs),0,
 'Designer B cannot read A instructions');
select is((select count(*)::integer from design_versions),0,
 'Designer B cannot read A round');
select is((select count(*)::integer from design_version_miro_links),0,
 'Designer B cannot read A frame');
select throws_ok($$select set_version_miro_link(current_setting('mw.round')::uuid,
 'https://miro.com/app/board/uXjVAlpha01=/')$$,'42501',null,
 'Designer B cannot edit A round link');
select throws_ok($$select post_comment(pg_temp.k('project'),'internal','Forbidden',
 current_setting('mw.round')::uuid)$$,'42501',null,
 'Designer B cannot comment on A round');
reset role;
select pg_temp.act_as('agency'); set local role authenticated;
select is((select count(*)::integer from internal_comments where project_id=pg_temp.k('project')),
 1,'Agency can review the private round comment');
select set_config('mw.publication',share_workflow_version(pg_temp.k('project'),
 'https://miro.com/app/board/uXjVClient001=/?moveToWidget=5','First look',
 array[current_setting('mw.round')::uuid],null,null,false,pg_temp.k('share-v1'))::text,true);
select is((select widget_id from publication_miro_links
 where publication_id=current_setting('mw.publication')::uuid),'5','Client link is separate from internal frame');
reset role;
select is((select count(*)::integer from private.publication_round_sources
 where publication_id=current_setting('mw.publication')::uuid),1,'Publication retains its source round');
select pg_temp.act_as('agency'); set local role authenticated;
select lives_ok($$select set_publication_miro_link(current_setting('mw.publication')::uuid,
 'https://miro.com/app/board/uXjVClient001=/?moveToWidget=8')$$,
 'Agency can update the published Miro link');
select is((select widget_id from publication_miro_links
 where publication_id=current_setting('mw.publication')::uuid),'8','Link edit keeps same V identity');
select throws_ok($$select clear_publication_miro_link(current_setting('mw.publication')::uuid)$$,
 '22023',null,'Published version must retain a link');
reset role;
select pg_temp.act_as('client'); set local role authenticated;
select is((select count(*)::integer from design_boards),0,'Client cannot read boards');
select is((select count(*)::integer from design_versions),0,'Client cannot read rounds');
select is((select count(*)::integer from board_work_requests),0,'Client cannot read work requests');
select is((select count(*)::integer from published_versions where project_id=pg_temp.k('project')),
 1,'Client reads the shared V1');
select is((select widget_id from publication_miro_links
 where publication_id=current_setting('mw.publication')::uuid),'8','Client reads the current V1 link');
select lives_ok($$select review_publication(current_setting('mw.publication')::uuid,'approved','')$$,
 'Client can approve the latest version');
reset role;
select is((select status::text from projects where id=pg_temp.k('project')),'approved',
 'Latest approval moves the public phase');
select * from finish();
rollback;
