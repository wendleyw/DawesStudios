-- Project covers: one sanitized PNG per project, set by the agency, optionally visible to the
-- client. Every object in the `project-covers` bucket is a re-encode written by the trusted media
-- worker (`POST /covers/prepare`), attested through `register_sanitized_asset`. Browsers never
-- write the bucket: there is no insert policy, only the service role writes objects, and the RPCs
-- below are the only writers of `public.project_covers`.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-covers','project-covers',false,10485760,array['image/png']);

-- 1. The attestation table also describes a cover.
alter table private.sanitized_assets drop constraint sanitized_assets_bucket_id_check;
alter table private.sanitized_assets add constraint sanitized_assets_bucket_id_check
  check(bucket_id in ('published-assets','delivery-files','internal-assets','project-covers'));

-- 2. The table. Designers and the agency read every row of a project they produce; client members
-- read a row only while it is client-visible. `updated_by` is not readable through the API (the
-- 202609260011 column-privilege pattern).
create table public.project_covers (
  project_id uuid primary key references public.projects on delete cascade,
  storage_path text not null unique,
  client_visible boolean not null default false,
  updated_by uuid not null references public.profiles,
  updated_at timestamptz not null default now()
);
alter table public.project_covers enable row level security;
create policy project_covers_read on public.project_covers for select to authenticated
  using(private.can_produce(project_id) or (client_visible and private.can_client_channel(project_id)));
revoke all on public.project_covers from public, anon, authenticated;
grant select (project_id, storage_path, client_visible, updated_at) on public.project_covers to authenticated;
grant all on public.project_covers to service_role;

-- 3. Storage read. The row check runs as definer so the table's own RLS is not re-entered.
create function private.can_read_project_cover(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_covers c where c.storage_path=object_name
   and (private.can_produce(c.project_id) or (c.client_visible and private.can_client_channel(c.project_id))))
$$;
revoke all on function private.can_read_project_cover(text) from public, anon;
grant execute on function private.can_read_project_cover(text) to authenticated;
create policy project_covers_storage_read on storage.objects for select to authenticated
  using(bucket_id='project-covers' and private.can_read_project_cover(name));

-- 4. Attestation: a cover is a PNG with no source design. Body copied from
-- 202609210007_video_provenance_attestation.sql plus the one `project-covers` line; the signature
-- is unchanged, so its existing grants (service_role only) are kept.
create or replace function public.register_sanitized_asset(p_project_id uuid,p_bucket_id text,p_storage_path text,p_sha256 text,p_mime_type text,p_file_size bigint,p_prepared_by uuid,p_source_design_id uuid default null,p_source_path text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role='agency') then raise exception 'Agency preparation identity required'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_bucket_id='published-assets' and (p_mime_type not in ('image/png','video/mp4','video/webm') or p_source_design_id is null or not exists(select 1 from public.designs where id=p_source_design_id and project_id=p_project_id and internal_asset_path=p_source_path)) then raise exception 'Publication source does not match the design'; end if;
 if p_bucket_id='published-assets' and p_mime_type in ('video/mp4','video/webm') and not exists(
   select 1 from private.sanitized_assets s
    where s.bucket_id='internal-assets' and s.storage_path=p_source_path
      and s.project_id=p_project_id and s.mime_type=p_mime_type
 ) then raise exception 'Video source has no sanitisation attestation'; end if;
 if p_bucket_id='delivery-files' and p_mime_type not in ('image/png','application/pdf') then raise exception 'Unsupported sanitized delivery type'; end if;
 if p_bucket_id='project-covers' and (p_mime_type<>'image/png' or p_source_design_id is not null) then raise exception 'Unsupported sanitized cover' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id=p_bucket_id and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id=p_bucket_id and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by and s.source_design_id is not distinct from p_source_design_id and s.source_path is not distinct from p_source_path and not s.discard_requested) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path) values(p_bucket_id,p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,p_source_design_id,p_source_path);
 end
$$;

-- 5. Cleanup never takes a live cover: the hourly sweep skips it and discard refuses it, the same
-- way both already treat a referenced publication or delivery. A replaced or cleared cover is no
-- longer referenced, so the media worker (or the sweep after 24 hours) removes it.
create or replace function public.list_stale_sanitized_assets() returns table(bucket_id text,storage_path text) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query select s.bucket_id,s.storage_path from private.sanitized_assets s where s.bucket_id<>'internal-assets' and (s.discard_requested or s.created_at<now()-interval '24 hours') and not exists(select 1 from public.published_designs where asset_path=s.storage_path) and not exists(select 1 from public.delivery_files f where f.storage_path=s.storage_path) and not exists(select 1 from public.project_covers c where c.storage_path=s.storage_path) order by s.created_at limit 100;
 end
$$;
create or replace function public.discard_sanitized_asset(p_bucket_id text,p_storage_path text) returns void language plpgsql security definer set search_path='' as $$
 declare target_project uuid; begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 select project_id into target_project from private.sanitized_assets where bucket_id=p_bucket_id and storage_path=p_storage_path;
 if found then perform 1 from public.projects where id=target_project for update; end if;
 if exists(select 1 from public.published_designs where asset_path=p_storage_path) or exists(select 1 from public.delivery_files where storage_path=p_storage_path) or exists(select 1 from public.designs where internal_asset_path=p_storage_path) or exists(select 1 from public.project_covers where storage_path=p_storage_path) then raise exception 'Referenced assets cannot be discarded'; end if;
 update private.sanitized_assets set discard_requested=true where bucket_id=p_bucket_id and storage_path=p_storage_path;
 end
$$;

-- 6. The agency-only writers. Each locks the project row first, which serializes them with each
-- other and with `discard_sanitized_asset` (which locks the same row).
create function public.set_project_cover(p_project_id uuid, p_storage_path text, p_client_visible boolean default false) returns text language plpgsql security definer set search_path='' as $$
 declare previous_path text; begin
 perform private.assert_agency();
 perform 1 from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 if private.storage_scope(p_storage_path) is distinct from p_project_id or not exists(
   select 1 from private.sanitized_assets s
    where s.bucket_id='project-covers' and s.storage_path=p_storage_path and s.project_id=p_project_id
      and s.prepared_by=auth.uid() and not s.discard_requested
 ) then raise exception 'Prepare the cover through the media service' using errcode='22023'; end if;
 select storage_path into previous_path from public.project_covers where project_id=p_project_id for update;
 insert into public.project_covers(project_id,storage_path,client_visible,updated_by,updated_at)
   values(p_project_id,p_storage_path,coalesce(p_client_visible,false),auth.uid(),now())
   on conflict(project_id) do update set storage_path=excluded.storage_path, client_visible=excluded.client_visible,
     updated_by=excluded.updated_by, updated_at=excluded.updated_at;
 perform private.audit('project.cover_set', p_project_id, jsonb_build_object('client_visible', coalesce(p_client_visible,false)));
 if previous_path=p_storage_path then return null; end if;
 return previous_path;
 end
$$;
create function public.set_project_cover_visibility(p_project_id uuid, p_client_visible boolean) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.assert_agency();
 perform 1 from public.projects where id=p_project_id for update;
 update public.project_covers set client_visible=coalesce(p_client_visible,false), updated_by=auth.uid(), updated_at=now()
   where project_id=p_project_id;
 if not found then raise exception 'Project cover not found' using errcode='P0002'; end if;
 perform private.audit('project.cover_visibility_set', p_project_id, jsonb_build_object('client_visible', coalesce(p_client_visible,false)));
 end
$$;
create function public.clear_project_cover(p_project_id uuid) returns text language plpgsql security definer set search_path='' as $$
 declare removed_path text; begin
 perform private.assert_agency();
 perform 1 from public.projects where id=p_project_id for update;
 delete from public.project_covers where project_id=p_project_id returning storage_path into removed_path;
 if removed_path is not null then perform private.audit('project.cover_cleared', p_project_id); end if;
 return removed_path;
 end
$$;
revoke all on function public.set_project_cover(uuid,text,boolean), public.set_project_cover_visibility(uuid,boolean), public.clear_project_cover(uuid) from public, anon;
grant execute on function public.set_project_cover(uuid,text,boolean), public.set_project_cover_visibility(uuid,boolean), public.clear_project_cover(uuid) to authenticated;
