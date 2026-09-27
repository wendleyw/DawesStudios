begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);
-- Match the Storage API delete transaction guard while evaluating its RLS policies.
set local storage.allow_delete_query='true';
select is((select count(*)::int from public.service_catalog),20,'Canonical service catalog has 20 types');
select is((select count(*)::int from public.format_catalog),25,'Canonical format catalog has 25 formats');
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select ok(not has_function_privilege('authenticated','public.register_sanitized_asset(uuid,text,text,text,text,bigint,uuid,uuid,text)','execute'),'Browser sessions cannot attest to sanitized bytes');
-- Retired Versions, Task 2: `published-assets` no longer exists as a bucket
-- (`202609270008_drop_published_assets_bucket.sql`), so an agency upload attempt there now fails
-- on the `storage.objects` bucket foreign key before RLS is ever evaluated -- a stronger
-- guarantee than the RLS denial this used to assert, and no longer testable as an RLS case.
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('delivery-files',md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('trusted-output')::uuid::text||'.png',auth.uid()::text)$$,'42501',null,'Agency cannot bypass the worker by uploading delivery bytes directly');
reset role;
insert into storage.objects(bucket_id,name,metadata) values('delivery-files',md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('trusted-delivery')::uuid::text||'.png','{"size":100}');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
-- `register_sanitized_asset` raises for `p_bucket_id='published-assets'` before it ever checks
-- whether a matching `storage.objects` row exists, so no fixture object is needed (and none could
-- exist any more: the bucket itself is gone).
select throws_ok($$select public.register_sanitized_asset(md5('dawes:project-sabre-campaign-landing-page')::uuid,'published-assets',md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('trusted-output')::uuid::text||'.png',repeat('a',64),'image/png',100,md5('dawes:agency')::uuid,null,null)$$,'22023','Published design assets are retired','The worker can no longer attest publication bytes');
select throws_ok($$select public.register_sanitized_asset(md5('dawes:project-sabre-campaign-landing-page')::uuid,'delivery-files',md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('trusted-delivery')::uuid::text||'.png',repeat('a',64),'image/png',100,md5('dawes:agency')::uuid,md5('dawes:project-sabre-campaign-landing-page')::uuid,null)$$,'22023','Uploaded designs are retired','A source design is refused');
select lives_ok($$select public.register_sanitized_asset(md5('dawes:project-sabre-campaign-landing-page')::uuid,'delivery-files',md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('trusted-delivery')::uuid::text||'.png',repeat('a',64),'image/png',100,md5('dawes:agency')::uuid,null,null)$$,'Trusted worker can register a sanitized delivery file');
-- Retired Versions cleanup, Task 2: the only test for the delivery-files video refusal lived in
-- the deleted video_asset_registration.test.sql. `delivery-files` never widened for video (only
-- `internal-assets`/`published-assets` did), so the MIME gate still raises before the path is
-- even checked against `storage.objects`.
select throws_ok($$select public.register_sanitized_asset(md5('dawes:project-sabre-campaign-landing-page')::uuid,'delivery-files',md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('trusted-delivery-video')::uuid::text||'.mp4',repeat('a',64),'video/mp4',100,md5('dawes:agency')::uuid,null,null)$$,'P0001','Unsupported sanitized delivery type','A delivery file still refuses video');
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
update public.briefings set direction='{}' where id=md5('dawes:pending-1')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.submit_briefing(md5('dawes:pending-1')::uuid)$$,'P0001','Answer every service question before submitting','Direct API submission cannot omit service answers');
reset role;
update public.briefings set direction='{"questions":{"content":"Invented option"}}' where id=md5('dawes:pending-1')::uuid;
set local role authenticated;
select throws_ok($$select public.submit_briefing(md5('dawes:pending-1')::uuid)$$,'P0001','Choose an allowed option for each service question','Direct API submission cannot invent catalog options');
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
insert into storage.objects(bucket_id,name) values('brand-assets',md5('dawes:client-org-1')::uuid::text||'/'||md5('brand-orphan')::uuid::text||'.png');
insert into storage.objects(bucket_id,name) values('brand-assets',md5('dawes:client-org-1')::uuid::text||'/'||md5('brand-registered')::uuid::text||'.png');
insert into public.brand_assets(client_id,name,category,storage_path) values(md5('dawes:client-org-1')::uuid,'Brand image','Photography',md5('dawes:client-org-1')::uuid::text||'/'||md5('brand-registered')::uuid::text||'.png');
set local role authenticated;
with deleted as (delete from storage.objects where bucket_id='brand-assets' and name like '%'||md5('brand-orphan')::uuid::text||'.png' returning name) select is((select count(*)::int from deleted),1,'Agency can remove an unregistered brand object');
with deleted as (delete from storage.objects where bucket_id='brand-assets' and name like '%'||md5('brand-registered')::uuid::text||'.png' returning name) select is((select count(*)::int from deleted),0,'Referenced brand bytes cannot be deleted');
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
with deleted as (delete from storage.objects where bucket_id='brand-assets' returning name) select is((select count(*)::int from deleted),0,'Client cannot delete shared brand files');
select ok(not has_table_privilege('authenticated','private.sanitized_assets','select'),'Trusted attestations do not expose internal source metadata');
select * from finish();
rollback;
