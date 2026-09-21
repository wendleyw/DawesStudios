begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(3);

-- Final whole-branch review, Critical 2 (regression guard added at the acceptance-evidence
-- session's request, then sharpened at re-review). A whole-table invariant rather than a
-- per-write assertion: a per-write test proves one write happened correctly, this proves the
-- table a client actually reads from is clean, over the full seeded dataset plus anything this
-- run has added.
--
-- Re-review correction: the first version of this file asserted only "every published file has a
-- `published-assets` attestation", which was already true before this branch's video work --
-- `register_sanitized_asset` always wrote that row on success, with or without checking the
-- *source*. That property would NOT have failed if the video-provenance gate in
-- `202609210007_video_provenance_attestation.sql` were deleted outright, so it did not guard what
-- the original report claimed. Kept below as assertion 1 (it is still true and still worth
-- stating), but assertion 3 is the one that actually matters: it walks the CHAIN from a published
-- video to the `internal-assets` attestation its own `published-assets` row names as its source,
-- which is exactly the fact the gate exists to guarantee and the fact a deleted gate would falsify
-- the next time anything (a regression, a botched migration, manual intervention) produced a
-- published video whose source was never sanitised.
--
-- Measured on the shared stack before any of this branch's video work: of 22 published designs,
-- 18 carried a file and all 18 already had a `published-assets` attestation; the other 4 were
-- structured content with no file. Nothing in the deterministic seed publishes a video, so
-- assertion 2 (the filtered set is non-empty) would pass on nothing if this file relied on seed
-- data alone -- exactly the trivially-true failure mode a companion non-emptiness check exists to
-- rule out. This file therefore creates one real published video, through the same
-- attest-then-copy-then-publish path production code takes, inside its own rolled-back
-- transaction, so assertions 2 and 3 are checked against at least one real row every time this
-- runs, not merely against whatever the seed happens to contain.
update public.designs
   set internal_asset_path=project_id::text||'/'||md5('dawes:invariant-video-source')::uuid::text||'.mp4'
 where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;

select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-source')::uuid::text||'.mp4',
       '{"size":1048576}');
select public.register_sanitized_video(
  md5('dawes:project-sabre-campaign-landing-page')::uuid,
  md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-source')::uuid::text||'.mp4',
  repeat('d',64), 'video/mp4', 1048576,
  md5('dawes:agency')::uuid);

insert into storage.objects(bucket_id,name,metadata)
values('published-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-output')::uuid::text||'.mp4',
       '{"size":1048576}');
select public.register_sanitized_asset(
  md5('dawes:project-sabre-campaign-landing-page')::uuid,
  'published-assets',
  md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-output')::uuid::text||'.mp4',
  repeat('d',64), 'video/mp4', 1048576,
  md5('dawes:agency')::uuid,
  md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid,
  md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-source')::uuid::text||'.mp4');

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select public.publish_version(
  md5('dawes:version-sabre-campaign-landing-page-2')::uuid, 'Prepared output',
  jsonb_build_object(
    md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid::text,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-output')::uuid::text||'.mp4'));

reset role;

-- A second, deliberately UNATTESTED video, standing in for the exact bypass Critical 2 closed --
-- a design whose `internal_asset_path` was set directly (as `add_design`/`internal_storage_insert`
-- alone would allow) rather than through `/designs/sanitize-video`, with no `internal-assets` row
-- ever created for it. It gets its own deliverable/version/design, entirely fresh within this
-- transaction, rather than reusing the design or version published above, for two independent
-- reasons: `register_sanitized_asset` checks `d.internal_asset_path = p_source_path` for the SAME
-- design (a fresh design keeps that check from being what refuses this attempt, rather than the
-- provenance gate), and `publish_version` short-circuits to an existing publication for a version
-- that already has one (a fresh version keeps that idempotent return from hiding whether this
-- design's row actually reached `published_designs`).
--
-- Whether the copy call raises is deliberately not asserted here with `throws_ok`/`lives_ok` --
-- `video_provenance_attestation.test.sql` already proves that at the RPC level. What THIS file
-- checks is the TABLE STATE afterward: with the gate in place, the copy raises, nothing is
-- published, and assertions 2/3 below see only the one good video from above. If the gate were
-- ever deleted or weakened, this same sequence would instead publish a video whose attestation
-- names an unattested source, and assertion 3 would catch it -- which was verified directly, by
-- re-running this file against a deliberately un-gated copy of `register_sanitized_asset` and
-- confirming assertion 3 failed, then restoring the gate and confirming it passed again.
insert into public.deliverables(id,project_id,name,format,quantity,scope,sort_order)
values (
  md5('dawes:deliverable-invariant-bypass-probe')::uuid,
  md5('dawes:project-sabre-campaign-landing-page')::uuid,
  'Invariant bypass probe', 'reel', 1, 'original', 99
);
insert into public.design_versions(id,project_id,deliverable_id,version_number,notes,status,created_by)
values (
  md5('dawes:version-invariant-bypass-probe')::uuid,
  md5('dawes:project-sabre-campaign-landing-page')::uuid,
  md5('dawes:deliverable-invariant-bypass-probe')::uuid,
  1, '', 'submitted', md5('dawes:agency')::uuid
);
insert into public.designs(id,project_id,version_id,title,content,internal_asset_path,sort_order,created_by)
values (
  md5('dawes:design-invariant-bypass-probe')::uuid,
  md5('dawes:project-sabre-campaign-landing-page')::uuid,
  md5('dawes:version-invariant-bypass-probe')::uuid,
  'Invariant bypass probe', '{}'::jsonb,
  md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-bypass-source')::uuid::text||'.mp4',
  0, md5('dawes:agency')::uuid
);
insert into storage.objects(bucket_id,name,metadata)
values('published-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-bypass-output')::uuid::text||'.mp4',
       '{"size":1048576}');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$ begin
  perform public.register_sanitized_asset(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    'published-assets',
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-bypass-output')::uuid::text||'.mp4',
    repeat('e',64), 'video/mp4', 1048576,
    md5('dawes:agency')::uuid,
    md5('dawes:design-invariant-bypass-probe')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-bypass-source')::uuid::text||'.mp4');
exception when others then null;
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ begin
  perform public.publish_version(
    md5('dawes:version-invariant-bypass-probe')::uuid, 'Prepared output',
    jsonb_build_object(
      md5('dawes:design-invariant-bypass-probe')::uuid::text,
      md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:invariant-video-bypass-output')::uuid::text||'.mp4'));
exception when others then null;
end $$;
reset role;

-- 1. The image-era property, kept for its own sake: every published file -- video or image --
-- has SOME `published-assets` attestation. True before this branch and still true after it.
select is(
  (select count(*)::int from public.published_designs pd
    where pd.asset_path is not null
      and not exists (select 1 from private.sanitized_assets sa
                       where sa.storage_path = pd.asset_path
                         and sa.bucket_id = 'published-assets')),
  0,
  'every published design that carries a file has a published-assets sanitisation attestation'
);

-- 2. The companion non-emptiness check: assertion 3 below is a universally-quantified claim over
-- a filtered set, and a universal claim over an empty set is vacuously true. Without this, a
-- future change to the seed (or to this file) that stopped producing a published video would make
-- assertion 3 pass on nothing, silently, forever.
select ok(
  exists(
    select 1 from public.published_designs pd
     join private.sanitized_assets pub
       on pub.bucket_id = 'published-assets' and pub.storage_path = pd.asset_path
     where pd.asset_path ~ '\.(mp4|webm)$'
  ),
  'at least one published video exists to exercise the chain assertion below'
);

-- 3. The chain: a published video's OWN attestation names a `source_path`, and that exact path
-- must itself carry an `internal-assets` attestation, in the same project, for the same MIME
-- type. This is what the video-provenance gate in `register_sanitized_asset` guarantees at write
-- time; this assertion re-derives it independently, by walking the data, so a regression that
-- deleted or weakened that gate would make this non-zero rather than merely removing a code path
-- nothing here re-exercises. Unlike assertion 1, this would have caught the original defect: the
-- pre-fix `register_sanitized_asset` happily wrote the `published-assets` row in assertion 1's
-- shape while never requiring the `internal-assets` row this assertion also requires.
select is(
  (select count(*)::int from public.published_designs pd
    join private.sanitized_assets pub
      on pub.bucket_id = 'published-assets' and pub.storage_path = pd.asset_path
   where pd.asset_path ~ '\.(mp4|webm)$'
     and not exists (
       select 1 from private.sanitized_assets internal_att
        where internal_att.bucket_id = 'internal-assets'
          and internal_att.storage_path = pub.source_path
          and internal_att.project_id = pub.project_id
          and internal_att.mime_type = pub.mime_type
     )),
  0,
  'every published video''s attestation names a source that itself carries an internal-assets attestation'
);

select * from finish();
rollback;
