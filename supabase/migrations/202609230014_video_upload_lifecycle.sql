-- Video upload lifecycle: source_path provenance for retry idempotency, and a service_role-only
-- sweep for internal-assets objects the existing list_stale_sanitized_assets deliberately
-- excludes (see 202609210007's comment on that exclusion). Raw .raw uploads never get an
-- attestation row at all, and an attested internal video is provenance with "no TTL" by that same
-- comment -- so cleaning either one needs its own path, scoped to internal-assets only, rather
-- than widening the existing sweep's meaning.
-- docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md

-- 1. register_sanitized_video gains p_source_path, so a later retry can find the exact output a
-- given raw upload already produced. The parameter list changes, so this cannot be a same-
-- signature create or replace the way 202609210007 kept for register_sanitized_asset -- the old
-- six-argument overload is dropped explicitly, rather than left behind as dead, still-granted
-- surface nothing calls.
drop function public.register_sanitized_video(uuid,text,text,text,bigint,uuid);
create function public.register_sanitized_video(
  p_project_id uuid, p_storage_path text, p_sha256 text, p_mime_type text,
  p_file_size bigint, p_prepared_by uuid, p_source_path text default null
) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role in ('agency','designer')) then raise exception 'Production preparation identity required'; end if;
 if p_mime_type not in ('video/mp4','video/webm') then raise exception 'Unsupported sanitized video type'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_source_path is not null and (private.storage_scope(p_source_path)<>p_project_id or not private.opaque_storage_path(p_source_path)) then raise exception 'Invalid source storage path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='internal-assets' and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id='internal-assets' and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id='internal-assets' and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by and s.source_path is not distinct from p_source_path) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path)
   values('internal-assets',p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,null,p_source_path);
 end
$$;
revoke all on function public.register_sanitized_video(uuid,text,text,text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.register_sanitized_video(uuid,text,text,text,bigint,uuid,text) to service_role;

-- 2. The idempotent-retry lookup. `private` is not exposed to PostgREST (supabase/config.toml
-- exposes public alone), so the media service -- which only ever speaks REST/RPC, never a direct
-- Postgres connection -- needs a function to ask "has this exact raw path already produced an
-- attested output?" the same way it already needs one to write that attestation. An output is
-- aged by its storage object, the same clock the sweep below uses, so no output is ever offered
-- for retry while the sweep may remove it; and joining the object means an attestation whose
-- object is already gone is never offered at all.
create function public.find_sanitized_video_by_source(p_project_id uuid, p_source_path text) returns table(storage_path text, mime_type text) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query select s.storage_path, s.mime_type from private.sanitized_assets s
   join storage.objects o on o.bucket_id=s.bucket_id and o.name=s.storage_path
   where s.bucket_id='internal-assets' and s.project_id=p_project_id and s.source_path=p_source_path
     and o.created_at>=now()-interval '24 hours'
   order by o.created_at desc limit 1;
 end
$$;
revoke all on function public.find_sanitized_video_by_source(uuid,text) from public,anon,authenticated;
grant execute on function public.find_sanitized_video_by_source(uuid,text) to service_role;

-- 3. The cleanup sweep for internal-assets: raw .raw uploads (never attested, aged off
-- storage.objects.created_at since they have no attestation row to carry their own timestamp) and
-- attested outputs nothing references any more. `designs.internal_asset_path` and
-- `project_assets.storage_path` are the two columns that can hold an internal-assets path (the
-- same pair the internal_storage_delete policy in 202609200014 protects). `attested` tells the
-- caller which discard path applies -- a raw object was never part of the attestation lifecycle,
-- so routing it through discard_sanitized_asset/finalize_asset_discard would be two guaranteed
-- no-op RPC calls per file, not a correctness requirement.
create function public.list_stale_video_uploads() returns table(bucket_id text, storage_path text, attested boolean) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query
   select stale.bucket_id, stale.storage_path, stale.attested from (
     select 'internal-assets'::text as bucket_id, o.name as storage_path, false as attested, o.created_at as staleness
       from storage.objects o
      where o.bucket_id='internal-assets' and o.name like '%.raw' and o.created_at<now()-interval '24 hours'
     union all
     select s.bucket_id, s.storage_path, true, o.created_at
       from private.sanitized_assets s
       join storage.objects o on o.bucket_id=s.bucket_id and o.name=s.storage_path
      where s.bucket_id='internal-assets' and o.created_at<now()-interval '24 hours'
        and not exists(select 1 from public.designs d where d.internal_asset_path=s.storage_path)
        and not exists(select 1 from public.project_assets a where a.storage_path=s.storage_path)
   ) stale order by stale.staleness limit 100;
 end
$$;
revoke all on function public.list_stale_video_uploads() from public,anon,authenticated;
grant execute on function public.list_stale_video_uploads() to service_role;
