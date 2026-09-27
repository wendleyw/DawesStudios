begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Monthly credits (202609270003_monthly_credits.sql): plans, one-time allowances, extras,
-- transfers, per-month acceptance, moves, settlement, expiry, role access and the migration of the
-- existing balances. Every fixture is created here and rolled back, so nothing depends on the seed
-- or the SABRE demonstration overlay. Months are computed relative to now() in UTC, so the suite
-- does not depend on the month it runs in.
create temporary table mc_context(key text primary key, value uuid);
grant all on mc_context to authenticated, service_role;
insert into mc_context values
  ('agency', md5('mc:agency')::uuid),
  ('client', md5('mc:client')::uuid),
  ('other-client', md5('mc:other-client')::uuid),
  ('designer', md5('mc:designer')::uuid),
  ('client-org', md5('mc:client-org')::uuid),
  ('other-org', md5('mc:other-org')::uuid),
  ('direct-org', md5('mc:direct-org')::uuid),
  ('b-next', md5('mc:b-next')::uuid),
  ('b-explicit', md5('mc:b-explicit')::uuid),
  ('b-nodue', md5('mc:b-nodue')::uuid),
  ('b-past', md5('mc:b-past')::uuid),
  ('b-big', md5('mc:b-big')::uuid),
  ('p-old', md5('mc:p-old')::uuid),
  ('credit-request', md5('mc:credit-request')::uuid);
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from mc_context where key=p_key
$$;
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.context(p_key)::text,true)
$$;
-- The first day of the month `p_offset` months from the current UTC month.
create function pg_temp.m(p_offset integer) returns date language sql as $$
  select (date_trunc('month',now() at time zone 'UTC')+make_interval(months=>p_offset))::date
$$;
create function pg_temp.balance(p_client text,p_offset integer) returns integer language sql as $$
  select balance from public.credit_months where client_id=pg_temp.context(p_client) and month=pg_temp.m(p_offset)
$$;
create function pg_temp.project_of(p_briefing text) returns uuid language sql as $$
  select id from public.projects where briefing_id=pg_temp.context(p_briefing)
$$;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.context('agency'),'mc-agency@fixture.local','{"display_name":"MC Agency"}'),
  (pg_temp.context('client'),'mc-client@fixture.local','{"display_name":"MC Client"}'),
  (pg_temp.context('other-client'),'mc-other@fixture.local','{"display_name":"MC Other"}'),
  (pg_temp.context('designer'),'mc-designer@fixture.local','{"display_name":"MC Designer"}');
update public.profiles set role='agency' where id=pg_temp.context('agency');
update public.profiles set role='designer' where id=pg_temp.context('designer');
insert into public.clients(id,name,slug) values
  (pg_temp.context('client-org'),'MC Client','mc-client'),
  (pg_temp.context('other-org'),'MC Other','mc-other'),
  (pg_temp.context('direct-org'),'MC Direct','mc-direct');
insert into public.client_memberships(client_id,user_id) values
  (pg_temp.context('client-org'),pg_temp.context('client')),
  (pg_temp.context('other-org'),pg_temp.context('other-client'));
insert into public.credit_accounts(client_id) values (pg_temp.context('client-org')),(pg_temp.context('other-org'));
-- Fixtures elsewhere insert a balance straight into credit_accounts; it lands in the current month.
insert into public.credit_accounts(client_id,balance) values (pg_temp.context('direct-org'),30);
select is(pg_temp.balance('direct-org',0),30,'A directly inserted account balance becomes the current month balance');
select is((select kind||':'||amount||':'||month::text from public.credit_ledger where client_id=pg_temp.context('direct-org')),'allocation:30:'||pg_temp.m(0)::text,'A directly inserted balance is recorded as an opening allocation in the same month');

insert into public.briefings(id,client_id,title,service_type,status,overview,goals,direction,requested_deliverables,due_date,estimated_credits,confirmed_credits,budget_note,created_by)
select pg_temp.context(k),pg_temp.context('client-org'),'MC '||k,'social','budget_confirmed','Monthly credits fixture.','Prove monthly credits.',
  '{"source":"brand_hub","questions":{"content":"I’ll provide the content"}}',
  '[{"name":"Launch post","format":"feed","width":1080,"height":1350,"quantity":1,"scope":"original"}]',due,c,c,'Fixture budget.',pg_temp.context('agency')
from (values ('b-next',pg_temp.m(1)+14,10),('b-explicit',null,10),('b-nodue',null,5),('b-past',null,5),('b-big',null,500)) v(k,due,c);

-- 1. Month helpers use UTC month boundaries.
select is(private.month_of('2026-09-30 23:30:00-04'::timestamptz),'2026-10-01'::date,'month_of(timestamptz) uses the UTC month');
select is(private.month_of('2026-09-27'::date),'2026-09-01'::date,'month_of(date) returns the first day of the month');

select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.adjust_credits(pg_temp.context('client-org'),100,'Opening balance','mc:open')$$,'The agency adds opening credits to the current month');
select lives_ok($$select public.adjust_credits(pg_temp.context('other-org'),50,'Opening balance','mc:open-other')$$,'The agency adds opening credits to another client');
reset role;
select is(pg_temp.balance('client-org',0),100,'adjust_credits applies to the current month');
select is((select month from public.credit_ledger where idempotency_key='mc:open'),pg_temp.m(0),'The adjustment is recorded in the current month');

-- 2. Plan resolution.
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.set_credit_plan(pg_temp.context('client-org'),40,pg_temp.m(1))$$,'42501','Agency access required','A client cannot set a plan');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_credit_plan(pg_temp.context('client-org'),40,pg_temp.m(1))$$,'The agency sets a plan from next month');
select lives_ok($$select public.set_credit_plan(pg_temp.context('client-org'),60,pg_temp.m(2)+10)$$,'A plan start inside a month is normalized to its first day');
select throws_ok($$select public.set_credit_plan(pg_temp.context('client-org'),5,pg_temp.m(-1))$$,'22023','Choose the current month or a later one','A plan cannot start in a past month');
reset role;
select is(private.plan_allowance(pg_temp.context('client-org'),pg_temp.m(0)),0,'No plan is in force before its start month');
select is(private.plan_allowance(pg_temp.context('client-org'),pg_temp.m(1)),40,'The first plan is in force from its start month');
select is(private.plan_allowance(pg_temp.context('client-org'),pg_temp.m(2)),60,'The later plan supersedes the earlier one');
select is(private.plan_allowance(pg_temp.context('client-org'),pg_temp.m(6)),60,'The latest plan stays in force');

-- 3. The allowance is granted once and a plan change never rewrites a granted month.
select lives_ok($$select private.ensure_credit_month(pg_temp.context('client-org'),pg_temp.m(1))$$,'ensure_credit_month creates next month');
select lives_ok($$select private.ensure_credit_month(pg_temp.context('client-org'),pg_temp.m(1))$$,'ensure_credit_month is repeatable');
select is(pg_temp.balance('client-org',1),40,'Next month receives its plan allowance');
select is((select count(*)::int from public.credit_ledger where client_id=pg_temp.context('client-org') and month=pg_temp.m(1) and kind='plan_allowance'),1,'The allowance is recorded once');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_credit_plan(pg_temp.context('client-org'),80,pg_temp.m(1))$$,'The agency changes next month''s plan');
reset role;
select is(pg_temp.balance('client-org',1),40,'A plan change does not rewrite a month that received its allowance');
select is((select monthly_credits from public.credit_plans where client_id=pg_temp.context('client-org') and starts_on=pg_temp.m(1)),80,'The plan row itself is updated');

-- 4. Extras.
select pg_temp.act_as('agency');
set local role authenticated;
select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(1),15,'Launch extra','mc:extra-1') as extra_first \gset
select is(public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(1),15,'Launch extra','mc:extra-1')::text,:'extra_first','A replayed extra returns the same entry');
select throws_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(1),20,'Launch extra','mc:extra-1')$$,'P0001','Idempotency key conflicts with a different credit entry','A reused key with a different extra is refused');
select throws_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(-1),5,'Late extra','mc:extra-past')$$,'22023','Choose the current month or a later one','A past month refuses extras');
select throws_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(1),0,'Nothing','mc:extra-zero')$$,'P0001','The amount must be positive','An extra must be positive');
reset role;
select is(pg_temp.balance('client-org',1),55,'The extra is added once');
select is((select kind from public.credit_ledger where idempotency_key='mc:extra-1'),'extra','The extra is recorded as an extra');
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(1),15,'Self-service','mc:extra-client')$$,'42501','Agency access required','A client cannot add extras');
reset role;

-- 5. Transfers between months.
select pg_temp.act_as('agency');
set local role authenticated;
select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(0),pg_temp.m(1),30,'Shift to next month','mc:transfer-1') as transfer_first \gset
select is(public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(0),pg_temp.m(1),30,'Shift to next month','mc:transfer-1')::text,:'transfer_first','A replayed transfer returns the same entry');
select throws_ok($$select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(-1),pg_temp.m(1),5,'From the past','mc:transfer-past')$$,'22023','Choose the current month or a later one','A past month cannot send credits');
select throws_ok($$select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(1),pg_temp.m(-1),5,'To the past','mc:transfer-past-2')$$,'22023','Choose the current month or a later one','A past month cannot receive credits');
select throws_ok($$select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(0),pg_temp.m(1),1000,'Too much','mc:transfer-big')$$,'P0001','insufficient_month_credits','A transfer cannot overdraw the source month');
select throws_ok($$select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(1),pg_temp.m(1),5,'Same month','mc:transfer-same')$$,'P0001','Choose two different months','A transfer needs two months');
select throws_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(12),5,'Too far','mc:extra-far')$$,'22023','Choose a month within the next 11 months','Months beyond the next 11 refuse extras');
select throws_ok($$select public.set_credit_plan(pg_temp.context('client-org'),5,pg_temp.m(12))$$,'22023','Choose a month within the next 11 months','A plan cannot start beyond the next 11 months');
select lives_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(3),1,'Derived key probe','mc:derived:in')$$,'An entry takes a key a transfer would derive');
select throws_ok($$select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(3),pg_temp.m(4),1,'Derived','mc:derived')$$,'P0001','Idempotency key conflicts with a different credit entry','A transfer whose derived key is taken reports a conflict');
select lives_ok($$select public.add_month_extra(pg_temp.context('client-org'),pg_temp.m(3),1,'Derived key probe','mc:derived-move:refund')$$,'An entry takes a key a move would derive');
reset role;
select is(pg_temp.balance('client-org',0),70,'The transfer leaves the source month');
select is(pg_temp.balance('client-org',1),85,'The transfer reaches the target month');
select is((select count(*)::int from public.credit_ledger where idempotency_key like 'mc:transfer-1%'),2,'A transfer writes one out and one in entry');
select is((select balance from public.credit_accounts where client_id=pg_temp.context('client-org')),70,'The account balance mirrors the current month');

-- 6. Acceptance per month.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.accept_briefing(pg_temp.context('b-next'))$$,'A briefing due next month is accepted by default into that month');
select lives_ok($$select public.accept_briefing(pg_temp.context('b-explicit'),pg_temp.m(2))$$,'The agency accepts a briefing into a chosen future month');
select lives_ok($$select public.accept_briefing(pg_temp.context('b-nodue'))$$,'A briefing without a due date is accepted into the current month');
select throws_ok($$select public.accept_briefing(pg_temp.context('b-past'),pg_temp.m(12))$$,'22023','Choose a month within the next 11 months','A month beyond the next 11 refuses an acceptance');
select throws_ok($$select public.accept_briefing(pg_temp.context('b-past'),pg_temp.m(-1))$$,'22023','Choose the current month or a later one','A past month refuses an acceptance');
select throws_ok($$select public.accept_briefing(pg_temp.context('b-big'))$$,'P0001','Insufficient credit balance','An insufficient month balance refuses an acceptance');
select is(public.accept_briefing(pg_temp.context('b-next'),pg_temp.m(2)),pg_temp.project_of('b-next'),'A repeated acceptance returns the same project');
reset role;
select is((select credit_month from public.projects where id=pg_temp.project_of('b-next')),pg_temp.m(1),'The project belongs to its due-date month');
select is((select credit_month from public.projects where id=pg_temp.project_of('b-explicit')),pg_temp.m(2),'The project belongs to the chosen month');
select is((select credit_month from public.projects where id=pg_temp.project_of('b-nodue')),pg_temp.m(0),'The project belongs to the current month');
select is(pg_temp.balance('client-org',1),75,'The due-date month is debited');
select is(pg_temp.balance('client-org',2),50,'The chosen month receives its allowance and is debited');
select is(pg_temp.balance('client-org',0),65,'The current month is debited');
select is((select count(*)::int from public.credit_ledger where project_id=pg_temp.project_of('b-next')),1,'A repeated acceptance debits once');
select is((select month from public.credit_ledger where project_id=pg_temp.project_of('b-next') and kind='project_debit'),pg_temp.m(1),'The debit is recorded in the project month');
select is((select count(*)::int from public.projects where briefing_id in (pg_temp.context('b-past'),pg_temp.context('b-big'))),0,'Refused acceptances create no project');
-- Concurrency: every write locks the client's credit account first and then its month rows in
-- ascending month order, and the balance constraint refuses any negative month balance.
select throws_ok($$update public.credit_months set balance=-1 where client_id=pg_temp.context('client-org') and month=pg_temp.m(0)$$,'23514',null,'A month balance can never go below zero');
select ok(pg_get_functiondef('private.lock_credit_client(uuid)'::regprocedure) ~ 'for update','Credit writes serialize on the client account row');
select ok(pg_get_functiondef('private.ensure_credit_month(uuid,date)'::regprocedure) ~ 'for update','Month rows are locked before they change');

-- 7. Moving a project between months.
select pg_temp.act_as('agency');
set local role authenticated;
select public.move_project_month(pg_temp.project_of('b-next'),pg_temp.m(2),'mc:move-1') as move_first \gset
select is(public.move_project_month(pg_temp.project_of('b-next'),pg_temp.m(2),'mc:move-1')::text,:'move_first','A replayed move returns the same entry');
select throws_ok($$select public.move_project_month(pg_temp.project_of('b-next'),pg_temp.m(-1),'mc:move-past')$$,'22023','Choose the current month or a later one','A project cannot move to a past month');
select throws_ok($$select public.move_project_month(pg_temp.project_of('b-explicit'),pg_temp.m(1),'mc:derived-move')$$,'P0001','Idempotency key conflicts with a different credit entry','A move whose derived key is taken reports a conflict');
select throws_ok($$select public.move_project_month(pg_temp.project_of('b-next'),pg_temp.m(2),'mc:move-same')$$,'P0001','The project is already in this month','A move needs a different month');
reset role;
select is((select credit_month from public.projects where id=pg_temp.project_of('b-next')),pg_temp.m(2),'The project now belongs to the new month');
select is(pg_temp.balance('client-org',1),85,'The open origin month is refunded');
select is(pg_temp.balance('client-org',2),40,'The new month is debited');

-- 8. Expiry is written once. A past month with a leftover and a project charged in it.
insert into public.projects(id,client_id,title,service_type,status,credit_month) values
  (pg_temp.context('p-old'),pg_temp.context('client-org'),'MC old project','social','in_progress',pg_temp.m(-1));
insert into public.credit_months(client_id,month,balance,status) values (pg_temp.context('client-org'),pg_temp.m(-1),7,'open');
insert into public.credit_ledger(client_id,project_id,amount,balance_after,kind,description,idempotency_key,month) values
  (pg_temp.context('client-org'),null,10,10,'adjustment','Last month','mc:prev-leftover',pg_temp.m(-1)),
  (pg_temp.context('client-org'),pg_temp.context('p-old'),-3,7,'project_debit','MC old project','mc:prev-debit',pg_temp.m(-1));
select lives_ok($$select private.expire_credit_months(pg_temp.context('client-org'))$$,'Ended months expire');
select lives_ok($$select private.expire_credit_months(pg_temp.context('client-org'))$$,'Expiry is repeatable');
select is((select status from public.credit_months where client_id=pg_temp.context('client-org') and month=pg_temp.m(-1)),'expired','The ended month is marked expired');
select is(pg_temp.balance('client-org',-1),0,'The leftover leaves the ended month');
select is((select array_agg(amount) from public.credit_ledger where client_id=pg_temp.context('client-org') and kind='expiry'),array[-7],'Exactly one expiry entry records the leftover');

-- 9. Moving a project out of an expired month needs the full charge confirmed.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.move_project_month(pg_temp.context('p-old'),pg_temp.m(0),'mc:move-old')$$,'P0001','The project month has expired; confirm the full charge to move it','An expired origin needs confirmation');
select lives_ok($$select public.move_project_month(pg_temp.context('p-old'),pg_temp.m(0),'mc:move-old',true)$$,'The agency confirms the full charge');
reset role;
select is(pg_temp.balance('client-org',0),62,'The new month is charged in full');
select is((select count(*)::int from public.credit_ledger where project_id=pg_temp.context('p-old') and month=pg_temp.m(-1)),1,'The expired month receives no refund');

-- 10. Final settlement.
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.settle_project_credits(pg_temp.project_of('b-nodue'),8,'Two extra formats','mc:settle-1')$$,'P0001','Settle credits only for an approved or delivered project','An unfinished project cannot be settled');
reset role;
update public.projects set status='approved' where id in (pg_temp.project_of('b-nodue'),pg_temp.project_of('b-explicit'),pg_temp.context('p-old'));
update public.projects set status='delivered' where id=pg_temp.project_of('b-next');
select pg_temp.act_as('agency');
set local role authenticated;
select is((public.settle_project_credits(pg_temp.project_of('b-nodue'),8,'Two extra formats','mc:settle-1')).difference,3,'Extra cost is the final total minus the charged credits');
select is((public.settle_project_credits(pg_temp.project_of('b-nodue'),8,'Two extra formats','mc:settle-1')).charged_month,pg_temp.m(0),'A replayed settlement returns the same result');
select throws_ok($$select public.settle_project_credits(pg_temp.project_of('b-nodue'),9,'Again','mc:settle-again')$$,'P0001','This project is already settled','A project is settled once');
select throws_ok($$select public.settle_project_credits(pg_temp.project_of('b-explicit'),10000,'Huge','mc:settle-big')$$,'P0001','insufficient_month_credits','A short month reports the shortfall');
select throws_ok($$select public.settle_project_credits(pg_temp.context('p-old'),100,'Late','mc:settle-past',pg_temp.m(-1))$$,'22023','Choose the current month or a later one','Extra cost cannot go to a past month');
select is((public.settle_project_credits(pg_temp.project_of('b-explicit'),14,'One more format','mc:settle-2',pg_temp.m(1))).charged_month,pg_temp.m(1),'Extra cost can be charged to a chosen future month');
select throws_ok($$select public.settle_project_credits(pg_temp.project_of('b-explicit'),14,'One more format','mc:settle-2',pg_temp.m(2))$$,'P0001','Idempotency key conflicts with a different credit entry','A replay naming another charge month is refused');
select is((public.settle_project_credits(pg_temp.context('p-old'),3,'Charged as moved','mc:settle-old')).difference,0,'A project moved out of an expired month is charged only in its current month');
select is((public.settle_project_credits(pg_temp.project_of('b-next'),4,'Fewer formats delivered','mc:settle-3')).difference,-6,'A lower final total is a refund');
reset role;
select is(pg_temp.balance('client-org',0),65,'Extra cost and the refund both land in the current month');
select is(pg_temp.balance('client-org',1),81,'The chosen charge month pays the extra cost');
select is((select charged_month from public.project_settlements where project_id=pg_temp.project_of('b-next')),pg_temp.m(0),'The refund goes to the current month, not the project month');
select is((select count(*)::int from public.project_settlements where project_id in (pg_temp.project_of('b-explicit'))),1,'The refused settlement left no row behind');
select is((select count(*)::int from public.credit_ledger where project_id=pg_temp.project_of('b-nodue') and kind='final_adjustment'),1,'A replayed settlement writes one adjustment');
select is((select count(*)::int from public.credit_ledger where project_id=pg_temp.context('p-old') and kind='final_adjustment'),0,'Settling at the moved charge refunds nothing');

-- 11. Existing credit functions keep working on the current month.
insert into public.credit_requests(id,client_id,requested_by,amount,status) values
  (pg_temp.context('credit-request'),pg_temp.context('client-org'),pg_temp.context('client'),25,'pending');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.fulfill_credit_request(pg_temp.context('credit-request'),'Approved')$$,'The agency fulfills a credit request');
select throws_ok($$select public.adjust_credits(pg_temp.context('client-org'),-1000,'Too much','mc:adjust-big')$$,'P0001','Insufficient credit balance','An adjustment cannot overdraw the current month');
reset role;
select is((select kind||':'||month::text from public.credit_ledger where idempotency_key='credit-request:'||pg_temp.context('credit-request')),'extra:'||pg_temp.m(0)::text,'A fulfilled request becomes an extra in the current month');
select is(pg_temp.balance('client-org',0),90,'The fulfilled request adds to the current month');
select is((select balance from public.credit_accounts where client_id=pg_temp.context('client-org')),90,'The account balance still mirrors the current month');

-- 12. Month summary.
select pg_temp.act_as('client');
set local role authenticated;
select is((select row(available,allowance,extras,used,transferred,expiring,expires_on)::text from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(1))),
  row(81,40,15,4,30,81,pg_temp.m(2)-1)::text,'The client reads its month summary');
select is((select row(available,expiring,status)::text from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(-1))),row(0,0,'expired')::text,'An expired month has nothing left to expire');
select is((select row(available,allowance,expiring)::text from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(4))),row(60,60,60)::text,'An untouched future month shows its projected allowance');
select is((select count(*)::int from public.credit_months where client_id=pg_temp.context('client-org') and month=pg_temp.m(4)),0,'Reading a summary writes no month');
select throws_ok($$select * from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(12))$$,'22023','Choose a month within the next 11 months','A summary beyond the next 11 months is refused');
select throws_ok($$select * from public.credit_month_summary(pg_temp.context('other-org'),pg_temp.m(0))$$,'42501','Client access required','A client cannot read another client''s summary');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_credit_plan(pg_temp.context('client-org'),70,pg_temp.m(4))$$,'The agency sets a plan for a month a client already viewed');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select is((select allowance from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(4))),70,'A viewed month still takes the later plan');

-- 13. Role access.
select is((select count(*)::int from public.credit_months where client_id<>pg_temp.context('client-org')),0,'A client reads only its own months');
select ok((select count(*)::int from public.credit_months)>0,'A client reads its months');
select is((select count(*)::int from public.credit_plans),3,'A client reads its own plans');
select throws_ok($$select created_by from public.credit_plans$$,'42501',null,'A client cannot read who set a plan');
select is((select count(*)::int from public.project_settlements),4,'A client reads its own settlements');
select is((select count(*)::int from public.credit_ledger where client_id<>pg_temp.context('client-org')),0,'A client reads only its own ledger');
select throws_ok($$insert into public.credit_months(client_id,month,balance) values (pg_temp.context('client-org'),pg_temp.m(5),999)$$,'42501',null,'A client cannot write month balances');
select throws_ok($$update public.credit_plans set monthly_credits=999$$,'42501',null,'A client cannot change a plan');
select throws_ok($$select public.transfer_month_credits(pg_temp.context('client-org'),pg_temp.m(0),pg_temp.m(1),5,'Self-service','mc:transfer-client')$$,'42501','Agency access required','A client cannot transfer credits');
select throws_ok($$select public.move_project_month(pg_temp.project_of('b-explicit'),pg_temp.m(3),'mc:move-client')$$,'42501','Agency access required','A client cannot move a project');
select throws_ok($$select public.settle_project_credits(pg_temp.project_of('b-explicit'),1,'Self-service','mc:settle-client')$$,'42501','Agency access required','A client cannot settle a project');
reset role;
select pg_temp.act_as('other-client');
set local role authenticated;
select is((select count(*)::int from public.project_settlements),0,'Another client reads none of these settlements');
select is((select count(*)::int from public.credit_plans),0,'Another client reads none of these plans');
reset role;
select pg_temp.act_as('designer');
set local role authenticated;
select is((select count(*)::int from public.credit_months),0,'A designer reads no months');
select is((select count(*)::int from public.credit_plans),0,'A designer reads no plans');
select is((select count(*)::int from public.project_settlements),0,'A designer reads no settlements');
select is((select count(*)::int from public.credit_ledger),0,'A designer reads no ledger');
select throws_ok($$select * from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(0))$$,'42501','Client access required','A designer cannot read a summary');
reset role;
set local role anon;
select throws_ok($$select * from public.credit_month_summary(pg_temp.context('client-org'),pg_temp.m(0))$$,'42501',null,'Anonymous callers cannot read a summary');
reset role;

-- 14. Migration and invariants.
select ok(not exists(
  select 1 from public.credit_months m where m.balance<>(select coalesce(sum(l.amount),0) from public.credit_ledger l where l.client_id=m.client_id and l.month=m.month)
),'Every month balance reconciles with its ledger entries');
select ok(not exists(
  select 1 from public.credit_accounts a where exists(select 1 from public.credit_ledger l where l.client_id=a.client_id and l.created_at<'2026-09-28')
    and not exists(select 1 from public.credit_months m where m.client_id=a.client_id and m.month='2026-09-01')
),'Balances held before monthly credits migrated into September 2026');
select ok(not exists(
  select 1 from public.projects p where p.briefing_id is not null and p.credit_month is null
),'Every accepted project has a credit month');
select ok(not exists(
  select 1 from public.projects p join public.credit_ledger l on l.project_id=p.id and l.idempotency_key like 'briefing:%'
  where p.id not in (pg_temp.project_of('b-next'),pg_temp.context('p-old')) and p.credit_month<>l.month
),'An unmoved project belongs to the month of its acceptance debit');

select * from finish();
rollback;
