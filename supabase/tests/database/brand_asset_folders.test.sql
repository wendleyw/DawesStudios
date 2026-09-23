begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$insert into public.brand_asset_folders(id,client_id,name) values
  (md5('folder-test:one')::uuid,md5('dawes:client-org-1')::uuid,'Folder test photos'),
  (md5('folder-test:two')::uuid,md5('dawes:client-org-2')::uuid,'Folder test photos')$$,'Agency creates folders independently for two clients');
select throws_ok($$insert into public.brand_asset_folders(client_id,name) values(md5('dawes:client-org-1')::uuid,'FOLDER TEST PHOTOS')$$,'23505',null,'Names are case-insensitively unique within a client');
select throws_ok($$insert into public.brand_asset_folders(client_id,name) values(md5('dawes:client-org-1')::uuid,' ')$$,'23514',null,'Blank folder names are rejected');
select throws_ok($$insert into public.brand_asset_folders(client_id,name) values(md5('dawes:client-org-1')::uuid,' untrimmed ')$$,'23514',null,'Names must be trimmed');
select throws_ok($$insert into public.brand_asset_folders(client_id,name) values(md5('dawes:client-org-1')::uuid,repeat('a',81))$$,'23514',null,'Long names are rejected');
select throws_ok($$update public.brand_asset_folders set client_id=md5('dawes:client-org-2')::uuid where id=md5('folder-test:one')::uuid$$,'42501',null,'A folder cannot be reassigned to a different client');
select lives_ok($$insert into public.brand_assets(id,client_id,name,category,storage_path,folder_id) values(md5('folder-test:asset')::uuid,md5('dawes:client-org-1')::uuid,'Folder test asset','Photography',md5('dawes:client-org-1')::uuid::text || '/test.png',md5('folder-test:one')::uuid)$$,'Agency adds an asset to its client folder');
select throws_ok($$update public.brand_assets set folder_id=md5('folder-test:two')::uuid where id=md5('folder-test:asset')::uuid$$,'23503',null,'Composite foreign key rejects cross-client asset placement');
select lives_ok($$update public.brand_asset_folders set name='Folder test renamed' where id=md5('folder-test:one')::uuid$$,'Agency can rename a folder');

select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
select is((select count(*)::int from public.brand_asset_folders where id in(md5('folder-test:one')::uuid,md5('folder-test:two')::uuid)),1,'Client sees only its own folder');
select is((select folder_id from public.brand_assets where id=md5('folder-test:asset')::uuid),md5('folder-test:one')::uuid,'Client can browse filed assets');
select throws_ok($$insert into public.brand_asset_folders(client_id,name) values(md5('dawes:client-org-1')::uuid,'Unauthorized')$$,'42501',null,'Client cannot create folders');
with changed as(update public.brand_asset_folders set name='Unauthorized' where id=md5('folder-test:one')::uuid returning id)
select is((select count(*)::int from changed),0,'Client cannot rename folders');
with removed as(delete from public.brand_asset_folders where id=md5('folder-test:one')::uuid returning id)
select is((select count(*)::int from removed),0,'Client cannot delete folders');
with changed as(update public.brand_assets set folder_id=null where id=md5('folder-test:asset')::uuid returning id)
select is((select count(*)::int from changed),0,'Client cannot move assets');

select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
select is((select count(*)::int from public.brand_asset_folders where id=md5('folder-test:one')::uuid),1,'Assigned designer can browse folders');
select throws_ok($$insert into public.brand_asset_folders(client_id,name) values(md5('dawes:client-org-1')::uuid,'Unauthorized')$$,'42501',null,'Designer cannot create folders');
with changed as(update public.brand_assets set folder_id=null where id=md5('folder-test:asset')::uuid returning id)
select is((select count(*)::int from changed),0,'Designer cannot move assets');
reset role;
delete from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid;
set local role authenticated;
select is((select count(*)::int from public.brand_asset_folders where id=md5('folder-test:one')::uuid),0,'Revoked designer cannot browse folders');
reset role;
update public.profiles set removed_at=now() where id=md5('dawes:client-1')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.brand_asset_folders where id=md5('folder-test:one')::uuid),0,'Removed client cannot browse folders');

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
select lives_ok($$delete from public.brand_asset_folders where id=md5('folder-test:one')::uuid$$,'Agency can delete a nonempty folder');
select is((select count(*)::int from public.brand_assets where id=md5('folder-test:asset')::uuid),1,'Deleting the folder preserves the asset');
select is((select folder_id from public.brand_assets where id=md5('folder-test:asset')::uuid),null::uuid,'Preserved asset becomes unfiled');
select is((select storage_path from public.brand_assets where id=md5('folder-test:asset')::uuid),md5('dawes:client-org-1')::uuid::text || '/test.png','Storage path is unchanged');
reset role;
select ok(not has_table_privilege('anon','public.brand_asset_folders','SELECT'),'Anonymous folder access is revoked');
select ok(not has_column_privilege('authenticated','public.brand_asset_folders','client_id','UPDATE'),'Folder tenant column is immutable');
select * from finish();
rollback;
