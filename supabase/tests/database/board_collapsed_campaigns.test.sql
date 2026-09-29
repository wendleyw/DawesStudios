begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create temporary table fold_fixture(key text primary key,value uuid);
grant select on fold_fixture to authenticated, anon;
insert into fold_fixture select name,md5('board-fold:'||name)::uuid
from unnest(array['agency','client','outsider','client-org','other-org','campaign','campaign-2',
 'other-campaign']) name;
create function pg_temp.k(p_key text) returns uuid language sql as $$
 select value from fold_fixture where key=p_key
$$;
create function pg_temp.actor(p_key text) returns text language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.k(p_key)::text,true)
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.k(name),'fold-'||name||'@fixture.local',jsonb_build_object('display_name',name)
from unnest(array['agency','client','outsider']) name;
update profiles set role='agency' where id=pg_temp.k('agency');
insert into clients(id,name,slug) values
 (pg_temp.k('client-org'),'Fold fixture','fold-fixture'),
 (pg_temp.k('other-org'),'Other fixture','fold-other');
insert into client_memberships(client_id,user_id) values(pg_temp.k('client-org'),pg_temp.k('client'));
insert into client_memberships(client_id,user_id) values(pg_temp.k('other-org'),pg_temp.k('outsider'));
insert into campaigns(id,client_id,title) values
 (pg_temp.k('campaign'),pg_temp.k('client-org'),'Spring'),
 (pg_temp.k('campaign-2'),pg_temp.k('client-org'),'Summer'),
 (pg_temp.k('other-campaign'),pg_temp.k('other-org'),'Elsewhere');

select pg_temp.actor('agency'); set local role authenticated;
select is(set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('campaign'),true),
 array[pg_temp.k('campaign')],'The agency folds a campaign');
select is(set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('campaign'),true),
 array[pg_temp.k('campaign')],'Folding again keeps one entry');
select is(set_board_campaign_collapsed(pg_temp.k('client-org'),null,true),
 array[pg_temp.k('campaign'),'00000000-0000-0000-0000-000000000000'::uuid],
 'The Studio projects frame folds as the all-zero id');
select is(set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('campaign'),false),
 array['00000000-0000-0000-0000-000000000000'::uuid],'Unfolding removes only that campaign');
select throws_ok($$select set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('other-campaign'),true)$$,
 '22023',null,'Another client''s campaign is refused');
select throws_ok($$update board_preferences set collapsed_campaigns=array[pg_temp.k('other-campaign')]$$,
 '42501',null,'The column is only written through the function');
select is((select active_view from board_preferences where user_id=pg_temp.k('agency')),null,
 'Folding leaves the chosen view alone');
reset role;

select pg_temp.actor('client'); set local role authenticated;
select is(set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('campaign-2'),true),
 array[pg_temp.k('campaign-2')],'A client folds independently of the agency');
select is((select count(*)::int from board_preferences),1,'A client reads only their own folds');
reset role;

select pg_temp.actor('outsider'); set local role authenticated;
select throws_ok($$select set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('campaign'),true)$$,
 '42501',null,'A person from another client cannot fold this board');
reset role;

set local role anon;
select throws_ok($$select set_board_campaign_collapsed(pg_temp.k('client-org'),pg_temp.k('campaign'),true)$$,
 '42501',null,'Anonymous users cannot fold');
reset role;
select ok(not has_function_privilege('anon','public.set_board_campaign_collapsed(uuid,uuid,boolean)','EXECUTE'),
 'Anonymous execute permission is revoked');
select * from finish();
rollback;
