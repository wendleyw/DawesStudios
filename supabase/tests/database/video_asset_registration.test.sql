begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(2);

-- Fixture: the unpublished (version 2) design under the seeded SABRE "Campaign Landing Page"
-- project. It has no `internal_asset_path` in the seed, so it is given one here, pointing at
-- an internal video object, exactly as `/designs/sanitize-video` would leave it.
update public.designs
   set internal_asset_path = project_id::text||'/'||md5('dawes:video-internal-source')::uuid::text||'.mp4'
 where id = md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;

-- The publication object this design's video is (about to be) copied to. Its size must match
-- what is attested below, or `register_sanitized_asset`'s own storage-object check would raise
-- first and the test would prove nothing about the MIME gate.
insert into storage.objects(bucket_id,name,metadata)
values('published-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-published-output')::uuid::text||'.mp4',
       '{"size":1048576}');

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

-- Accept: a video/mp4 registration for published-assets now succeeds when it names its
-- matching source design, where before this migration it always raised regardless of the
-- source design match.
select lives_ok($$
  select public.register_sanitized_asset(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    'published-assets',
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-published-output')::uuid::text||'.mp4',
    repeat('a',64), 'video/mp4', 1048576,
    md5('dawes:agency')::uuid,
    md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-internal-source')::uuid::text||'.mp4')
$$, 'A video design registers for publication when its source design matches');

-- Refuse: delivery-files is deliberately NOT widened. The MIME check for that bucket is
-- untouched, so a video/mp4 registration there still raises exactly as before.
select throws_ok($$
  select public.register_sanitized_asset(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    'delivery-files',
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:video-delivery-output')::uuid::text||'.mp4',
    repeat('a',64), 'video/mp4', 1048576,
    md5('dawes:agency')::uuid)
$$, 'P0001', 'Unsupported sanitized delivery type', 'A delivery file still refuses video');

reset role;
select * from finish();
rollback;
