-- Files are private; storage paths use project/client UUIDs and random UUID filenames.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('internal-assets','internal-assets',false,52428800,array['image/png','image/jpeg','image/webp','application/pdf']),
 ('published-assets','published-assets',false,52428800,array['image/png','image/jpeg','image/webp']),
 ('brand-assets','brand-assets',false,52428800,array['image/png','image/jpeg','image/webp','application/pdf','image/svg+xml']),
 ('delivery-files','delivery-files',false,52428800,array['image/png','image/jpeg','image/webp','application/pdf','application/zip']);
create function private.storage_scope(path text) returns uuid language plpgsql immutable set search_path='' as $$
 begin return split_part(path,'/',1)::uuid; exception when invalid_text_representation then return null; end
$$;
create function private.opaque_storage_path(path text) returns boolean language sql immutable set search_path='' as $$
 select path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf|svg|zip)$'
$$;
grant execute on function private.storage_scope(text),private.opaque_storage_path(text) to authenticated;
create policy internal_storage_read on storage.objects for select to authenticated using(bucket_id='internal-assets' and private.can_produce(private.storage_scope(name)));
create policy internal_storage_insert on storage.objects for insert to authenticated with check(bucket_id='internal-assets' and private.can_produce(private.storage_scope(name)) and private.opaque_storage_path(name));
create policy published_storage_read on storage.objects for select to authenticated using(bucket_id='published-assets' and (private.is_agency() or (private.can_client_channel(private.storage_scope(name)) and exists(select 1 from public.published_designs where asset_path=name))));
create policy published_storage_insert on storage.objects for insert to authenticated with check(bucket_id='published-assets' and private.is_agency() and private.can_access_project(private.storage_scope(name)) and private.opaque_storage_path(name));
create policy brand_storage_read on storage.objects for select to authenticated using(bucket_id='brand-assets' and private.can_access_client(private.storage_scope(name)));
create policy brand_storage_insert on storage.objects for insert to authenticated with check(bucket_id='brand-assets' and private.is_agency() and private.can_access_client(private.storage_scope(name)) and private.opaque_storage_path(name));
create policy delivery_storage_read on storage.objects for select to authenticated using(bucket_id='delivery-files' and (private.is_agency() or (private.can_access_project(private.storage_scope(name)) and exists(select 1 from public.delivery_files where storage_path=name))));
create policy delivery_storage_insert on storage.objects for insert to authenticated with check(bucket_id='delivery-files' and private.is_agency() and private.can_access_project(private.storage_scope(name)) and private.opaque_storage_path(name));
-- No UPDATE policy: published/delivery bytes cannot be silently replaced.
revoke execute on function private.storage_scope(text),private.opaque_storage_path(text) from public,anon;
