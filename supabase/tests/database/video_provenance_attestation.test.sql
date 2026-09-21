begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(9);

-- Final whole-branch review, Critical 2: before this migration, `register_sanitized_asset`
-- would copy a video into `published-assets` on the sole grounds that the *design* pointed at
-- the internal path -- never checking whether that internal object had ever been sanitised.
-- These assertions prove the gate this migration adds: no attestation, no copy; attestation
-- present, copy proceeds; and the top-level `publish_version` RPC cannot be tricked into
-- carrying an unattested video either.
--
-- Reuses the seeded SABRE "Campaign Landing Page" design/version fixtures the same way
-- `trusted_media_and_catalog.test.sql` and `video_asset_registration.test.sql` already do; this
-- file's own `begin;`/`rollback;` keeps its mutations from being seen by, or seeing, theirs.
update public.designs
   set internal_asset_path=project_id::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4'
 where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;

-- Persists for the whole transaction (`set_config(...,true)` is transaction-local), the same way
-- `trusted_media_and_catalog.test.sql` sets it once and reuses it across every later switch back
-- to `authenticated`: every `publish_version` call below needs the agency identity, not merely
-- the agency role.
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

-- 1. Refused: no `internal-assets` attestation row exists yet for the source path, so the copy
-- into `published-assets` must not be registered even though the design/source-path/project
-- match exactly what the pre-existing check already required.
insert into storage.objects(bucket_id,name,metadata)
values('published-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4',
       '{"size":2097152}');
select throws_ok($$
  select public.register_sanitized_asset(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    'published-assets',
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4',
    repeat('a',64), 'video/mp4', 2097152,
    md5('dawes:agency')::uuid,
    md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4')
$$, 'P0001', 'Video source has no sanitisation attestation',
   'A video copy is refused without an internal sanitisation attestation');

reset role;

-- `private` is not exposed to any API role (`supabase/config.toml` exposes `public` alone), so
-- this read-after-write check runs as the migration-owning session role, the same way the test
-- runner's own default connection can already see every other schema.
select is((select count(*)::int from private.sanitized_assets
            where bucket_id='published-assets'
              and storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4'),
          0, 'the refused copy left no attestation row behind');

select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

-- 2. Refused end to end: `publish_version` itself cannot be handed that unregistered path either,
-- proving the block is not merely an internal implementation detail of `register_sanitized_asset`.
select throws_ok($$
  select public.publish_version(
    md5('dawes:version-sabre-campaign-landing-page-2')::uuid, 'Prepared output',
    jsonb_build_object(
      md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid::text,
      md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4'))
$$, 'P0001', 'A trusted sanitized publication asset is required for this design',
   'Publish is refused end to end while the source video carries no attestation');

reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

-- 3. A designer -- not only the agency -- can attest the internal object: this is the identity
-- rule `/designs/sanitize-video` actually needs, and it is deliberately looser than
-- `register_sanitized_asset`'s agency-only rule for a publication or a delivery.
insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4',
       '{"size":4194304}');
select throws_ok($$
  select public.register_sanitized_video(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4',
    repeat('b',64), 'video/mp4', 4194304,
    md5('dawes:client-1')::uuid)
$$, 'P0001', 'Production preparation identity required',
   'A client identity cannot attest a sanitised internal video');
select lives_ok($$
  select public.register_sanitized_video(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4',
    repeat('b',64), 'video/mp4', 4194304,
    md5('dawes:designer-1')::uuid)
$$, 'a designer can attest the internal video, mirroring who may sanitise it');

reset role;

-- Re-review, item 2: `list_stale_sanitized_assets` excludes `bucket_id='internal-assets'`
-- entirely, but nothing previously asserted that -- the two existing tests on that function cover
-- a PDF and a delivery file, neither of which is in that bucket, so removing the exclusion would
-- not have failed either. Made this attestation satisfy every OTHER staleness condition
-- (`discard_requested`, and old enough to clear the 24-hour floor) before checking it: a query
-- that only ever sees non-stale-looking rows would pass even without the bucket exclusion, which
-- would prove nothing about the exclusion itself.
--
-- `private` grants nothing to `service_role` directly -- only the security-definer functions that
-- run as their owner touch it -- so this UPDATE runs as the test runner's own connecting role,
-- the same way the "no attestation row behind" read earlier in this file does.
update private.sanitized_assets
   set created_at = now() - interval '48 hours', discard_requested = true
 where bucket_id = 'internal-assets'
   and storage_path = md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4';

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select ok(
  not exists(
    select 1 from public.list_stale_sanitized_assets() stale
     where stale.bucket_id = 'internal-assets'
       and stale.storage_path = md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4'
  ),
  'an internal-assets attestation is excluded from the stale sweep even when discard_requested and old enough to otherwise qualify'
);
reset role;

-- 4. Allowed: the same copy that was refused in (1) now succeeds once the source is attested.
select lives_ok($$
  select public.register_sanitized_asset(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    'published-assets',
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4',
    repeat('a',64), 'video/mp4', 2097152,
    md5('dawes:agency')::uuid,
    md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-source')::uuid::text||'.mp4')
$$, 'the copy proceeds once the internal object carries a sanitisation attestation');

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

-- 5. Publish now succeeds end to end for the video, proving the gate is a provenance check, not
-- a permanent block on video reaching a client publication.
select lives_ok($$
  select public.publish_version(
    md5('dawes:version-sabre-campaign-landing-page-2')::uuid, 'Prepared output',
    jsonb_build_object(
      md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid::text,
      md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4'))
$$, 'agency can publish the video once its source is attested');
select is((select asset_path from public.published_designs
            where publication_id=(select id from public.published_versions
                                    where deliverable_id=(select deliverable_id from public.design_versions where id=md5('dawes:version-sabre-campaign-landing-page-2')::uuid)
                                    order by version_number desc limit 1)
              and title=(select title from public.designs where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid)),
          md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-provenance-output')::uuid::text||'.mp4',
          'the published design carries the attested video path, read back rather than assumed');

reset role;
select * from finish();
rollback;
