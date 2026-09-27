begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(7);

select is((select file_size_limit from storage.buckets where id = 'internal-assets'),
          1073741824::bigint, 'internal-assets holds a gigabyte');
-- Retired Versions, Task 2: `published-assets` no longer exists
-- (`202609270008_drop_published_assets_bucket.sql`); `retire_versions.test.sql` already asserts
-- the bucket is gone, so this file keeps only the design bucket that is still widened for video.
select ok(not exists(select 1 from storage.buckets where id = 'published-assets'),
          'published-assets is retired, not merely narrowed');

select ok((select allowed_mime_types from storage.buckets where id = 'internal-assets')
          @> array['video/mp4','video/webm'], 'internal-assets accepts web video');

-- Brand assets and deliveries are not design surfaces and must not have widened.
select is((select file_size_limit from storage.buckets where id = 'brand-assets'),
          52428800::bigint, 'brand-assets is untouched');

select ok(private.opaque_storage_path(
            md5('a')::uuid::text || '/' || md5('b')::uuid::text || '.mp4'),
          'an mp4 object path is opaque-valid');

-- The attestation table must accept what the bucket now accepts, or a sanitized video lands in
-- storage and then fails registration, leaving bytes with no attestation row. `internal-assets`
-- is the design bucket both a working video and its (now retired) published copy used to share;
-- Task 2 stopped `published-assets` fixtures here rather than the ceiling this proves.
select lives_ok($$
  insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by)
  values('internal-assets',
         md5('dawes:project-2')::uuid::text||'/'||md5('probe')::uuid::text||'.mp4',
         md5('dawes:project-2')::uuid, repeat('a',64), 'video/mp4', 1073741824,
         md5('dawes:agency')::uuid)
$$, 'the attestation table accepts a gigabyte video');

select throws_ok($$
  insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by)
  values('internal-assets',
         md5('dawes:project-2')::uuid::text||'/'||md5('probe2')::uuid::text||'.mp4',
         md5('dawes:project-2')::uuid, repeat('a',64), 'video/mp4', 1073741825,
         md5('dawes:agency')::uuid)
$$, '23514', null, 'the attestation table still has a ceiling');

select * from finish();
rollback;
