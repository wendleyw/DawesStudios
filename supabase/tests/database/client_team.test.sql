begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- One rolled-back transaction. SABRE is client-org-8 and its seeded person client-8; Acme is
-- client-org-1 and client-1 (supabase/seed.sql). Everything created below exists only here.
create temporary table client_team_context(key text primary key,value uuid);
grant all on client_team_context to authenticated;
insert into client_team_context values
  ('sabre',md5('dawes:client-org-8')::uuid),
  ('sabre-person',md5('dawes:client-8')::uuid),
  ('acme',md5('dawes:client-org-1')::uuid),
  ('acme-person',md5('dawes:client-1')::uuid),
  ('agency',md5('dawes:agency')::uuid),
  ('designer',md5('dawes:designer-1')::uuid),
  ('teammate',md5('client-team:teammate')::uuid),
  ('quiet',md5('client-team:quiet')::uuid),
  ('leaving',md5('client-team:leaving')::uuid),
  ('former',md5('client-team:former')::uuid),
  ('solo',md5('client-team:solo-client')::uuid),
  ('solo-person',md5('client-team:solo-person')::uuid),
  ('empty',md5('client-team:empty-client')::uuid),
  ('newcomer',md5('client-team:newcomer')::uuid),
  ('project',md5('client-team:project')::uuid),
  ('deliverable',md5('client-team:deliverable')::uuid),
  ('publication',md5('client-team:publication')::uuid);
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from client_team_context where key=p_key
$$;
-- The JWT subject every following statement acts as, until the next call.
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.context(p_key)::text,true)
$$;

-- Four more SABRE people (Tess edits, Quinn keeps My requests, Riley will leave, Fran is already
-- removed), a client with exactly one person and a client with nobody. A designer given a stray
-- SABRE membership row proves that the role, not the membership, makes someone a client person.
insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.context('teammate'),'teammate@client-team.test','{"display_name":"Tess Teammate"}'),
  (pg_temp.context('quiet'),'quiet@client-team.test','{"display_name":"Quinn Quiet"}'),
  (pg_temp.context('leaving'),'leaving@client-team.test','{"display_name":"Riley Leaving"}'),
  (pg_temp.context('former'),'former@client-team.test','{"display_name":"Fran Former"}'),
  (pg_temp.context('solo-person'),'solo@client-team.test','{"display_name":"Sol Only"}'),
  (pg_temp.context('newcomer'),'newcomer@client-team.test','{"display_name":"Nia Newcomer"}');
insert into public.clients(id,name,slug) values
  (pg_temp.context('solo'),'Client team solo fixture','client-team-solo-fixture'),
  (pg_temp.context('empty'),'Client team empty fixture','client-team-empty-fixture');
insert into public.client_memberships(client_id,user_id)
  select pg_temp.context('sabre'),pg_temp.context(k)
  from unnest(array['teammate','quiet','leaving','former','designer']) k;
insert into public.client_memberships(client_id,user_id)
  values(pg_temp.context('solo'),pg_temp.context('solo-person'));
update public.profiles set removed_at=now() where id=pg_temp.context('former');

-- Schema.
select has_column('public','briefings','requested_by','A briefing records who asked for the work');
select has_column('public','publication_reviews','reviewed_by','A review decision records who made it');
select col_not_null('public','client_memberships','notify_all','Every membership carries a notification choice');
select is(
  (select column_default::text from information_schema.columns
    where table_schema='public' and table_name='client_memberships' and column_name='notify_all'),
  'false'::text,'Everyone starts with My requests');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('save_briefing','save_briefing_revision')),
  2,'The old save_briefing signatures are gone, so no overload is left behind');

-- The backfill: a briefing created by one of its client's people names a requester, and no
-- briefing ever names a studio or designer account.
select is(
  (select count(*)::int from public.briefings b
    where b.requested_by is null and exists(
      select 1 from public.client_memberships m join public.profiles p on p.id=m.user_id
      where m.client_id=b.client_id and m.user_id=b.created_by and p.role='client')),
  0,'Every briefing created by one of its client''s people names a requester');
select is(
  (select count(*)::int from public.briefings b join public.profiles p on p.id=b.requested_by
    where p.role<>'client'),
  0,'No briefing names a studio or designer account as its requester');

-- client_team: the client's own people and the studio see the active client people with their
-- emails; another client's person and a designer see nobody; removed people and designers never appear.
select pg_temp.act_as('sabre-person');
set local role authenticated;
select is(
  (select count(*)::int from public.client_team(pg_temp.context('sabre'))
    where user_id in (pg_temp.context('sabre-person'),pg_temp.context('teammate'),
      pg_temp.context('quiet'),pg_temp.context('leaving'))),
  4,'A SABRE person sees every active SABRE person');
select is(
  (select email from public.client_team(pg_temp.context('sabre')) where user_id=pg_temp.context('teammate')),
  'teammate@client-team.test','Teammates see each other''s sign-in email');
select is(
  (select count(*)::int from public.client_team(pg_temp.context('sabre'))
    where user_id in (pg_temp.context('former'),pg_temp.context('designer'))),
  0,'A removed person and a designer are never part of a team');
select pg_temp.act_as('acme-person');
select is_empty($$select 1 from public.client_team(pg_temp.context('sabre'))$$,
  'Another client''s person receives nobody');
select pg_temp.act_as('designer');
select is_empty($$select 1 from public.client_team(pg_temp.context('sabre'))$$,
  'A designer receives nobody');
select pg_temp.act_as('agency');
select is(
  (select display_name from public.client_team(pg_temp.context('sabre')) where user_id=pg_temp.context('teammate')),
  'Tess Teammate','The studio sees a client''s people');
reset role;

-- save_briefing for a client person: the first save names them, a teammate's later edit keeps
-- it, and a client person cannot name someone else.
select pg_temp.act_as('sabre-person');
set local role authenticated;
insert into client_team_context
  select 'first-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: first save');
select is((select requested_by from public.briefings where id=pg_temp.context('first-briefing')),
  pg_temp.context('sabre-person'),'The person who first saves a briefing becomes its requester');
select pg_temp.act_as('teammate');
select lives_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: edited by a teammate',
    p_briefing_id:=pg_temp.context('first-briefing'),
    p_expected_updated_at:=(select updated_at from public.briefings where id=pg_temp.context('first-briefing')))$$,
  'A teammate edits the draft');
select is((select title from public.briefings where id=pg_temp.context('first-briefing')),
  'Client team: edited by a teammate','The teammate''s edit is saved');
select is((select requested_by from public.briefings where id=pg_temp.context('first-briefing')),
  pg_temp.context('sabre-person'),'A teammate''s later edit keeps the requester');
insert into client_team_context
  select 'teammate-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: naming someone else',
    p_requested_by:=pg_temp.context('sabre-person'));
select is((select requested_by from public.briefings where id=pg_temp.context('teammate-briefing')),
  pg_temp.context('teammate'),'A client person cannot name someone else as the requester');
reset role;

-- save_briefing for the studio: its choice is validated, a client with several people needs one,
-- a client with exactly one person gets that person, and a client with nobody stays empty.
select pg_temp.act_as('agency');
set local role authenticated;
insert into client_team_context
  select 'studio-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: filed by the studio',
    p_requested_by:=pg_temp.context('teammate'));
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: nobody named')$$,
  'P0001','Choose who requested this briefing','The studio must name a requester when the client has several people');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: wrong client',
    p_requested_by:=pg_temp.context('acme-person'))$$,
  'P0001','Choose a person from this client as the requester','Another client''s person cannot be the requester');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: a designer',
    p_requested_by:=pg_temp.context('designer'))$$,
  'P0001','Choose a person from this client as the requester','A designer cannot be the requester, even with a membership row');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: removed',
    p_requested_by:=pg_temp.context('former'))$$,
  'P0001','Choose a person from this client as the requester','A removed person cannot be the requester');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: the studio',
    p_requested_by:=pg_temp.context('agency'))$$,
  'P0001','Choose a person from this client as the requester','The studio cannot name itself');
insert into client_team_context
  select 'solo-briefing',public.save_briefing(pg_temp.context('solo'),'social','Client team: one person');
insert into client_team_context
  select 'empty-briefing',public.save_briefing(pg_temp.context('empty'),'social','Client team: nobody yet');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('studio-briefing')),
  pg_temp.context('teammate'),'The studio''s choice of requester is saved');
select is((select created_by from public.briefings where id=pg_temp.context('studio-briefing')),
  pg_temp.context('agency'),'The studio stays the briefing''s creator');
select is((select requested_by from public.briefings where id=pg_temp.context('solo-briefing')),
  pg_temp.context('solo-person'),'A client with exactly one person names that person');
select ok((select requested_by is null from public.briefings where id=pg_temp.context('empty-briefing')),
  'A briefing for a client with nobody has no requester');

-- The first client person to save a briefing the studio filed for nobody becomes its requester.
insert into public.client_memberships(client_id,user_id) values(pg_temp.context('empty'),pg_temp.context('newcomer'));
select pg_temp.act_as('newcomer');
set local role authenticated;
select lives_ok($$select public.save_briefing(pg_temp.context('empty'),'social','Client team: picked up',
    p_briefing_id:=pg_temp.context('empty-briefing'),
    p_expected_updated_at:=(select updated_at from public.briefings where id=pg_temp.context('empty-briefing')))$$,
  'A newly invited person saves the studio''s draft');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('empty-briefing')),
  pg_temp.context('newcomer'),'The first client person to save it becomes its requester');

-- set_briefing_requester: the studio only, validated like its first choice, and audited.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('quiet'))$$,
  'The studio changes a briefing''s requester');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('acme-person'))$$,
  'P0001','Choose a person from this client as the requester','The change is validated like the first choice');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),null)$$,
  'P0001','Choose a person from this client as the requester','The studio cannot clear the requester');
select pg_temp.act_as('sabre-person');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('sabre-person'))$$,
  '42501',null,'A client person cannot change the requester');
select pg_temp.act_as('designer');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('sabre-person'))$$,
  '42501',null,'A designer cannot change the requester');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('first-briefing')),
  pg_temp.context('quiet'),'The changed requester is stored');
select isnt_empty($$select 1 from private.audit_events
    where event='briefing.requester_changed' and entity_id=pg_temp.context('first-briefing')$$,
  'Changing the requester is audited');

-- review_publication records who decided.
insert into public.projects(id,client_id,briefing_id,title,service_type)
  values(pg_temp.context('project'),pg_temp.context('sabre'),pg_temp.context('studio-briefing'),
    'Client team: reviewed project','social');
insert into public.deliverables(id,project_id,name,format,width,height,quantity,scope,sort_order)
  values(pg_temp.context('deliverable'),pg_temp.context('project'),'Campaign square','square',1080,1080,1,'original',0);
insert into public.published_versions(id,project_id,deliverable_id,version_number)
  values(pg_temp.context('publication'),pg_temp.context('project'),pg_temp.context('deliverable'),1);
insert into public.publication_reviews(publication_id,project_id)
  values(pg_temp.context('publication'),pg_temp.context('project'));
select pg_temp.act_as('teammate');
set local role authenticated;
select lives_ok($$select public.review_publication(pg_temp.context('publication'),'approved','')$$,
  'A teammate approves the version');
reset role;
select is((select reviewed_by from public.publication_reviews where publication_id=pg_temp.context('publication')),
  pg_temp.context('teammate'),'The review records the person who decided');
select ok((select reviewed_at is not null from public.publication_reviews where publication_id=pg_temp.context('publication')),
  'The review records when they decided');

-- set_client_notifications: only the person, only for a client they belong to.
select pg_temp.act_as('quiet');
set local role authenticated;
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  'A person switches on all activity at their client');
select is((select notify_all from public.client_memberships
    where client_id=pg_temp.context('sabre') and user_id=pg_temp.context('quiet')),
  true,'A person reads their own choice back');
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),false)$$,
  'A person switches back to My requests');
select throws_ok($$select public.set_client_notifications(pg_temp.context('sabre'),null)$$,
  '22023',null,'A choice is required');
select throws_ok($$select public.set_client_notifications(pg_temp.context('acme'),true)$$,
  '42501',null,'A person cannot choose for a client they do not belong to');
select pg_temp.act_as('agency');
select throws_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  '42501',null,'The studio cannot choose for a client''s people');
reset role;
select is((select notify_all from public.client_memberships
    where client_id=pg_temp.context('sabre') and user_id=pg_temp.context('quiet')),
  false,'The choice stays where the person left it');

-- Grants.
select ok(not has_function_privilege('anon','public.client_team(uuid)','execute'),
  'Anonymous callers cannot read a client''s people');
select ok(not has_function_privilege('anon','public.set_briefing_requester(uuid,uuid)','execute'),
  'Anonymous callers cannot change a requester');
select ok(not has_function_privilege('anon','public.set_client_notifications(uuid,boolean)','execute'),
  'Anonymous callers cannot change a notification choice');
select ok(has_function_privilege('authenticated',
    'public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid)','execute'),
  'Signed-in callers can still save briefings');
select ok(has_function_privilege('authenticated',
    'public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid)','execute'),
  'Signed-in callers can still save briefing revisions');
select ok(not has_function_privilege('authenticated','private.is_active_client_person(uuid,uuid)','execute'),
  'The membership helper stays inside the database');

select * from finish();
rollback;
