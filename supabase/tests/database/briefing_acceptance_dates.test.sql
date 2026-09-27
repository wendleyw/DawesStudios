begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Fixture: an existing client's credit account with plenty of balance, and the seeded agency
-- profile that creates every briefing below. Picking the highest balance keeps this independent of
-- which clients a given seed/demo overlay happens to include.
select set_config('test.client',(select client_id::text from public.credit_accounts order by balance desc limit 1),true);
select set_config('test.agency',(select id::text from public.profiles where role='agency' limit 1),true);
select set_config('test.original_timezone',(select timezone from public.workspace_settings where id=1),true);

-- Etc/GMT+12 has a fixed, year-round 12-hour offset behind UTC (no DST to fight), so it is a
-- reliably distinct workspace timezone regardless of when this suite runs. `now()` is stable for
-- the whole transaction in Postgres, so `test.local_today` below and `accept_briefing`'s own
-- `studio_today` computation later in this same transaction always agree — the proof does not
-- depend on which wall-clock hour the suite happens to execute at.
update public.workspace_settings set timezone='Etc/GMT+12' where id=1;
select set_config('test.local_today',(select (now() at time zone 'Etc/GMT+12')::date::text),true);

-- A budget-confirmed briefing due on the workspace-local today, and a second one whose due date has
-- already passed. Both reuse the exact service/format/question shape seeded elsewhere in this
-- database (service_type='social', format='feed', question 'content'), which is already known to
-- satisfy `validate_briefing_scope`/`validate_service_answers`. `public.briefings` has no
-- authenticated insert policy or grant (writes go through the RPCs only), so these two fixture rows
-- are inserted here, before the role switch below, the same way `supabase/seed.sql` populates them.
insert into public.briefings(id,client_id,title,service_type,status,overview,goals,direction,requested_deliverables,due_date,estimated_credits,confirmed_credits,budget_note,created_by) values
 (md5('dates-test:today')::uuid,current_setting('test.client')::uuid,'Studio-local acceptance fixture','social','budget_confirmed','Fixture briefing for studio-local acceptance.','Prove studio-local start dates.','{"source":"brand_hub","questions":{"content":"I’ll provide the content"}}','[{"name":"Launch post","format":"feed","width":1080,"height":1350,"quantity":1,"scope":"original"}]',current_setting('test.local_today')::date,1,1,'Fixture budget.',current_setting('test.agency')::uuid),
 (md5('dates-test:past-due')::uuid,current_setting('test.client')::uuid,'Past-due acceptance fixture','social','budget_confirmed','Fixture briefing for a past-due acceptance.','Prove past-due acceptance succeeds.','{"source":"brand_hub","questions":{"content":"I’ll provide the content"}}','[{"name":"Launch post","format":"feed","width":1080,"height":1350,"quantity":1,"scope":"original"}]',(current_setting('test.local_today')::date-5),1,1,'Fixture budget.',current_setting('test.agency')::uuid);

select set_config('test.projects_before',(select count(*)::text from public.projects),true);
select set_config('test.ledger_before',(select count(*)::text from public.credit_ledger),true);

select set_config('request.jwt.claim.sub',current_setting('test.agency'),true);
set local role authenticated;

select lives_ok(
  $$select public.accept_briefing(md5('dates-test:today')::uuid)$$,
  'Agency accepts a briefing due on the studio-local today'
);
select set_config('test.today_project',(select id::text from public.projects where briefing_id=md5('dates-test:today')::uuid),true);
select is(
  (select start_date::text from public.projects where id=current_setting('test.today_project')::uuid),
  current_setting('test.local_today'),
  'The created project starts on the workspace-local today, not the UTC column default'
);
select is(
  public.accept_briefing(md5('dates-test:today')::uuid),
  current_setting('test.today_project')::uuid,
  'Retrying acceptance of an already-accepted briefing returns the same project (idempotent)'
);

select lives_ok(
  $$select public.accept_briefing(md5('dates-test:past-due')::uuid)$$,
  'Agency accepts a briefing whose due date has already passed'
);
select set_config('test.past_due_project',(select id::text from public.projects where briefing_id=md5('dates-test:past-due')::uuid),true);
select is(
  (select start_date::text from public.projects where id=current_setting('test.past_due_project')::uuid),
  (select due_date::text from public.briefings where id=md5('dates-test:past-due')::uuid),
  'A past-due briefing is accepted with start_date clamped to due_date'
);

select is(
  (select count(*)::int from public.projects where briefing_id=md5('dates-test:today')::uuid),1,
  'Exactly one project exists for the same-day briefing'
);
select is(
  (select count(*)::int from public.credit_ledger where project_id=current_setting('test.today_project')::uuid),1,
  'Exactly one debit exists for the same-day briefing'
);
select is(
  (select count(*)::int from public.projects where briefing_id=md5('dates-test:past-due')::uuid),1,
  'Exactly one project exists for the past-due briefing'
);
select is(
  (select count(*)::int from public.credit_ledger where project_id=current_setting('test.past_due_project')::uuid),1,
  'Exactly one debit exists for the past-due briefing'
);
select is(
  (select count(*)::int from public.projects)-current_setting('test.projects_before')::int,2,
  'Acceptance created exactly two new projects in total, no more'
);
select is(
  (select count(*)::int from public.credit_ledger)-current_setting('test.ledger_before')::int,2,
  'Acceptance created exactly two new ledger rows in total, no more'
);

reset role;
-- accept_briefing(uuid,date) (202609270003 added the optional month); confirm its grants were not
-- narrowed or widened by the replace.
select ok(
  has_function_privilege('authenticated','public.accept_briefing(uuid,date)','execute'),
  'accept_briefing execute grant to authenticated is preserved'
);
select ok(
  not has_function_privilege('anon','public.accept_briefing(uuid,date)','execute'),
  'accept_briefing remains revoked from anon'
);

update public.workspace_settings set timezone=current_setting('test.original_timezone') where id=1;

select * from finish();
rollback;
