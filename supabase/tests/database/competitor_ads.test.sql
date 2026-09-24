begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- The agency writes.
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$insert into public.competitors(client_id,name,website,meta_page_id,google_advertiser_id,tiktok_advertiser) values (md5('dawes:client-org-1')::uuid,'Rival Co','https://rival.example','123456789','AR01234567890123456789','Rival Official')$$,'Agency adds a competitor');
select is((select created_by from public.competitors where name='Rival Co'),md5('dawes:agency')::uuid,'The author is the session');
select lives_ok($$insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-1')::uuid,'competitor_ads')$$,'Agency places the widget');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'rival co')$$,'23505',null,'Names are unique per client, ignoring case');
select lives_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-2')::uuid,'Rival Co')$$,'Another client may follow the same name');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,' Padded')$$,'23514',null,'Untrimmed names are refused');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'')$$,'23514',null,'Empty names are refused');
select throws_ok($$insert into public.competitors(client_id,name,website) values (md5('dawes:client-org-1')::uuid,'Bad site','javascript:alert(1)')$$,'23514',null,'Only http(s) websites are accepted');
select throws_ok($$insert into public.competitors(client_id,name,meta_page_id) values (md5('dawes:client-org-1')::uuid,'Bad page','12ab')$$,'23514',null,'Page IDs are digits');
select throws_ok($$insert into public.competitors(client_id,name,google_advertiser_id) values (md5('dawes:client-org-1')::uuid,'Bad google','CR123')$$,'23514',null,'Google advertiser IDs start with AR');
select throws_ok($$insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-1')::uuid,'weather')$$,'23514',null,'Unknown widget kinds are refused');
select throws_ok($$update public.competitors set client_id=md5('dawes:client-org-2')::uuid where name='Rival Co' and client_id=md5('dawes:client-org-1')::uuid$$,'42501',null,'A competitor cannot move to another client');
select lives_ok($$update public.competitors set website='https://rival.example/new' where name='Rival Co' and client_id=md5('dawes:client-org-1')::uuid$$,'Agency edits a competitor');

-- The cap: Rival Co is the first; eleven more fill the list, and a thirteenth is refused.
select lives_ok($$insert into public.competitors(client_id,name) select md5('dawes:client-org-1')::uuid,'Rival '||n from generate_series(2,12) n$$,'Agency fills the list to twelve');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'Rival 13')$$,'P0001','A client can follow up to 12 competitors.','The thirteenth competitor is refused');

-- A designer with the client's work reads and never writes.
select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
select is((select count(*)::int from public.competitors where client_id=md5('dawes:client-org-1')::uuid),12,'An assigned designer reads the list');
select is((select count(*)::int from public.client_board_widgets where client_id=md5('dawes:client-org-1')::uuid),1,'An assigned designer sees the widget');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'Designer pick')$$,'42501',null,'A designer cannot add a competitor');
with changed as (update public.competitors set website='https://x.example' where client_id=md5('dawes:client-org-1')::uuid returning id)
select is((select count(*)::int from changed),0,'A designer cannot edit a competitor');
with removed as (delete from public.competitors where client_id=md5('dawes:client-org-1')::uuid returning id)
select is((select count(*)::int from removed),0,'A designer cannot remove a competitor');
with removed as (delete from public.client_board_widgets where client_id=md5('dawes:client-org-1')::uuid returning client_id)
select is((select count(*)::int from removed),0,'A designer cannot remove the widget');

-- The agency removes a competitor and the widget; the list outlives the widget.
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
with removed as (delete from public.competitors where client_id=md5('dawes:client-org-1')::uuid and name='Rival 12' returning id)
select is((select count(*)::int from removed),1,'Agency removes a competitor');
with removed as (delete from public.client_board_widgets where client_id=md5('dawes:client-org-1')::uuid returning client_id)
select is((select count(*)::int from removed),1,'Agency removes the widget');
select is((select count(*)::int from public.competitors where client_id=md5('dawes:client-org-1')::uuid),11,'Removing the widget keeps the competitors');
insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-1')::uuid,'competitor_ads');

-- A client never sees either table, even for its own workspace.
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
select is((select count(*)::int from public.competitors),0,'A client never reads competitors, even its own');
select is((select count(*)::int from public.client_board_widgets),0,'A client never sees the widget');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'Client pick')$$,'42501',null,'A client cannot add a competitor');
select throws_ok($$insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-3')::uuid,'competitor_ads')$$,'42501',null,'A client cannot place the widget');

-- A designer without the client's work sees nothing.
reset role;
delete from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.competitors),0,'A designer without the client''s work reads nothing');
select is((select count(*)::int from public.client_board_widgets),0,'A designer without the client''s work sees no widget');

reset role;
set local role anon;
select throws_ok($$select count(*) from public.competitors$$,'42501',null,'Anonymous users cannot read competitors');
reset role;
select ok(not has_table_privilege('anon','public.client_board_widgets','SELECT'),'Anonymous select on widgets is revoked');
select * from finish();
rollback;
