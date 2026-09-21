-- Task 10: publish a video to the client.
--
-- `register_sanitized_asset` (202609200017_repeatable_asset_registration.sql) gated
-- `published-assets` registration to `image/png` only, so a `video/mp4` (or `video/webm`)
-- registration raised even though Task 9 already widened the bucket and the attestation
-- table's file-size ceiling to accept video bytes (202609210004_video_storage.sql). That left
-- every capacity those tasks opened inert for video until this widens the last gate.
--
-- Published designs may now be video as well as a sanitised PNG. Everything else about the
-- gate is unchanged and deliberately so: the registration still requires a source design
-- whose `internal_asset_path` is the object being published, which is what stops an
-- arbitrary object entering a client publication.
--
-- `delivery-files` is NOT widened here. A delivery is a final file, its bucket keeps its
-- 50 MiB ceiling, and video was never part of that path.
--
-- The signature is byte-for-byte the same as 202609200017's (same parameter names, types,
-- order and defaults), so `create or replace` preserves the function's OID and therefore its
-- ACL -- `register_sanitized_asset` stays revoked from public/anon/authenticated and granted
-- only to service_role, exactly as 202609200008_trusted_media.sql originally set it. This was
-- verified after applying (see task-10-report.md) rather than assumed, because
-- 202609210002_post_comment_replay_hardening.sql records a case (Task 1) where a signature
-- change silently reverted a function to the schema's default PUBLIC/anon EXECUTE grant.
create or replace function public.register_sanitized_asset(p_project_id uuid,p_bucket_id text,p_storage_path text,p_sha256 text,p_mime_type text,p_file_size bigint,p_prepared_by uuid,p_source_design_id uuid default null,p_source_path text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role='agency') then raise exception 'Agency preparation identity required'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_bucket_id='published-assets' and (p_mime_type not in ('image/png','video/mp4','video/webm') or p_source_design_id is null or not exists(select 1 from public.designs where id=p_source_design_id and project_id=p_project_id and internal_asset_path=p_source_path)) then raise exception 'Publication source does not match the design'; end if;
 if p_bucket_id='delivery-files' and p_mime_type not in ('image/png','application/pdf') then raise exception 'Unsupported sanitized delivery type'; end if;
 if not exists(select 1 from storage.objects where bucket_id=p_bucket_id and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by and s.source_design_id is not distinct from p_source_design_id and s.source_path is not distinct from p_source_path and not s.discard_requested) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path) values(p_bucket_id,p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,p_source_design_id,p_source_path);
 end
$$;
