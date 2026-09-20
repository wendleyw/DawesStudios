-- Only the trusted media worker can attest that client-visible bytes were regenerated.
create table private.sanitized_assets (
 bucket_id text not null check(bucket_id in ('published-assets','delivery-files')),
 storage_path text not null, project_id uuid not null references public.projects,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), mime_type text not null,
 file_size bigint not null check(file_size between 1 and 52428800),
 prepared_by uuid not null references public.profiles, source_design_id uuid references public.designs,
 source_path text, created_at timestamptz not null default now(), primary key(bucket_id,storage_path)
);
create function public.register_sanitized_asset(p_project_id uuid,p_bucket_id text,p_storage_path text,p_sha256 text,p_mime_type text,p_file_size bigint,p_prepared_by uuid,p_source_design_id uuid default null,p_source_path text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role='agency') then raise exception 'Agency preparation identity required'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_bucket_id='published-assets' and (p_mime_type<>'image/png' or p_source_design_id is null or not exists(select 1 from public.designs where id=p_source_design_id and project_id=p_project_id and internal_asset_path=p_source_path)) then raise exception 'Publication source does not match the design'; end if;
 if p_bucket_id='delivery-files' and p_mime_type not in ('image/png','application/pdf') then raise exception 'Unsupported sanitized delivery type'; end if;
 if not exists(select 1 from storage.objects where bucket_id=p_bucket_id and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path) values(p_bucket_id,p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,p_source_design_id,p_source_path);
 end
$$;
create function public.discard_sanitized_asset(p_bucket_id text,p_storage_path text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if exists(select 1 from public.published_designs where asset_path=p_storage_path) or exists(select 1 from public.delivery_files where storage_path=p_storage_path) then raise exception 'Referenced assets cannot be discarded'; end if;
 delete from private.sanitized_assets where bucket_id=p_bucket_id and storage_path=p_storage_path;
 end
$$;
drop policy published_storage_insert on storage.objects;
drop policy delivery_storage_insert on storage.objects;
create or replace function public.publish_version(p_version_id uuid,p_release_note text default '',p_assets jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
 declare v public.design_versions; result_id uuid; target_client uuid; d public.designs; object_path text; next_number integer; begin
 perform private.assert_agency();
 select * into v from public.design_versions where id=p_version_id for update;
 if not found then raise exception 'Version not found'; end if;
 select publication_id into result_id from private.publication_sources where internal_version_id=v.id;
 if found then return result_id; end if;
 if not exists(select 1 from public.designs where version_id=v.id) then raise exception 'Add a design before publishing'; end if;
 perform 1 from public.deliverables where id=v.deliverable_id for update;
 select coalesce(max(version_number),0)+1 into next_number from public.published_versions where deliverable_id=v.deliverable_id;
 insert into public.published_versions(project_id,deliverable_id,version_number,release_note) values(v.project_id,v.deliverable_id,next_number,p_release_note) returning id into result_id;
 insert into private.publication_sources(publication_id,internal_version_id,published_by) values(result_id,v.id,auth.uid());
 for d in select * from public.designs where version_id=v.id order by sort_order loop
  object_path:=p_assets->>d.id::text;
  if d.internal_asset_path is not null and object_path is null then raise exception 'Prepare a sanitized publication asset for each uploaded design'; end if;
  if object_path is not null and (split_part(object_path,'/',1)<>v.project_id::text or not exists(select 1 from private.sanitized_assets s where s.bucket_id='published-assets' and s.storage_path=object_path and s.project_id=v.project_id and s.prepared_by=auth.uid() and s.source_design_id=d.id and s.source_path=d.internal_asset_path)) then raise exception 'A trusted sanitized publication asset is required for this design'; end if;
  insert into public.published_designs(project_id,publication_id,title,content,asset_path,sort_order) values(v.project_id,result_id,d.title,private.public_design_content(d.content),object_path,d.sort_order);
 end loop;
 insert into public.publication_reviews(publication_id,project_id) values(result_id,v.project_id);
 update public.design_versions set status='reviewed' where id=v.id;
 update public.projects set status='client_review',updated_at=now() where id=v.project_id returning client_id into target_client;
 perform private.notify_client(target_client,v.project_id,'New designs ready for review',p_release_note);
 perform private.audit('version.published',result_id);
 return result_id;
end $$;
create or replace function public.add_delivery_file(p_project_id uuid,p_name text,p_storage_path text,p_mime_type text,p_file_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 perform private.assert_agency();
 if split_part(p_storage_path,'/',1)<>p_project_id::text or not exists(select 1 from private.sanitized_assets s where s.bucket_id='delivery-files' and s.storage_path=p_storage_path and s.project_id=p_project_id and s.prepared_by=auth.uid() and s.mime_type=p_mime_type and s.file_size=p_file_size) then raise exception 'Prepare a trusted sanitized delivery file for this project first'; end if;
 insert into public.delivery_files(project_id,name,storage_path,mime_type,file_size) values(p_project_id,p_name,p_storage_path,p_mime_type,p_file_size) returning id into result_id;
 return result_id;
end $$;

revoke all on function public.register_sanitized_asset(uuid,text,text,text,text,bigint,uuid,uuid,text),public.discard_sanitized_asset(text,text) from public,anon,authenticated;
grant execute on function public.register_sanitized_asset(uuid,text,text,text,text,bigint,uuid,uuid,text),public.discard_sanitized_asset(text,text) to service_role;
