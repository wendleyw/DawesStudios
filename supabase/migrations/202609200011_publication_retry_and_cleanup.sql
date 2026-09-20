alter table private.publication_sources drop constraint publication_sources_internal_version_id_key;
alter table private.publication_sources add column request_key uuid not null default gen_random_uuid();
alter table private.publication_sources add column request_note text not null default '';
update private.publication_sources s set request_note=v.release_note from public.published_versions v where v.id=s.publication_id;
create unique index publication_request_key on private.publication_sources(request_key);
create index publication_internal_version on private.publication_sources(internal_version_id);
drop function public.publish_version(uuid,text,jsonb);
create or replace function public.publish_version(p_version_id uuid,p_release_note text default '',p_assets jsonb default '{}',p_idempotency_key uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare v public.design_versions; result_id uuid; target_client uuid; d public.designs; object_path text; next_number integer; existing private.publication_sources; begin
 perform private.assert_agency();
 if p_idempotency_key is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0)); end if;
 select * into v from public.design_versions where id=p_version_id for update;
 if not found then raise exception 'Version not found'; end if;
 perform 1 from public.projects where id=v.project_id for update;
 if p_idempotency_key is null then
  select publication_id into result_id from private.publication_sources where internal_version_id=v.id order by publication_id limit 1;
  if found then return result_id; end if;
  p_idempotency_key:=gen_random_uuid();
 end if;
 select * into existing from private.publication_sources where request_key=p_idempotency_key;
 if found then
  if existing.internal_version_id<>v.id or existing.published_by<>auth.uid() or existing.request_note<>p_release_note then raise exception 'Idempotency key conflicts with a different publication'; end if;
  return existing.publication_id;
 end if;
 if not exists(select 1 from public.designs where version_id=v.id) then raise exception 'Add a design before publishing'; end if;
 perform 1 from public.deliverables where id=v.deliverable_id for update;
 select coalesce(max(version_number),0)+1 into next_number from public.published_versions where deliverable_id=v.deliverable_id;
 insert into public.published_versions(project_id,deliverable_id,version_number,release_note) values(v.project_id,v.deliverable_id,next_number,p_release_note) returning id into result_id;
 insert into private.publication_sources(publication_id,internal_version_id,published_by,request_key,request_note) values(result_id,v.id,auth.uid(),p_idempotency_key,p_release_note);
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

create function public.discard_prepared_assets(p_paths text[]) returns text[] language plpgsql security definer set search_path='' as $$
 declare item record; removed text[]:='{}'; begin
 perform private.assert_agency();
 if coalesce(array_length(p_paths,1),0)>20 then raise exception 'Discard at most 20 prepared assets per request'; end if;
 for item in select s.project_id,s.storage_path from private.sanitized_assets s where s.bucket_id='published-assets' and s.prepared_by=auth.uid() and s.storage_path=any(p_paths) order by s.project_id,s.storage_path loop
  perform 1 from public.projects where id=item.project_id for update;
  if not exists(select 1 from public.published_designs where asset_path=item.storage_path) then
   delete from private.sanitized_assets where bucket_id='published-assets' and storage_path=item.storage_path and prepared_by=auth.uid();
   if found then removed:=array_append(removed,item.storage_path); end if;
  end if;
 end loop;
 return removed;
end $$;
create or replace function public.discard_sanitized_asset(p_bucket_id text,p_storage_path text) returns void language plpgsql security definer set search_path='' as $$
 declare target_project uuid; begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 select project_id into target_project from private.sanitized_assets where bucket_id=p_bucket_id and storage_path=p_storage_path;
 if found then perform 1 from public.projects where id=target_project for update; end if;
 if exists(select 1 from public.published_designs where asset_path=p_storage_path) or exists(select 1 from public.delivery_files where storage_path=p_storage_path) then raise exception 'Referenced assets cannot be discarded'; end if;
 delete from private.sanitized_assets where bucket_id=p_bucket_id and storage_path=p_storage_path;
 end
$$;
revoke execute on function public.publish_version(uuid,text,jsonb,uuid),public.discard_prepared_assets(text[]) from public,anon;
grant execute on function public.publish_version(uuid,text,jsonb,uuid),public.discard_prepared_assets(text[]) to authenticated;
create or replace function public.add_delivery_file(p_project_id uuid,p_name text,p_storage_path text,p_mime_type text,p_file_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 perform private.assert_agency();
 perform 1 from public.projects where id=p_project_id for update;
 if split_part(p_storage_path,'/',1)<>p_project_id::text or not exists(select 1 from private.sanitized_assets s where s.bucket_id='delivery-files' and s.storage_path=p_storage_path and s.project_id=p_project_id and s.prepared_by=auth.uid() and s.mime_type=p_mime_type and s.file_size=p_file_size) then raise exception 'Prepare a trusted sanitized delivery file for this project first'; end if;
 insert into public.delivery_files(project_id,name,storage_path,mime_type,file_size) values(p_project_id,p_name,p_storage_path,p_mime_type,p_file_size) returning id into result_id;
 return result_id;
end $$;

