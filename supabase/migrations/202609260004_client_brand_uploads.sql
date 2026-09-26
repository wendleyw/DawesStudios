-- Clients contribute to their own Brand Hub Assets: they may create folders and upload raster
-- images. Renaming or deleting folders, moving or editing assets, and every other file type stay
-- with the agency. SVG is excluded for clients because it can carry script.

drop policy brand_asset_folders_insert on public.brand_asset_folders;
create policy brand_asset_folders_insert on public.brand_asset_folders
  for insert to authenticated
  with check (private.is_agency() or private.is_client_member(client_id));

create policy brand_assets_client_insert on public.brand_assets
  for insert to authenticated
  with check (
    private.is_client_member(client_id)
    and mime_type in ('image/png', 'image/jpeg', 'image/webp')
    and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'
  );

create policy brand_storage_client_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and private.is_client_member(private.storage_scope(name))
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'
  );

-- A client may remove only an unreferenced file it uploaded itself: the cleanup after a failed
-- asset insert. A file an asset or the client logo points at is never an orphan.
create policy brand_storage_client_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and owner_id = auth.uid()::text
    and private.is_client_member(private.storage_scope(name))
    and not exists (select 1 from public.brand_assets a where a.storage_path = storage.objects.name)
    and not exists (select 1 from public.clients c where c.logo_path = storage.objects.name)
  );

comment on table public.brand_asset_folders is
  'Client-scoped folders for approved brand assets. Agency manages; client members may create; authorized collaborators browse.';
