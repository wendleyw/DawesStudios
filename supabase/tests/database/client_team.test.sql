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

-- ---------------------------------------------------------------------------------------------
-- Notification routing (private.notify_client) and removal (remove_client_member).
-- Blair belongs to SABRE and Acme. The routed project is the SABRE person's; the orphan project has
-- no briefing; Blair asked for the third.
-- ---------------------------------------------------------------------------------------------
insert into client_team_context values
  ('both',md5('client-team:both')::uuid),
  ('routed-briefing',md5('client-team:routed-briefing')::uuid),
  ('routed-project',md5('client-team:routed-project')::uuid),
  ('orphan-project',md5('client-team:orphan-project')::uuid),
  ('gone-briefing',md5('client-team:gone-briefing')::uuid),
  ('gone-project',md5('client-team:gone-project')::uuid);
insert into auth.users(id,email,raw_user_meta_data)
  values(pg_temp.context('both'),'both@client-team.test','{"display_name":"Blair Both"}');
insert into public.client_memberships(client_id,user_id) values
  (pg_temp.context('sabre'),pg_temp.context('both')),
  (pg_temp.context('acme'),pg_temp.context('both'));
insert into public.briefings(id,client_id,service_type,title,created_by,requested_by) values
  (pg_temp.context('routed-briefing'),pg_temp.context('sabre'),'social','Client team: routed',
    pg_temp.context('sabre-person'),pg_temp.context('sabre-person')),
  (pg_temp.context('gone-briefing'),pg_temp.context('sabre'),'social','Client team: requester leaves',
    pg_temp.context('both'),pg_temp.context('both'));
insert into public.projects(id,client_id,briefing_id,title,service_type) values
  (pg_temp.context('routed-project'),pg_temp.context('sabre'),pg_temp.context('routed-briefing'),
    'Client team: routed project','social'),
  (pg_temp.context('orphan-project'),pg_temp.context('sabre'),null,
    'Client team: project without a briefing','social'),
  (pg_temp.context('gone-project'),pg_temp.context('sabre'),pg_temp.context('gone-briefing'),
    'Client team: requester left','social');
-- Notifications written inside this transaction only: now() is the transaction's start time.
create function pg_temp.notified(p_key text,p_title text) returns integer language sql as $$
  select count(*)::int from public.notifications
  where user_id=pg_temp.context(p_key) and title=p_title and created_at>=now()
$$;
-- A SABRE update about one project, as the current JWT subject. Called with the role reset: the
-- function is private to the database.
create function pg_temp.notify(p_project text,p_title text) returns void language sql as $$
  select private.notify_client(pg_temp.context('sabre'),pg_temp.context(p_project),p_title,'')
$$;

-- 1. A project update reaches its requester, not the rest of the team.
select pg_temp.act_as('agency');
select pg_temp.notify('routed-project','Client team: requester only');
select is(pg_temp.notified('sabre-person','Client team: requester only'),1,'A project update reaches its requester');
select is(pg_temp.notified('teammate','Client team: requester only'),0,'A teammate who did not ask is not notified');

-- 2. Someone who switched on all activity hears about every project.
select pg_temp.act_as('teammate');
set local role authenticated;
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  'Tess switches on all SABRE activity');
reset role;
select pg_temp.act_as('agency');
select pg_temp.notify('routed-project','Client team: all activity');
select is(pg_temp.notified('teammate','Client team: all activity'),1,'All activity reaches every project');
select is(pg_temp.notified('quiet','Client team: all activity'),0,'My requests does not');

-- 3. A studio reply in the client conversation also reaches the client people who wrote there.
select pg_temp.act_as('quiet');
set local role authenticated;
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','A question from Quinn.')$$,
  'Quinn writes in the project''s client conversation');
select pg_temp.act_as('both');
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','A note from Blair.')$$,
  'Blair writes there too');
select pg_temp.act_as('agency');
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','The studio answers.')$$,
  'The studio replies');
reset role;
select is(pg_temp.notified('quiet','New message from Studio'),1,'A studio reply reaches a person who wrote in the conversation');
select is(pg_temp.notified('sabre-person','New message from Studio'),1,'It reaches the requester');
select is(pg_temp.notified('leaving','New message from Studio'),0,'It does not reach a teammate who never wrote there');

-- 4. A project with no briefing reaches every person; removed people and designers never.
select pg_temp.act_as('agency');
select pg_temp.notify('orphan-project','Client team: no briefing');
select is(
  (select sum(pg_temp.notified(k,'Client team: no briefing'))::int
    from unnest(array['sabre-person','teammate','quiet','leaving','both']) k),
  5,'A project with no requester reaches every person');
select is(pg_temp.notified('former','Client team: no briefing'),0,'A removed person is never notified');
select is(pg_temp.notified('designer','Client team: no briefing'),0,'A designer is never notified as a client person');

-- 5. Removing Blair, who also belongs to Acme, removes only the SABRE membership.
insert into public.notifications(user_id,client_id,title)
  values(pg_temp.context('both'),pg_temp.context('acme'),'Client team: Acme note');
select pg_temp.act_as('agency');
set local role authenticated;
select is(public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('both')),false,
  'Removing someone who belongs to another client removes only this membership');
reset role;
select is((select count(*)::int from public.client_memberships where user_id=pg_temp.context('both')),1,
  'Blair keeps Acme');
select ok((select removed_at is null from public.profiles where id=pg_temp.context('both')),
  'Blair keeps their login');
select is(pg_temp.notified('both','Client team: no briefing'),0,'Their SABRE notifications are deleted');
select is(pg_temp.notified('both','Client team: Acme note'),1,'Their Acme notifications stay');

-- 6. The requester has left: every person is notified, and someone who wrote before leaving no
-- longer hears the studio's replies.
select pg_temp.act_as('agency');
select pg_temp.notify('gone-project','Client team: requester left');
select is(
  (select sum(pg_temp.notified(k,'Client team: requester left'))::int
    from unnest(array['sabre-person','teammate','quiet','leaving']) k),
  4,'When the requester has left, every person is notified');
select is(pg_temp.notified('both','Client team: requester left'),0,'The former requester is not');
set local role authenticated;
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','Another answer.')$$,
  'The studio replies again');
reset role;
select is(pg_temp.notified('both','New message from Studio'),0,
  'Someone who wrote before leaving the client is not notified');

-- 7. A client-wide update (no project) reaches every person.
select pg_temp.act_as('agency');
select private.notify_client(pg_temp.context('sabre'),null,'Client team: client-wide','');
select is(
  (select sum(pg_temp.notified(k,'Client team: client-wide'))::int
    from unnest(array['sabre-person','teammate','quiet','leaving']) k),
  4,'A client-wide update reaches every person');

-- 8. The person who acted is never notified.
select pg_temp.act_as('sabre-person');
select pg_temp.notify('routed-project','Client team: own action');
select is(pg_temp.notified('sabre-person','Client team: own action'),0,'The actor is never notified');
select is(pg_temp.notified('teammate','Client team: own action'),1,'Others still are, as their choice says');

-- 9. remove_client_member: the studio only, a client person only, a member only.
select pg_temp.act_as('sabre-person');
set local role authenticated;
select throws_ok($$select public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving'))$$,
  '42501',null,'A client person cannot remove anyone');
select pg_temp.act_as('designer');
select throws_ok($$select public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving'))$$,
  '42501',null,'A designer cannot remove anyone');
select pg_temp.act_as('agency');
select throws_ok($$select public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('designer'))$$,
  'P0001','Target is not a client person','A studio or designer account is not removed through a client');
select throws_ok($$select public.remove_client_member(pg_temp.context('acme'),pg_temp.context('leaving'))$$,
  'P0001','This person is not a member of this client','A person is removed only from a client they belong to');

-- 10. Riley's last client: the account is deactivated and waits for the route to block sign-in.
select is(public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving')),true,
  'Removing someone''s last client deactivates their account');
select is((select count(*)::int from public.client_team(pg_temp.context('sabre'))
    where user_id=pg_temp.context('leaving')),0,'They leave the team at once');
select is(public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving')),true,
  'A retry still asks the route to finish blocking sign-in');
reset role;
select ok((select removed_at is not null from public.profiles where id=pg_temp.context('leaving')),
  'The account is marked removed');
select is((select count(*)::int from public.notifications where user_id=pg_temp.context('leaving')),0,
  'Their notifications are deleted');
select is((select count(*)::int from public.client_memberships
    where client_id=pg_temp.context('sabre') and user_id=pg_temp.context('leaving')),1,
  'The membership stays as the record of the pending removal');
select is((select count(*)::int from private.audit_events
    where event='client_member.removed' and entity_id=pg_temp.context('leaving')),1,
  'A retry writes no second audit event');
select pg_temp.act_as('leaving');
set local role authenticated;
select is(private.is_client_member(pg_temp.context('sabre')),false,
  'A removed person''s existing token loses client access');
reset role;
select ok(not has_function_privilege('anon','public.remove_client_member(uuid,uuid)','execute'),
  'Anonymous callers cannot remove anyone');

-- ---------------------------------------------------------------------------------------------
-- Final-review fixes: a requester-only update must not re-run the briefing scope triggers, and a
-- studio save must not keep a departed person as the requester.
-- A SABRE campaign for a submittable briefing, and a two-person "duo" client for the one-remaining-
-- person default.
-- ---------------------------------------------------------------------------------------------
insert into client_team_context values
  ('campaign',md5('client-team:campaign')::uuid),
  ('duo',md5('client-team:duo-client')::uuid),
  ('duo-departed',md5('client-team:duo-departed')::uuid),
  ('duo-remaining',md5('client-team:duo-remaining')::uuid),
  ('trio-briefing',md5('client-team:trio-briefing')::uuid);
insert into public.campaigns(id,client_id,title)
  values(pg_temp.context('campaign'),pg_temp.context('sabre'),'Client team: campaign');
insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.context('duo-departed'),'duo-departed@client-team.test','{"display_name":"Devon Departed"}'),
  (pg_temp.context('duo-remaining'),'duo-remaining@client-team.test','{"display_name":"Remy Remaining"}');
insert into public.clients(id,name,slug)
  values(pg_temp.context('duo'),'Client team duo fixture','client-team-duo-fixture');
insert into public.client_memberships(client_id,user_id) values
  (pg_temp.context('duo'),pg_temp.context('duo-departed')),
  (pg_temp.context('duo'),pg_temp.context('duo-remaining'));

-- Group 2: a fully valid, submitted SABRE briefing, so both scope triggers now validate every
-- update to it.
select pg_temp.act_as('sabre-person');
set local role authenticated;
insert into client_team_context
  select 'submitted-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: submitted',
    p_campaign_id:=pg_temp.context('campaign'),
    p_overview:='Keep the requester guard covered end to end.',
    p_direction:='{"questions":{"content":"Please help create it"}}'::jsonb,
    p_deliverables:='[{"name":"Launch post","scope":"original","width":1080,"format":"feed","height":1350,"quantity":1}]'::jsonb);
select lives_ok($$select public.submit_briefing(pg_temp.context('submitted-briefing'))$$,
  'The briefing is submitted, so both scope triggers now validate every update to it');
reset role;

-- The requester change itself: succeeds despite the triggers, and never touches updated_at.
select set_config('client_team.moment',
  (select updated_at::text from public.briefings where id=pg_temp.context('submitted-briefing')),true);
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok(
  $$select public.set_briefing_requester(pg_temp.context('submitted-briefing'),pg_temp.context('quiet'))$$,
  'The studio changes the requester on a submitted briefing despite the scope triggers');
select is((select requested_by from public.briefings where id=pg_temp.context('submitted-briefing')),
  pg_temp.context('quiet'),'The new requester is recorded');
select is((select updated_at::text from public.briefings where id=pg_temp.context('submitted-briefing')),
  current_setting('client_team.moment'),'set_briefing_requester leaves updated_at unchanged');
reset role;

-- As the postgres test role: make the briefing's scope invalid without either trigger seeing it
-- (mirrors 202609250002_client_team.sql's own backfill pattern), then prove a requester-only
-- change still succeeds, because it never re-validates scope.
alter table public.briefings disable trigger validate_submitted_briefing_scope;
alter table public.briefings disable trigger validate_submitted_service_answers;
update public.briefings set requested_deliverables='[]'::jsonb
  where id=pg_temp.context('submitted-briefing');
alter table public.briefings enable trigger validate_submitted_briefing_scope;
alter table public.briefings enable trigger validate_submitted_service_answers;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok(
  $$select public.set_briefing_requester(pg_temp.context('submitted-briefing'),pg_temp.context('sabre-person'))$$,
  'A requester change still succeeds even though the briefing''s scope is now invalid');
reset role;

-- A client's open draft is unaffected by a requester change elsewhere: save_briefing's own
-- optimistic-concurrency check sees no conflict, because the requester change left updated_at alone.
select pg_temp.act_as('duo-departed');
set local role authenticated;
insert into client_team_context
  select 'duo-briefing',public.save_briefing(pg_temp.context('duo'),'social','Client team: duo before departure');
insert into client_team_context
  select 'duo-departed-briefing',public.save_briefing(pg_temp.context('duo'),'social','Client team: duo departs');
reset role;
select set_config('client_team.moment',
  (select updated_at::text from public.briefings where id=pg_temp.context('duo-briefing')),true);
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok(
  $$select public.set_briefing_requester(pg_temp.context('duo-briefing'),pg_temp.context('duo-remaining'))$$,
  'The studio reassigns the duo briefing''s requester');
reset role;
select pg_temp.act_as('duo-remaining');
set local role authenticated;
select lives_ok($$select public.save_briefing(pg_temp.context('duo'),'social','Client team: still editing',
    p_briefing_id:=pg_temp.context('duo-briefing'),
    p_expected_updated_at:=current_setting('client_team.moment')::timestamptz)$$,
  'A client save with the briefing''s previous p_expected_updated_at still succeeds after a requester change');
reset role;

-- Group 4: a studio save without p_requested_by treats a departed stored requester as absent.
update public.profiles set removed_at=now() where id=pg_temp.context('duo-departed');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.save_briefing(pg_temp.context('duo'),'social','Client team: duo departs',
    p_briefing_id:=pg_temp.context('duo-departed-briefing'),
    p_expected_updated_at:=(select updated_at from public.briefings where id=pg_temp.context('duo-departed-briefing')))$$,
  'The studio saves a briefing whose stored requester has left, without naming anyone');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('duo-departed-briefing')),
  pg_temp.context('duo-remaining'),
  'With exactly one remaining active person, the departed requester is replaced by that person');

-- With several remaining active people (SABRE still has three: sabre-person, teammate and quiet),
-- the studio must choose again once the stored requester has left.
insert into public.briefings(id,client_id,service_type,title,created_by,requested_by)
  values(pg_temp.context('trio-briefing'),pg_temp.context('sabre'),'social',
    'Client team: trio requester left',pg_temp.context('sabre-person'),pg_temp.context('former'));
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok(
  $$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: trio requester left',
      p_briefing_id:=pg_temp.context('trio-briefing'),
      p_expected_updated_at:=(select updated_at from public.briefings where id=pg_temp.context('trio-briefing')))$$,
  'P0001','Choose who requested this briefing',
  'With several remaining active people, the studio must choose again once the requester left');
reset role;

-- (Optional) a person who is both the requester and notify_all is still notified exactly once.
select pg_temp.act_as('sabre-person');
set local role authenticated;
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  'The requester also switches on all SABRE activity');
reset role;
select pg_temp.act_as('agency');
select pg_temp.notify('routed-project','Client team: requester and all activity');
select is(pg_temp.notified('sabre-person','Client team: requester and all activity'),1,
  'A person who is both the requester and notify_all is notified exactly once');

select * from finish();
rollback;
