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
select throws_ok($$select public.send_board_round(pg_temp.k('board-delivered'),'late')$$,'22023','Delivered projects cannot receive new rounds','A delivered project refuses rounds');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.send_board_round(pg_temp.k('board-b'),'x',null,md5('mw:key-a1')::uuid)$$,
  '23505',null,'A reused idempotency key for a different board is refused');
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

-- Round comment notifications: only the round's designer is notified about a comment on their
-- round; a project-level comment still reaches every assigned designer, exactly as before.
-- (notifications_read restricts each user to their own rows, so counts are read as that designer.)
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('comment-agency-round',public.post_comment(pg_temp.k('project'),'internal','Round-only studio note',pg_temp.k('round-a1')))$$,
  'The agency comments on Designer A''s round');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.notifications where project_id=pg_temp.k('project') and title='New studio message'),2,
  'Designer A is notified about the comment on their round');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.notifications where project_id=pg_temp.k('project') and title='New studio message'),1,
  'Designer B is not notified about a round they do not own');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('comment-agency-project2',public.post_comment(pg_temp.k('project'),'internal','Second studio note'))$$,
  'The agency comments on the project again');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.notifications where project_id=pg_temp.k('project') and title='New studio message'),3,
  'Designer A is still notified about project-level comments');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.notifications where project_id=pg_temp.k('project') and title='New studio message'),2,
  'Designer B is notified about project-level comments');
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

-- The Miro frame is the round's design: rounds never carry an uploaded design record, for anyone.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.add_design(pg_temp.k('round-a1'),'Nope')$$,
  '22023',null,'The agency cannot add an uploaded design to a round');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
-- Designer B was unassigned from the project earlier in this test, so private.can_produce fails
-- first here (42501); a still-assigned designer would instead hit the round-designs guard (22023).
select throws_ok($$select public.add_design(pg_temp.k('round-a1'),'Sneaky design')$$,
  '42501',null,'Another designer cannot add an uploaded design to a round either');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select throws_ok($$select public.submit_design_version(pg_temp.k('round-a1'))$$,
  'P0001','Add a design before submitting','A round cannot be submitted through submit_design_version');
select is((select count(*)::int from public.designs where version_id=pg_temp.k('round-a1')),0,'The round still has no design row');
reset role;

-- Sharing: agency only; from a round or direct; idempotent; atomic on a bad link; delivered refused.
select pg_temp.act_as('designer-a');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/','x')$$,'42501',null,'A designer cannot share with the client');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://evil.example/app/board/uXjVClient1=/','x')$$,'22023',null,'An invalid client link is refused');
select is((select count(*)::int from public.published_versions where project_id=pg_temp.k('project')),0,'A refused share wrote nothing');
select lives_ok($$select pg_temp.remember('shared-1',public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=5',' First look ',pg_temp.k('round-a1'),md5('mw:share-1')::uuid))$$,'The agency shares a round');
select is(public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=5',' First look ',pg_temp.k('round-a1'),md5('mw:share-1')::uuid),pg_temp.k('shared-1'),'A retry returns the same version');
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient9=/?moveToWidget=5',' First look ',pg_temp.k('round-a1'),md5('mw:share-1')::uuid)$$,
  '23505','Idempotency key conflicts with a different version','A retry with the same key but a different board link is refused');
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/','other',null,md5('mw:share-1')::uuid)$$,'23505','Idempotency key conflicts with a different version','A reused key for another share is refused');
select throws_ok($$select public.share_miro_version(pg_temp.k('delivered'),'https://miro.com/app/board/uXjVClient1=/','late')$$,'22023','Delivered projects cannot publish new revisions','A delivered project refuses sharing');
reset role;
select is((select deliverable_id from public.published_versions where id=pg_temp.k('shared-1')),null,'A shared version belongs to the project, not a deliverable');
select is((select version_number from public.published_versions where id=pg_temp.k('shared-1')),1,'The first shared version is V1');
select is((select release_note from public.published_versions where id=pg_temp.k('shared-1')),'First look','The note is trimmed');
select is((select widget_id from public.publication_miro_links where publication_id=pg_temp.k('shared-1')),'5','The client link is stored');
select is((select status from public.publication_reviews where publication_id=pg_temp.k('shared-1')),'pending','A pending review opens');
select is((select internal_version_id from private.publication_sources where publication_id=pg_temp.k('shared-1')),pg_temp.k('round-a1'),'The source round is recorded');
select is((select status from public.design_versions where id=pg_temp.k('round-a1')),'reviewed','The round is marked shared');
select is((select status::text from public.projects where id=pg_temp.k('project')),'client_review','The project waits for the client');
select ok(exists(select 1 from public.notifications where client_id=pg_temp.k('client-org') and project_id=pg_temp.k('project') and title='New designs ready for review'),'The client is notified');

select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=9','Reshare',pg_temp.k('round-a1'))$$,
  '23505','This round is already shared','A round already shared cannot be shared again');
reset role;

select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('shared-2',public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=6','Second look'))$$,'The agency adds a version directly');
reset role;
select is((select version_number from public.published_versions where id=pg_temp.k('shared-2')),2,'Direct versions continue the project numbering');
select is((select count(*)::int from private.publication_sources where publication_id=pg_temp.k('shared-2')),0,'A direct version has no source round');
select is((select requested_by from private.miro_share_requests where publication_id=pg_temp.k('shared-2')),pg_temp.k('agency'),'The publisher of a direct version is recorded');

-- The client reads the versions and links but nothing internal.
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.published_versions where project_id=pg_temp.k('project')),2,'The client reads both shared versions');
select is((select count(*)::int from public.publication_miro_links where project_id=pg_temp.k('project')),2,'The client reads the client links');
select is((select count(*)::int from public.design_versions),0,'The client reads no round');
select is((select count(*)::int from public.design_boards),0,'The client reads no board');
-- Review: only the latest; a project-level decision sets the project status directly.
select throws_ok($$select public.review_publication(pg_temp.k('shared-1'),'approved')$$,'P0001','Review the latest published version','An older version cannot be reviewed');
select lives_ok($$select public.review_publication(pg_temp.k('shared-2'),'changes_requested','Warmer tones')$$,'The client requests changes on the latest');
reset role;
select is((select status::text from public.projects where id=pg_temp.k('project')),'changes_requested','Requested changes reach the project');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('shared-3',public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=7','Third look'))$$,'The agency shares the revision');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select lives_ok($$select public.review_publication(pg_temp.k('shared-3'),'approved')$$,'The client approves');
reset role;
select is((select status::text from public.projects where id=pg_temp.k('project')),'approved','Approval of the latest project-level version approves the project');

-- A shared version is a Miro link and nothing else: its link can change but never be removed.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.clear_publication_miro_link(pg_temp.k('shared-3'))$$,
  '22023','A shared version needs its Miro link','The agency cannot remove a shared version''s link');
select lives_ok($$select public.set_publication_miro_link(pg_temp.k('shared-3'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=8')$$,
  'The agency can still change a shared version''s link');
select is((select widget_id from public.publication_miro_links where publication_id=pg_temp.k('shared-3')),'8','The shared version keeps a link');
reset role;

-- Author columns: after a board is reassigned, its new designer reads the earlier rounds but never
-- who made them. Nobody reads the author columns through the API; only definer functions do.
insert into public.project_assignments(project_id,designer_id) values (pg_temp.k('project'),pg_temp.k('designer-b'));
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.update_design_board(pg_temp.k('board-a'),'Alpha board','https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-b'))$$,
  'The agency hands Designer A''s board to Designer B');
select throws_ok($$select created_by from public.design_versions limit 1$$,'42501',null,'The agency does not read version authors through the API either');
select lives_ok($$select id, notes, status, created_at from public.design_versions limit 1$$,'The agency reads every other version column');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.design_versions where board_id=pg_temp.k('board-a')),2,'Designer B now reads the board''s earlier rounds');
select throws_ok($$select created_by from public.design_versions where board_id=pg_temp.k('board-a')$$,'42501',null,'Designer B cannot read who made a round');
select throws_ok($$select count(*) from public.design_versions where created_by=pg_temp.k('designer-a')$$,'42501',null,'Designer B cannot probe for Designer A''s id');
select throws_ok($$select updated_by from public.design_version_miro_links where version_id=pg_temp.k('round-a1')$$,'42501',null,'Designer B cannot read who linked a round');
select throws_ok($$select created_by from public.designs limit 1$$,'42501',null,'Designer B cannot read who made a design');
select throws_ok($$select * from public.design_versions limit 1$$,'42501',null,'A whole-row read is refused rather than leaking the author');
select lives_ok($$select version_id, board_id, widget_id, updated_at from public.design_version_miro_links limit 1$$,'Designer B reads the link columns');
select lives_ok($$select id, version_id, title, content, internal_asset_path, sort_order from public.designs limit 1$$,'Designer B reads the design columns');
reset role;

-- Sharing: a round from another project is refused; the anon role has no access at all; and an
-- idempotency key already used by a different publication_sources row (as publish_version writes
-- one) is refused with a clean message, not a raw unique-constraint error.
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.remember('other-project',md5('mw:other-project')::uuid),pg_temp.k('client-org'),'MW other project','ai','in_progress');
insert into public.project_assignments(project_id,designer_id) values (pg_temp.k('other-project'),pg_temp.k('designer-a'));
select pg_temp.act_as('agency');
set local role authenticated;
select pg_temp.remember('other-board',public.create_design_board(pg_temp.k('other-project'),'Other board','https://miro.com/app/board/uXjVOther01=/',pg_temp.k('designer-a')));
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select pg_temp.remember('other-round',public.send_board_round(pg_temp.k('other-board'),'Other round'));
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=11','x',pg_temp.k('other-round'))$$,
  'P0002',null,'Sharing a round from another project is refused');
reset role;
set local role anon;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/','x')$$,
  '42501',null,'The anon role cannot share a version');
reset role;

select pg_temp.act_as('designer-b');
set local role authenticated;
select pg_temp.remember('round-a3',public.send_board_round(pg_temp.k('board-a'),'Third pass'));
reset role;
select pg_temp.remember('fixture-publication',md5('mw:fixture-publication')::uuid);
insert into public.published_versions(id,project_id,deliverable_id,version_number,release_note) values
  (pg_temp.k('fixture-publication'),pg_temp.k('project'),null,500,'fixture');
insert into private.publication_sources(publication_id,internal_version_id,published_by,request_key,request_note) values
  (pg_temp.k('fixture-publication'),pg_temp.k('round-a1'),pg_temp.k('agency'),md5('mw:foreign-key')::uuid,'fixture');
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=12','Reuse',pg_temp.k('round-a3'),md5('mw:foreign-key')::uuid)$$,
  '23505','Idempotency key conflicts with a different version','A key already used by another publication_sources row is refused, not a raw unique violation');
select is((select count(*)::int from public.published_versions where project_id=pg_temp.k('project') and version_number>500),0,'The failed share left no extra published version');
reset role;

-- Delivered projects: only the agency may relink a round once the project is delivered.
update public.projects set status='delivered' where id=pg_temp.k('project');
select pg_temp.act_as('designer-b');
set local role authenticated;
select throws_ok($$select public.set_version_miro_link(pg_temp.k('round-a1'),'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=99')$$,
  '22023','Delivered projects cannot change links','The board''s designer cannot relink a round once the project is delivered');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_version_miro_link(pg_temp.k('round-a1'),'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=99')$$,
  'The agency can still relink a round after delivery');
reset role;

-- Board due dates: internal, on or before the project's own date, readable by the board's designer.
update public.projects set due_date='2026-10-10' where id=pg_temp.k('project');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('board-dated',public.create_design_board(pg_temp.k('project'),'Dated board','https://miro.com/app/board/uXjVDated01=/',pg_temp.k('designer-a'),'2026-10-06'))$$,
  'The agency sets a board due date before the project''s');
select is((select due_date from public.design_boards where id=pg_temp.k('board-dated')),'2026-10-06'::date,'The board due date is stored');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Too late','https://miro.com/app/board/uXjVLate002=/',pg_temp.k('designer-a'),'2026-10-11')$$,
  '22023',null,'A board cannot be due after its project');
select throws_ok($$select public.update_design_board(pg_temp.k('board-dated'),'Dated board','https://miro.com/app/board/uXjVDated01=/',pg_temp.k('designer-a'),'2026-10-11')$$,
  '22023',null,'An update cannot move a board past its project''s due date');
select lives_ok($$select public.update_design_board(pg_temp.k('board-dated'),'Dated board','https://miro.com/app/board/uXjVDated01=/',pg_temp.k('designer-a'),'2026-10-10')$$,
  'A board may be due on the project''s own date');
select lives_ok($$select public.update_design_board(pg_temp.k('board-dated'),'Dated board','https://miro.com/app/board/uXjVDated01=/',pg_temp.k('designer-a'))$$,
  'Leaving the date out clears it');
select is((select due_date from public.design_boards where id=pg_temp.k('board-dated')),null::date,'The board has no due date again');
select lives_ok($$select public.update_design_board(pg_temp.k('board-dated'),'Dated board','https://miro.com/app/board/uXjVDated01=/',pg_temp.k('designer-a'),'2026-10-03')$$,
  'The agency sets the date again');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select due_date from public.design_boards where id=pg_temp.k('board-dated')),'2026-10-03'::date,'The board''s designer reads its due date');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.design_boards where due_date is not null),0,'The client never reads a board due date');
reset role;
update public.projects set due_date=null where id=pg_temp.k('project');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.update_design_board(pg_temp.k('board-dated'),'Dated board','https://miro.com/app/board/uXjVDated01=/',pg_temp.k('designer-a'),'2027-01-15')$$,
  'A project without a due date accepts any board date');
reset role;

select * from finish();
rollback;
