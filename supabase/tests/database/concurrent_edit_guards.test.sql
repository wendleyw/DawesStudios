-- A stale settings editor must lose, loudly. Each write here is issued twice against the same
-- revision: the second is the second session, and it is required to change nothing.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;

-- Clients: the surface the defect was measured on.
select set_config('test.client_revision',(select updated_at::text from public.clients where slug='sabre'),true);
with changed as(update public.clients set industry='Session A industry' where slug='sabre' and updated_at=current_setting('test.client_revision')::timestamptz returning id) select is((select count(*)::int from changed),1,'A client save quoting the revision it opened on is applied');
select isnt((select updated_at::text from public.clients where slug='sabre'),current_setting('test.client_revision'),'The client touch trigger moves updated_at on every update');
with changed as(update public.clients set website='https://stale.example' where slug='sabre' and updated_at=current_setting('test.client_revision')::timestamptz returning id) select is((select count(*)::int from changed),0,'A client save quoting a superseded revision is refused');
select is((select industry from public.clients where slug='sabre'),'Session A industry','The refused client save leaves the newer industry intact');
select is((select website from public.clients where slug='sabre'),'https://sabre.example','The refused client save never reaches the column it meant to write');

-- Campaigns: the same shape on the same kind of form.
select set_config('test.campaign_id',(select id::text from public.campaigns order by created_at,id limit 1),true);
select set_config('test.campaign_revision',(select updated_at::text from public.campaigns where id=current_setting('test.campaign_id')::uuid),true);
with changed as(update public.campaigns set description='Session A goal' where id=current_setting('test.campaign_id')::uuid and updated_at=current_setting('test.campaign_revision')::timestamptz returning id) select is((select count(*)::int from changed),1,'A campaign save quoting the revision it opened on is applied');
with changed as(update public.campaigns set title='Stale title' where id=current_setting('test.campaign_id')::uuid and updated_at=current_setting('test.campaign_revision')::timestamptz returning id) select is((select count(*)::int from changed),0,'A campaign save quoting a superseded revision is refused');
select is((select description from public.campaigns where id=current_setting('test.campaign_id')::uuid),'Session A goal','The refused campaign save leaves the newer goal intact');

-- Workspace settings: the revision was already stored, the procedure now reads it.
select set_config('test.workspace_revision',(select updated_at::text from public.workspace_settings where id=1),true);
select lives_ok($$select public.update_workspace_settings('Session A Studio','UTC',current_setting('test.workspace_revision')::timestamptz)$$,'A studio save quoting the revision it opened on is applied');
select throws_ok($$select public.update_workspace_settings('Stale Studio','America/New_York',current_setting('test.workspace_revision')::timestamptz)$$,'PT409','These studio settings changed while you were editing. Reload the page to try again.','A studio save quoting a superseded revision is refused');
select is((select studio_name from public.workspace_settings where id=1),'Session A Studio','The refused studio save leaves the newer name intact');
select lives_ok($$select public.update_workspace_settings('Fixture Studio','UTC')$$,'A caller with no form to quote still writes, unguarded as before');

-- Service presets: the procedure incremented the revision without ever checking one.
select set_config('test.preset_revision',(select revision::text from public.service_presets where service_type='reel'),true);
select is(public.save_service_preset('reel',11,21,15,current_setting('test.preset_revision')::integer),current_setting('test.preset_revision')::integer+1,'A preset save quoting the revision it opened on creates the next one');
select throws_ok($$select public.save_service_preset('reel',99,99,99,current_setting('test.preset_revision')::integer)$$,'PT409','This service preset changed while you were editing. Close and reopen the preset to try again.','A preset save quoting a superseded revision is refused');
select is((select min_credits from public.service_presets where service_type='reel'),11,'The refused preset save leaves the newer numbers intact');
select is((select count(*)::int from public.service_preset_history where service_type='reel' and min_credits=99),0,'The refused preset save appends no history row');
select throws_ok($$select public.save_service_preset('not-a-service',1,2,3)$$,'P0001','Service preset not found','A missing preset is still reported as missing rather than as a conflict');

-- Recreating a function under a new signature creates a new object, which is created with EXECUTE
-- for PUBLIC. Both functions this migration recreated are security definer writes on tenant data,
-- so the grant they end up with is asserted here rather than assumed, and the class is asserted as
-- a whole so the next signature change anywhere in `public` fails a test instead of shipping.
reset role;
select ok(not has_function_privilege('anon','public.update_workspace_settings(text,text,timestamptz)','EXECUTE'),'Anonymous callers cannot execute update_workspace_settings');
select ok(has_function_privilege('authenticated','public.update_workspace_settings(text,text,timestamptz)','EXECUTE'),'Signed-in callers can still execute update_workspace_settings');
select ok(not has_function_privilege('anon','public.save_service_preset(text,integer,integer,integer,integer)','EXECUTE'),'Anonymous callers cannot execute save_service_preset');
select ok(has_function_privilege('authenticated','public.save_service_preset(text,integer,integer,integer,integer)','EXECUTE'),'Signed-in callers can still execute save_service_preset');
select is(
 (select coalesce(string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text),'')
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')),
 '',
 'No security definer function in public is executable anonymously');

select * from finish();
rollback;
