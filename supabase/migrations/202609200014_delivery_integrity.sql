create unique index delivery_storage_path_unique on public.delivery_files(storage_path);
create policy internal_storage_delete on storage.objects for delete to authenticated using(
 bucket_id='internal-assets' and owner_id=auth.uid()::text and private.can_produce(private.storage_scope(name)) and not exists(
  select 1 from public.project_assets a where a.storage_path=storage.objects.name
 ) and not exists(
  select 1 from public.designs d where d.internal_asset_path=storage.objects.name
 )
);
create or replace function public.add_delivery_file(p_project_id uuid,p_name text,p_storage_path text,p_mime_type text,p_file_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; project_state public.project_status; begin
 perform private.assert_agency();
 select status into project_state from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found'; end if;
 select id into result_id from public.delivery_files where project_id=p_project_id and storage_path=p_storage_path;
 if found then return result_id; end if;
 if project_state<>'approved' then raise exception 'Approve all deliverables before adding final files'; end if;
 if split_part(p_storage_path,'/',1)<>p_project_id::text or not exists(select 1 from private.sanitized_assets s where s.bucket_id='delivery-files' and not s.discard_requested and s.storage_path=p_storage_path and s.project_id=p_project_id and s.prepared_by=auth.uid() and s.mime_type=p_mime_type and s.file_size=p_file_size) then raise exception 'Prepare a trusted sanitized delivery file for this project first'; end if;
 insert into public.delivery_files(project_id,name,storage_path,mime_type,file_size) values(p_project_id,p_name,p_storage_path,p_mime_type,p_file_size) returning id into result_id;
 return result_id;
end $$;


create or replace function public.mark_project_delivered(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare p public.projects; begin
 perform private.assert_agency(); select * into p from public.projects where id=p_project_id for update;
 if found and p.status='delivered' then return; end if;
 if not found or p.status<>'approved' then raise exception 'Approve all deliverables before delivery'; end if;
 if not exists(select 1 from public.delivery_files where project_id=p.id) then raise exception 'Add a delivery file before marking delivered'; end if;
 update public.projects set status='delivered',updated_at=now() where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;
