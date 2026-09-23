-- Folders organize approved brand resources without moving their stored files.
create table public.brand_asset_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, client_id)
);
create unique index brand_asset_folders_client_name
  on public.brand_asset_folders(client_id, lower(name));
alter table public.brand_asset_folders enable row level security;
revoke all on public.brand_asset_folders from anon, authenticated;
grant select, delete on public.brand_asset_folders to authenticated;
grant insert(id, client_id, name), update(name) on public.brand_asset_folders to authenticated;
grant all on public.brand_asset_folders to service_role;
create policy brand_asset_folders_read on public.brand_asset_folders
  for select to authenticated using(private.can_access_client(client_id));
create policy brand_asset_folders_insert on public.brand_asset_folders
  for insert to authenticated with check(private.is_agency());
create policy brand_asset_folders_update on public.brand_asset_folders
  for update to authenticated using(private.is_agency()) with check(private.is_agency());
create policy brand_asset_folders_delete on public.brand_asset_folders
  for delete to authenticated using(private.is_agency());

alter table public.brand_assets add column folder_id uuid;
alter table public.brand_assets add constraint brand_assets_folder_client_fkey
  foreign key (folder_id, client_id) references public.brand_asset_folders(id, client_id)
  on delete set null (folder_id);
create index brand_assets_client_folder on public.brand_assets(client_id, folder_id);

comment on table public.brand_asset_folders is 'Client-scoped folders for approved brand assets. Agency manages; authorized collaborators browse.';
comment on column public.brand_assets.folder_id is 'Null means unfiled. Deleting a folder retains every asset and its Storage file.';
