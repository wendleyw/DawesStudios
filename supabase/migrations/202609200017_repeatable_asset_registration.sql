create or replace function public.register_sanitized_asset(p_project_id uuid,p_bucket_id text,p_storage_path text,p_sha256 text,p_mime_type text,p_file_size bigint,p_prepared_by uuid,p_source_design_id uuid default null,p_source_path text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role='agency') then raise exception 'Agency preparation identity required'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_bucket_id='published-assets' and (p_mime_type<>'image/png' or p_source_design_id is null or not exists(select 1 from public.designs where id=p_source_design_id and project_id=p_project_id and internal_asset_path=p_source_path)) then raise exception 'Publication source does not match the design'; end if;
 if p_bucket_id='delivery-files' and p_mime_type not in ('image/png','application/pdf') then raise exception 'Unsupported sanitized delivery type'; end if;
 if not exists(select 1 from storage.objects where bucket_id=p_bucket_id and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by and s.source_design_id is not distinct from p_source_design_id and s.source_path is not distinct from p_source_path and not s.discard_requested) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path) values(p_bucket_id,p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,p_source_design_id,p_source_path);
 end
$$;
