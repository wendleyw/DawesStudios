begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- One rolled-back transaction over the seeded SABRE landing page, the designer assigned to it and
-- a designer who is not. The client version and the round are created here, in the Miro model: a
-- board for the assigned designer with one round, and one project-level client version.
create temporary table miro_context(key text primary key,value uuid);
grant all on miro_context to authenticated;
insert into miro_context values
  ('agency',md5('dawes:agency')::uuid),
  ('client',md5('dawes:client-8')::uuid),
  ('project',md5('dawes:project-sabre-campaign-landing-page')::uuid);
insert into miro_context
  select 'assigned',designer_id from public.project_assignments
  where project_id=md5('dawes:project-sabre-campaign-landing-page')::uuid limit 1;
insert into miro_context
  select 'outsider',p.id from public.profiles p
  where p.role='designer' and p.removed_at is null and not exists(
    select 1 from public.project_assignments a
    where a.designer_id=p.id and a.project_id=md5('dawes:project-sabre-campaign-landing-page')::uuid)
  limit 1;
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from miro_context where key=p_key
$$;
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.context(p_key)::text,true)
$$;

select set_config('request.jwt.claim.sub',pg_temp.context('agency')::text,true);
set local role authenticated;
insert into miro_context values('board',public.create_design_board(pg_temp.context('project'),'Links board',
  'https://miro.com/app/board/uXjVBoard01=/',pg_temp.context('assigned')));
insert into miro_context values('version',public.send_board_round(pg_temp.context('board'),'Links round'));
insert into miro_context values('publication',public.share_miro_version(pg_temp.context('project'),
  'https://miro.com/app/board/uXjVClient00=/','Links version'));
reset role;

select has_table('public','publication_miro_links','Client-board links have their own table');
select has_table('public','design_version_miro_links','Internal-board links have their own table');
select is((select count(*)::int from miro_context where value is not null),8,'Every fixture role resolved');

-- The parser.
select is((select board_id from private.parse_miro_board_url('https://miro.com/app/board/uXjVKabc123=/')),
  'uXjVKabc123=','A board link yields its board');
select is((select widget_id from private.parse_miro_board_url('https://miro.com/app/board/uXjVKabc123=/')),
  null,'A board link has no frame');
select is((select widget_id from private.parse_miro_board_url(
  'https://miro.com/app/board/uXjVKabc123=/?share_link_id=42&moveToWidget=3458764512345678901&cot=14')),
  '3458764512345678901','A frame link among other query values yields its frame');
select is((select board_id from private.parse_miro_board_url('https://www.miro.com/app/board/uXjVKabc123%3D/')),
  'uXjVKabc123=','An encoded board id is decoded');
select throws_ok($$select private.parse_miro_board_url('http://miro.com/app/board/uXjVKabc123=/')$$,
  '22023',null,'Plain HTTP is refused');
select throws_ok($$select private.parse_miro_board_url('https://evil.example/app/board/uXjVKabc123=/')$$,
  '22023',null,'Another host is refused');
select throws_ok($$select private.parse_miro_board_url('https://miro.com.evil.example/app/board/uXjVKabc123=/')$$,
  '22023',null,'A look-alike host is refused');
select throws_ok($$select private.parse_miro_board_url('https://miro.com/app/board/uXjVKabc123=/?moveToWidget=abc')$$,
  '22023',null,'A non-numeric frame id is refused');
select throws_ok($$select private.parse_miro_board_url(null)$$,'22023',null,'An empty link is refused');

-- Writes: the agency only.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_publication_miro_link(pg_temp.context('publication'),
  'https://miro.com/app/board/uXjVClient01=/?moveToWidget=111')$$,'The agency links a publication');
select lives_ok($$select public.set_publication_miro_link(pg_temp.context('publication'),
  'https://miro.com/app/board/uXjVClient01=/?moveToWidget=222')$$,'Setting again replaces the link');
select lives_ok($$select public.set_version_miro_link(pg_temp.context('version'),
  'https://miro.com/app/board/uXjVStudio1=/?moveToWidget=333')$$,'The agency links an internal version');
select is((select count(*)::int from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  1,'One row per publication');
select is((select widget_id from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  '222','The latest link wins');
reset role;

select pg_temp.act_as('client');
set local role authenticated;
select is((select board_id from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  'uXjVClient01=','The client reads its client-board link');
select is((select count(*)::int from public.design_version_miro_links),0,'The client never reads internal links');
select throws_ok($$select public.set_publication_miro_link(pg_temp.context('publication'),
  'https://miro.com/app/board/uXjVClient01=/')$$,'42501',null,'The client cannot set a link');
select throws_ok($$select public.clear_publication_miro_link(pg_temp.context('publication'))$$,
  '42501',null,'The client cannot clear a link');
select throws_ok($$insert into public.publication_miro_links(publication_id,project_id,board_id,updated_by)
  values(pg_temp.context('publication'),pg_temp.context('project'),'uXjVForged1=',pg_temp.context('client'))$$,
  '42501',null,'Nobody writes the table directly');
reset role;

select pg_temp.act_as('assigned');
set local role authenticated;
select is((select board_id from public.design_version_miro_links where version_id=pg_temp.context('version')),
  'uXjVStudio1=','An assigned designer reads the internal link');
select is((select count(*)::int from public.publication_miro_links),0,'A designer never reads client links');
select lives_ok($$select public.set_version_miro_link(pg_temp.context('version'),
  'https://miro.com/app/board/uXjVStudio1=/?moveToWidget=333')$$,'The board''s designer can relink its own round');
reset role;

select pg_temp.act_as('outsider');
set local role authenticated;
-- Scoped to this project: the designer may be assigned elsewhere, where internal links can exist.
select is((select count(*)::int from public.design_version_miro_links where project_id=pg_temp.context('project')),0,'An unassigned designer reads no internal link');
select throws_ok($$select public.set_version_miro_link(pg_temp.context('version'),
  'https://miro.com/app/board/uXjVStudio1=/')$$,'42501',null,'Another designer cannot set a link');
reset role;

-- Clearing, and clearing twice.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.clear_publication_miro_link(pg_temp.context('publication'))$$,
  '22023','A shared version needs its Miro link','A client version keeps its link');
select lives_ok($$select public.clear_publication_miro_link(gen_random_uuid())$$,'Clearing an unknown version is not an error');
select lives_ok($$select public.clear_version_miro_link(pg_temp.context('version'))$$,'The agency clears an internal link');
select is((select count(*)::int from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  1,'The client version link stays');
select throws_ok($$select public.set_version_miro_link(gen_random_uuid(),'https://miro.com/app/board/uXjVStudio1=/')$$,
  'P0002',null,'An unknown version is reported');
reset role;

select * from finish();
rollback;
