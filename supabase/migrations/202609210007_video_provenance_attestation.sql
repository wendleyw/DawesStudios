-- Final whole-branch review, Critical 2: an unsanitised video could reach the immutable client
-- snapshot.
--
-- Before this branch, the move below was impossible: `opaque_storage_path` rejected `.mp4`/
-- `.webm` outright and neither design bucket allowed a video MIME type. `202609210004` opened
-- both gates for the legitimate path (upload -> `/designs/sanitize-video` -> `add_design`) and,
-- as a side effect, for an illegitimate one nothing here closed:
--
--   1. `add_design` (202609200002_workflows.sql) validates only that `p_internal_asset_path`'s
--      first path segment is the caller's own project. It never asks how that object got into
--      `internal-assets`.
--   2. `internal_storage_insert` (202609200003_storage.sql) lets any `can_produce` caller --
--      agency, or a designer merely *assigned* to the project -- write straight to
--      `internal-assets` at any path `opaque_storage_path` accepts, with their own JWT, no
--      media service involved. That check now accepts `.mp4`/`.webm`/`.raw`.
--   3. `register_sanitized_asset`'s `published-assets` branch (202609210006) only checks that
--      the copy's mime type is a video type and that the *design* points at the internal path
--      being copied. It never asked whether that internal object was ever put through
--      `sanitizeVideo` at all.
--
-- So a production-role caller could `PUT` a GPS-tagged `.mp4` directly into `internal-assets`,
-- call `add_design` with that path, and have `publish_version` copy it byte-for-byte into
-- `published-assets` -- the one bucket the client's browser actually reads. Images never had
-- this hole: `sanitizeRaster` re-encodes through Sharp again at publish time regardless of what
-- came in. Video has exactly one sanitisation pass, at upload, and it was never verified to have
-- happened.
--
-- The fix makes provenance checkable rather than inspecting the artefact after the fact. This is
-- the same shape `private.sanitized_assets` already uses for `published-assets` and
-- `delivery-files`: a service_role-only attestation row is the only thing that lets a copy
-- proceed. `/designs/sanitize-video` now writes one for the clean internal object it just wrote,
-- and `register_sanitized_asset`'s `published-assets` branch refuses the copy unless that row
-- exists for the *source* the design points at. `opaque_storage_path` is deliberately not
-- reused for this: `apps/media/src/supabase.js:8-20` already documents it as bucket-agnostic --
-- it accepts the same shapes in every bucket's policy -- so it can prove a path's *shape*, never
-- its *history*.
--
-- The alternative the reviewer raised -- probing the object with `ffprobe` at publish time and
-- refusing anything still carrying tags -- was considered and rejected. It is cheaper (no new
-- table row, no new RPC) but weaker: it inspects the artefact for what it does NOT contain rather
-- than establishing where it came from, so a source that happens to have no tags a probe checks
-- for (or one stripped by some tool other than this pipeline) would pass with no attestation of
-- who processed it, when, or under what authority. Attestation is also the technique every other
-- sanitised surface in this codebase already uses, so this keeps one mechanism instead of two.

-- 1. Let the attestation table describe an internal object as well as a published/delivered one.
-- `sanitized_assets`'s primary key is `(bucket_id, storage_path)`, so this is additive: existing
-- published-assets/delivery-files rows and every check on them are untouched.
alter table private.sanitized_assets drop constraint sanitized_assets_bucket_id_check;
alter table private.sanitized_assets add constraint sanitized_assets_bucket_id_check
  check(bucket_id in ('published-assets','delivery-files','internal-assets'));

-- 2. The attestation write for a freshly sanitised internal video.
--
-- This is deliberately its own function rather than a widened `register_sanitized_asset`:
-- that function requires `p_prepared_by` to be an *agency* profile (`'Agency preparation
-- identity required'`), which is correct for a publication or a delivery -- both agency-only
-- actions -- but wrong here. `/designs/sanitize-video` is the one route in this service a
-- designer is expected to reach (mirroring `add_design`'s own `private.can_produce`: agency, or a
-- designer assigned to the project), and the media service has already authorized that caller
-- against this exact project before calling this. Reusing `register_sanitized_asset` would mean
-- either loosening its agency-only rule for the two flows that must keep it, or bypassing this
-- check for a design a designer legitimately uploaded -- both worse than a second, narrower
-- function with the identity rule its own call site actually needs.
--
-- No `source_design_id`/`source_path`: no design references this object yet. `add_design` runs
-- after this, not before -- the video is sanitised before it is ever attached to anything.
create function public.register_sanitized_video(
  p_project_id uuid, p_storage_path text, p_sha256 text, p_mime_type text,
  p_file_size bigint, p_prepared_by uuid
) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role in ('agency','designer')) then raise exception 'Production preparation identity required'; end if;
 if p_mime_type not in ('video/mp4','video/webm') then raise exception 'Unsupported sanitized video type'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='internal-assets' and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id='internal-assets' and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id='internal-assets' and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path)
   values('internal-assets',p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,null,null);
 end
$$;
revoke all on function public.register_sanitized_video(uuid,text,text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.register_sanitized_video(uuid,text,text,text,bigint,uuid) to service_role;

-- 3. The gate: a video copy into `published-assets` now requires the source to be attested.
-- Everything else about the function is unchanged -- same signature, so this preserves the
-- function's OID and its existing PUBLIC/anon revoke from 202609200008 (verified after
-- applying, the same way 202609210006 verified its own signature-preserving replace).
create or replace function public.register_sanitized_asset(p_project_id uuid,p_bucket_id text,p_storage_path text,p_sha256 text,p_mime_type text,p_file_size bigint,p_prepared_by uuid,p_source_design_id uuid default null,p_source_path text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role='agency') then raise exception 'Agency preparation identity required'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_bucket_id='published-assets' and (p_mime_type not in ('image/png','video/mp4','video/webm') or p_source_design_id is null or not exists(select 1 from public.designs where id=p_source_design_id and project_id=p_project_id and internal_asset_path=p_source_path)) then raise exception 'Publication source does not match the design'; end if;
 -- The provenance check this migration adds. Images need nothing here: `sanitizeRaster` runs
 -- again at publish time regardless of what the internal object was, so publication itself is
 -- the second sanitisation pass. Video has exactly one pass, at upload, so publication must be
 -- able to prove it happened rather than trusting the design's own claim about its asset path.
 if p_bucket_id='published-assets' and p_mime_type in ('video/mp4','video/webm') and not exists(
   select 1 from private.sanitized_assets s
    where s.bucket_id='internal-assets' and s.storage_path=p_source_path
      and s.project_id=p_project_id and s.mime_type=p_mime_type
 ) then raise exception 'Video source has no sanitisation attestation'; end if;
 if p_bucket_id='delivery-files' and p_mime_type not in ('image/png','application/pdf') then raise exception 'Unsupported sanitized delivery type'; end if;
 if not exists(select 1 from storage.objects where bucket_id=p_bucket_id and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by and s.source_design_id is not distinct from p_source_design_id and s.source_path is not distinct from p_source_path and not s.discard_requested) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path) values(p_bucket_id,p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,p_source_design_id,p_source_path);
 end
$$;

-- 4. An internal-assets attestation row is provenance, not a prepared/pending file, and has no
-- TTL: it must outlive the sanitisation call that wrote it for as long as any design references
-- the object, which can be indefinitely (an unpublished draft video). Excluded from the hourly
-- sweep entirely, rather than taught to check `designs.internal_asset_path`, because that
-- reference can be removed from a design (re-editing the working design's asset) while the
-- attestation should still stand as a historical record of what was sanitised and by whom -- the
-- object's lifecycle is Storage's, not this table's, for this bucket.
create or replace function public.list_stale_sanitized_assets() returns table(bucket_id text,storage_path text) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query select s.bucket_id,s.storage_path from private.sanitized_assets s where s.bucket_id<>'internal-assets' and (s.discard_requested or s.created_at<now()-interval '24 hours') and not exists(select 1 from public.published_designs where asset_path=s.storage_path) and not exists(select 1 from public.delivery_files f where f.storage_path=s.storage_path) order by s.created_at limit 100;
 end
$$;

-- 5. Defense in depth: even though (4) means the automated sweep never names an internal-assets
-- row, `discard_sanitized_asset` itself refuses one that a design still points at, the same way
-- it already refuses a published-assets/delivery-files row a live record still references.
create or replace function public.discard_sanitized_asset(p_bucket_id text,p_storage_path text) returns void language plpgsql security definer set search_path='' as $$
 declare target_project uuid; begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 select project_id into target_project from private.sanitized_assets where bucket_id=p_bucket_id and storage_path=p_storage_path;
 if found then perform 1 from public.projects where id=target_project for update; end if;
 if exists(select 1 from public.published_designs where asset_path=p_storage_path) or exists(select 1 from public.delivery_files where storage_path=p_storage_path) or exists(select 1 from public.designs where internal_asset_path=p_storage_path) then raise exception 'Referenced assets cannot be discarded'; end if;
 update private.sanitized_assets set discard_requested=true where bucket_id=p_bucket_id and storage_path=p_storage_path;
 end
$$;

-- Hardening pass, T1: the idempotency replay compare in `post_comment` (202609210002) used `<>`
-- for `body` while every other field used `is distinct from`. `<>` with a null operand evaluates
-- to null rather than true, and `if null then` behaves as false in plpgsql -- so a replay call
-- whose `p_body` is null (`trim(null)` is null) would silently short-circuit the mismatch check
-- for that one field instead of raising, even though every other field is compared correctly.
-- `p_body` reaching here as null is reachable: it is not declared `not null`, and nothing upstream
-- of this function guarantees non-null before the trim. One word, `is distinct from` in place of
-- `<>`, for both channels.
create or replace function public.post_comment(p_project_id uuid,p_channel text,p_body text,p_version_id uuid default null,p_design_id uuid default null,p_pin_x numeric default null,p_pin_y numeric default null,p_pin_t numeric default null,p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; target_client uuid; sender_name text; trimmed_body text; existing_internal public.internal_comments; existing_client public.client_comments; begin
 trimmed_body:=trim(p_body);
 select client_id into target_client from public.projects where id=p_project_id;
 if p_channel='internal' then
  if not private.can_produce(p_project_id) then raise exception 'Internal channel access required' using errcode='42501'; end if;
  if p_idempotency_key is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
   select * into existing_internal from public.internal_comments where idempotency_key=p_idempotency_key and project_id=p_project_id;
   if found then
    if existing_internal.version_id is distinct from p_version_id
       or existing_internal.design_id is distinct from p_design_id
       or existing_internal.body is distinct from trimmed_body
       or existing_internal.pin_x is distinct from p_pin_x
       or existing_internal.pin_y is distinct from p_pin_y
       or existing_internal.pin_t is distinct from p_pin_t
    then raise exception 'Idempotency key conflicts with a different comment'; end if;
    return existing_internal.id;
   end if;
   if exists(select 1 from public.internal_comments where idempotency_key=p_idempotency_key) then
    raise exception 'Idempotency key conflicts with a different comment';
   end if;
  end if;
  insert into public.internal_comments(project_id,version_id,design_id,author_id,body,pin_x,pin_y,pin_t,idempotency_key) values(p_project_id,p_version_id,p_design_id,auth.uid(),trimmed_body,p_pin_x,p_pin_y,p_pin_t,p_idempotency_key) returning id into result_id;
  if private.is_agency() then insert into public.notifications(user_id,client_id,project_id,title) select designer_id,target_client,p_project_id,'New studio message' from public.project_assignments where project_id=p_project_id; else perform private.notify_agency(target_client,p_project_id,'New internal message'); end if;
 elsif p_channel='client' then
  if not private.can_client_channel(p_project_id) then raise exception 'Client channel access required' using errcode='42501'; end if;
  if p_idempotency_key is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
   select * into existing_client from public.client_comments where idempotency_key=p_idempotency_key and project_id=p_project_id;
   if found then
    if existing_client.publication_id is distinct from p_version_id
       or existing_client.design_id is distinct from p_design_id
       or existing_client.body is distinct from trimmed_body
       or existing_client.pin_x is distinct from p_pin_x
       or existing_client.pin_y is distinct from p_pin_y
       or existing_client.pin_t is distinct from p_pin_t
    then raise exception 'Idempotency key conflicts with a different comment'; end if;
    return existing_client.id;
   end if;
   if exists(select 1 from public.client_comments where idempotency_key=p_idempotency_key) then
    raise exception 'Idempotency key conflicts with a different comment';
   end if;
  end if;
  select case when private.is_agency() then 'Studio' else display_name end into sender_name from public.profiles where id=auth.uid();
  insert into public.client_comments(project_id,publication_id,design_id,author_label,author_kind,body,pin_x,pin_y,pin_t,idempotency_key) values(p_project_id,p_version_id,p_design_id,sender_name,case when private.is_agency() then 'studio' else 'client' end,trimmed_body,p_pin_x,p_pin_y,p_pin_t,p_idempotency_key) returning id into result_id;
  insert into private.client_comment_authors(comment_id,author_id) values(result_id,auth.uid());
  if private.is_agency() then perform private.notify_client(target_client,p_project_id,'New message from Studio'); else perform private.notify_agency(target_client,p_project_id,'New client message'); end if;
 else raise exception 'Invalid comment channel'; end if;
 return result_id;
end $$;
