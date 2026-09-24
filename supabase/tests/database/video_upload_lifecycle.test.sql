begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);

-- Video upload lifecycle: `register_sanitized_video` now records `source_path`, and two new
-- service_role-only functions support the retry-idempotency and cleanup halves of the design
-- (docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md). Reuses the seeded SABRE
-- "Campaign Landing Page" project/design fixtures the same way
-- video_provenance_attestation.test.sql does; this file's own begin;/rollback; keeps its
-- mutations from being seen by, or seeing, theirs.

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4',
       '{"size":4194304}');

-- 1. register_sanitized_video records the raw path it was produced from.
select lives_ok($$
  select public.register_sanitized_video(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4',
    repeat('c',64), 'video/mp4', 4194304,
    md5('dawes:agency')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')
$$, 'register_sanitized_video accepts a source_path argument');

-- `private` is not visible to service_role, so the attestation row is read as the test owner.
reset role;
select is(
  (select source_path from private.sanitized_assets
    where bucket_id='internal-assets'
      and storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'),
  md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw',
  'the attestation carries the exact raw path it was produced from'
);

-- 2. Only service_role may execute the two new functions: the revoked grant refuses the call
-- before the function body's own role check runs.
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select throws_ok($$ select public.list_stale_video_uploads() $$, '42501', 'permission denied for function list_stale_video_uploads', 'an authenticated session cannot list stale video uploads');
select throws_ok($$
  select public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')
$$, '42501', 'permission denied for function find_sanitized_video_by_source', 'an authenticated session cannot look up a sanitized video by source');
reset role;

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

-- 3. find_sanitized_video_by_source finds the fresh attestation by its exact source_path.
select results_eq($$
  select storage_path, mime_type from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')
$$, $$
  select md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4', 'video/mp4'
$$, 'a fresh attestation is found by its exact source_path');

-- 4. A different source_path finds nothing.
select is(
  (select count(*)::int from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:some-other-raw')::uuid::text||'.raw')),
  0, 'an unrelated source_path finds nothing'
);

-- 5. Backdate the output object past 24 hours: the idempotent lookup must stop finding it. Only
-- the object is backdated (its attestation stays fresh), because the lookup and the sweep both age
-- an output by its storage object -- one clock, so no output is ever offered for retry and swept
-- at the same time.
update storage.objects set created_at = now() - interval '25 hours'
 where bucket_id='internal-assets'
   and name=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4';
select is(
  (select count(*)::int from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')),
  0, 'an output older than 24 hours is no longer offered for idempotent retry'
);

-- 6. The same backdated, unreferenced output is exactly what the stale sweep must list, with
-- attested=true.
select ok(
  exists(select 1 from public.list_stale_video_uploads() stale
          where stale.bucket_id='internal-assets'
            and stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'
            and stale.attested),
  'a stale, unreferenced attested output is listed with attested=true'
);

-- 7. A design referencing that same object excludes it, even once it is old enough.
update public.designs set internal_asset_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'
 where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;
select ok(
  not exists(select 1 from public.list_stale_video_uploads() stale
              where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'),
  'an attested output a design still references is never listed as stale'
);
update public.designs set internal_asset_path=null
 where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;

-- 8. `project_assets.storage_path` is the one other column that can hold an internal-assets path
-- (its insert policy only checks the project scope), so a working-file row referencing the object
-- excludes it the same way.
insert into public.project_assets(project_id,name,storage_path,mime_type,file_size)
values(md5('dawes:project-sabre-campaign-landing-page')::uuid, 'Working cut.mp4',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4',
       'video/mp4', 4194304);
select ok(
  not exists(select 1 from public.list_stale_video_uploads() stale
              where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'),
  'an attested output a project asset still references is never listed as stale'
);
delete from public.project_assets
 where storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4';

-- 9. A raw .raw object with no attestation row at all: old enough is listed with attested=false;
-- young is not listed, and neither is one exactly at the 24-hour boundary.
insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-old')::uuid::text||'.raw',
       '{"size":1048576}');
update storage.objects set created_at = now() - interval '25 hours'
 where bucket_id='internal-assets' and name=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-old')::uuid::text||'.raw';
insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-fresh')::uuid::text||'.raw',
       '{"size":1048576}');
insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-boundary')::uuid::text||'.raw',
       '{"size":1048576}');
update storage.objects set created_at = now() - interval '24 hours'
 where bucket_id='internal-assets' and name=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-boundary')::uuid::text||'.raw';

select ok(
  exists(select 1 from public.list_stale_video_uploads() stale
          where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-old')::uuid::text||'.raw'
            and not stale.attested),
  'a raw upload older than 24 hours is listed with attested=false'
);
select ok(
  not exists(select 1 from public.list_stale_video_uploads() stale
              where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-fresh')::uuid::text||'.raw'),
  'a raw upload younger than 24 hours is never listed'
);
select ok(
  not exists(select 1 from public.list_stale_video_uploads() stale
              where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-boundary')::uuid::text||'.raw'),
  'a raw upload exactly 24 hours old is not yet listed'
);

-- 10. An attestation whose object is gone is never offered for retry: returning its path would let
-- the dialog register a design that points at nothing.
reset role;
insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-gone')::uuid::text||'.mp4',
       md5('dawes:project-sabre-campaign-landing-page')::uuid, repeat('d',64), 'video/mp4', 4194304,
       md5('dawes:agency')::uuid, null,
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-gone')::uuid::text||'.raw');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is(
  (select count(*)::int from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-gone')::uuid::text||'.raw')),
  0, 'an attestation whose object no longer exists is never offered for idempotent retry'
);

reset role;
select * from finish();
rollback;
