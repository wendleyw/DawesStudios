begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(7);

select is((select file_size_limit from storage.buckets where id = 'internal-assets'),
          52428800::bigint, 'working files enforce the current 50 MiB ceiling');
-- Retired Versions, Task 2: `published-assets` no longer exists
-- (`202609270008_drop_published_assets_bucket.sql`); `retire_versions.test.sql` already asserts
-- the bucket is gone. Working uploads no longer accept video after migration 202609270017.
select ok(not exists(select 1 from storage.buckets where id = 'published-assets'),
          'published-assets is retired, not merely narrowed');

select is((select allowed_mime_types from storage.buckets where id = 'internal-assets'),
          array['image/png','image/jpeg','image/webp','application/pdf'],
          'working files accept only the current Files formats');

-- Brand assets and deliveries are not design surfaces and must not have widened.
select is((select file_size_limit from storage.buckets where id = 'brand-assets'),
          52428800::bigint, 'brand-assets is untouched');

select ok(private.opaque_storage_path(
            md5('a')::uuid::text || '/' || md5('b')::uuid::text || '.mp4'),
          'an mp4 object path is opaque-valid');

-- Historical attestations remain valid. They do not override the Storage bucket ceiling or
-- grant permission for a new video upload; retaining them preserves existing file references.
select lives_ok($$
  insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by)
  values('internal-assets',
         md5('dawes:project-2')::uuid::text||'/'||md5('probe')::uuid::text||'.mp4',
         md5('dawes:project-2')::uuid, repeat('a',64), 'video/mp4', 1073741824,
         md5('dawes:agency')::uuid)
$$, 'historical gigabyte video attestations remain valid');

select throws_ok($$
  insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by)
  values('internal-assets',
         md5('dawes:project-2')::uuid::text||'/'||md5('probe2')::uuid::text||'.mp4',
         md5('dawes:project-2')::uuid, repeat('a',64), 'video/mp4', 1073741825,
         md5('dawes:agency')::uuid)
$$, '23514', null, 'the attestation table still has a ceiling');

select * from finish();
rollback;
