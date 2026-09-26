begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Self-contained fixture: an agency member, a client member, two designers on one project, and a
-- third designer who is not assigned. Nothing depends on the seed or the SABRE overlay.
create temporary table mw(key text primary key, value uuid);
grant all on mw to authenticated, service_role;
insert into mw values
  ('agency',md5('mw:agency')::uuid),('client',md5('mw:client')::uuid),
  ('designer-a',md5('mw:designer-a')::uuid),('designer-b',md5('mw:designer-b')::uuid),
  ('outsider',md5('mw:outsider')::uuid),('client-org',md5('mw:client-org')::uuid),
  ('project',md5('mw:project')::uuid),('delivered',md5('mw:delivered')::uuid);
create function pg_temp.k(p text) returns uuid language sql as $$ select value from mw where key=p $$;
create function pg_temp.act_as(p text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true) $$;
create function pg_temp.remember(p text, v uuid) returns uuid language sql as $$
  insert into mw values(p,v) on conflict(key) do update set value=excluded.value returning value $$;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.k('agency'),'mw-agency@fixture.local','{"display_name":"MW Agency"}'),
  (pg_temp.k('client'),'mw-client@fixture.local','{"display_name":"MW Client"}'),
  (pg_temp.k('designer-a'),'mw-a@fixture.local','{"display_name":"Designer Alpha"}'),
  (pg_temp.k('designer-b'),'mw-b@fixture.local','{"display_name":"Designer Beta"}'),
  (pg_temp.k('outsider'),'mw-o@fixture.local','{"display_name":"Designer Outside"}');
update public.profiles set role='agency' where id=pg_temp.k('agency');
update public.profiles set role='designer' where id in (pg_temp.k('designer-a'),pg_temp.k('designer-b'),pg_temp.k('outsider'));
insert into public.clients(id,name,slug) values (pg_temp.k('client-org'),'MW Client','mw-client');
insert into public.client_memberships(client_id,user_id) values (pg_temp.k('client-org'),pg_temp.k('client'));
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.k('project'),pg_temp.k('client-org'),'MW project','ai','in_progress'),
  (pg_temp.k('delivered'),pg_temp.k('client-org'),'MW delivered','ai','delivered');
insert into public.project_assignments(project_id,designer_id) values
  (pg_temp.k('project'),pg_temp.k('designer-a')),(pg_temp.k('project'),pg_temp.k('designer-b')),
  (pg_temp.k('delivered'),pg_temp.k('designer-a'));

select has_table('public','design_boards','Design boards have their own table');

-- Boards: the agency only, the designer must be assigned, names are unique per project.
select pg_temp.act_as('designer-a');
set local role authenticated;
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Alpha','https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
  '42501',null,'A designer cannot create a board');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('board-a',public.create_design_board(pg_temp.k('project'),' Alpha board ','https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=11',pg_temp.k('designer-a')))$$,
  'The agency creates a board for an assigned designer');
select lives_ok($$select pg_temp.remember('board-b',public.create_design_board(pg_temp.k('project'),'Beta board','https://miro.com/app/board/uXjVBeta001=/',pg_temp.k('designer-b')))$$,
  'The agency creates a second board for another designer');
select lives_ok($$select pg_temp.remember('board-delivered',public.create_design_board(pg_temp.k('delivered'),'Late board','https://miro.com/app/board/uXjVLate001=/',pg_temp.k('designer-a')))$$,
  'A delivered project can still hold a board');
select is((select name from public.design_boards where id=pg_temp.k('board-a')),'Alpha board','The name is trimmed');
select is((select widget_id from public.design_boards where id=pg_temp.k('board-a')),'11','The frame is kept');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'alpha BOARD','https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
  '23505',null,'Board names are unique per project, ignoring case');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Outside','https://miro.com/app/board/uXjVOut0001=/',pg_temp.k('outsider'))$$,
  '22023',null,'The designer must be assigned to the project');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'   ','https://miro.com/app/board/uXjVOut0001=/',pg_temp.k('designer-a'))$$,
  '22023',null,'A board needs a name');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Bad link','https://evil.example/app/board/uXjVOut0001=/',pg_temp.k('designer-a'))$$,
  '22023',null,'An invalid link is refused');
select is((select count(*)::int from public.design_boards where project_id=pg_temp.k('project')),2,'Refused boards wrote nothing');
reset role;

-- Board visibility: the agency sees all; each designer only their own; the client none.
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select array_agg(name order by name) from public.design_boards),array['Alpha board','Late board'],'Designer A sees only their boards');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select array_agg(name) from public.design_boards),array['Beta board'],'Designer B sees only their board');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.design_boards),0,'The client sees no board');
reset role;

-- Rounds: only the board's designer or the agency; numbered per board; idempotent; delivered refused.
select pg_temp.act_as('designer-b');
set local role authenticated;
select throws_ok($$select public.send_board_round(pg_temp.k('board-a'),'Not mine')$$,'42501',null,'Another designer cannot send from a board');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select lives_ok($$select pg_temp.remember('round-a1',public.send_board_round(pg_temp.k('board-a'),' First pass ',null,md5('mw:key-a1')::uuid))$$,'The board''s designer sends a round');
select is(public.send_board_round(pg_temp.k('board-a'),' First pass ',null,md5('mw:key-a1')::uuid),pg_temp.k('round-a1'),'A retry with the same key returns the same round');
select lives_ok($$select pg_temp.remember('round-a2',public.send_board_round(pg_temp.k('board-a'),'',
  'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=22'))$$,'A second round with its own frame');
select throws_ok($$select public.send_board_round(pg_temp.k('board-a'),'x','https://evil.example/app/board/uXjVAlpha01=/')$$,
  '22023',null,'A round with an invalid frame link is refused');
select throws_ok($$select public.send_board_round(pg_temp.k('board-delivered'),'late')$$,'P0001','Delivered projects cannot receive new rounds','A delivered project refuses rounds');
reset role;
select is((select array_agg(version_number order by version_number) from public.design_versions where board_id=pg_temp.k('board-a')),array[1,2],'Rounds are numbered per board, once each');
select is((select notes from public.design_versions where id=pg_temp.k('round-a1')),'First pass','The note is trimmed');
select is((select status from public.design_versions where id=pg_temp.k('round-a1')),'submitted','A round is submitted');
select is((select deliverable_id from public.design_versions where id=pg_temp.k('round-a1')),null,'A round has no deliverable');
select is((select widget_id from public.design_version_miro_links where version_id=pg_temp.k('round-a1')),'11','A round without a frame link uses the board''s link');
select is((select widget_id from public.design_version_miro_links where version_id=pg_temp.k('round-a2')),'22','A round keeps its own frame');
select is((select status::text from public.projects where id=pg_temp.k('project')),'internal_review','Sending a round moves the project to internal review');
select ok(exists(select 1 from public.notifications n join public.profiles p on p.id=n.user_id where n.project_id=pg_temp.k('project') and p.id=pg_temp.k('agency') and n.title='Design ready for studio review'),'The agency is notified');
select throws_ok($$insert into public.design_versions(project_id,version_number,created_by) values(pg_temp.k('project'),9,pg_temp.k('agency'))$$,
  '23514',null,'A version needs exactly one of a deliverable or a board');

-- Round and link visibility: only the board's designer and the agency.
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.design_versions where board_id=pg_temp.k('board-a')),0,'Designer B cannot read Designer A''s rounds');
select is((select count(*)::int from public.design_version_miro_links where version_id=pg_temp.k('round-a1')),0,'Designer B cannot read Designer A''s round links');
select throws_ok($$select public.set_version_miro_link(pg_temp.k('round-a1'),'https://miro.com/app/board/uXjVAlpha01=/')$$,'42501',null,'Designer B cannot relink Designer A''s round');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.design_versions where board_id=pg_temp.k('board-a')),2,'Designer A reads their rounds');
select lives_ok($$select public.set_version_miro_link(pg_temp.k('round-a1'),'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=33')$$,'The board''s designer relinks their round');
reset role;

-- Internal comments: a designer never reads or touches another designer's comments.
select pg_temp.act_as('designer-a');
set local role authenticated;
select lives_ok($$select pg_temp.remember('comment-a-round',public.post_comment(pg_temp.k('project'),'internal','On my round',pg_temp.k('round-a1')))$$,'Designer A comments on their round');
select lives_ok($$select pg_temp.remember('comment-a-project',public.post_comment(pg_temp.k('project'),'internal','Project note from A'))$$,'Designer A comments on the project');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('comment-agency',public.post_comment(pg_temp.k('project'),'internal','Studio note'))$$,'The agency comments on the project');
select is((select count(*)::int from public.internal_comments where project_id=pg_temp.k('project')),3,'The agency reads every internal comment');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select array_agg(body) from public.internal_comments where project_id=pg_temp.k('project')),array['Studio note'],'Designer B reads only studio comments and their own');
select is((select count(*)::int from public.internal_comments where author_id=pg_temp.k('designer-a')),0,'Designer A''s identity never reaches Designer B');
select throws_ok($$select public.post_comment(pg_temp.k('project'),'internal','Sneaky',pg_temp.k('round-a1'))$$,'42501',null,'Designer B cannot comment on Designer A''s round');
select throws_ok($$select public.resolve_comment(pg_temp.k('comment-a-project'),'internal',true)$$,'42501',null,'Designer B cannot resolve Designer A''s comment');
reset role;

-- Updating a board: agency only, reassigning moves visibility, unassignment hides it.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.update_design_board(pg_temp.k('board-b'),'Beta renamed','https://miro.com/app/board/uXjVBeta002=/',pg_temp.k('designer-b'))$$,'The agency renames and relinks a board');
select is((select board_id from public.design_boards where id=pg_temp.k('board-b')),'uXjVBeta002=','The new link is stored');
reset role;
delete from public.project_assignments where project_id=pg_temp.k('project') and designer_id=pg_temp.k('designer-b');
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.design_boards),0,'An unassigned designer loses their board');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.update_design_board(pg_temp.k('board-b'),'Beta renamed','https://miro.com/app/board/uXjVBeta002=/',pg_temp.k('designer-b'))$$,'22023',null,'A board cannot keep an unassigned designer');
select lives_ok($$select public.update_design_board(pg_temp.k('board-b'),'Beta renamed','https://miro.com/app/board/uXjVBeta002=/',pg_temp.k('designer-a'))$$,'The agency reassigns the board');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.design_boards where project_id=pg_temp.k('project')),2,'The reassigned designer now sees it');
reset role;

select * from finish();
rollback;
