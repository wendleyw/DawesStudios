-- Brand Hub Assets becomes a directory: folders nest inside folders, and a link (a name and an
-- HTTPS address) is an asset like any file. Whoever may upload an image may also add a link.

alter table public.brand_asset_folders add column parent_id uuid;
alter table public.brand_asset_folders add constraint brand_asset_folders_parent_fkey
  foreign key (parent_id, client_id) references public.brand_asset_folders(id, client_id);
alter table public.brand_asset_folders add constraint brand_asset_folders_not_own_parent
  check (parent_id is distinct from id);
create index brand_asset_folders_parent on public.brand_asset_folders(client_id, parent_id);

-- Names are unique among siblings rather than across the whole client.
drop index public.brand_asset_folders_client_name;
create unique index brand_asset_folders_sibling_name on public.brand_asset_folders(
  client_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)
);

-- A folder gets its parent when it is created and keeps it: with no way to move a folder there is
-- no way to form a cycle. Depth is bounded so paths stay readable.
grant insert(parent_id) on public.brand_asset_folders to authenticated;

create function private.brand_folder_depth_guard() returns trigger
language plpgsql set search_path = '' as $$
declare depth integer;
begin
  if new.parent_id is null then return new; end if;
  with recursive chain(id, parent_id, level) as (
    select f.id, f.parent_id, 1 from public.brand_asset_folders f where f.id = new.parent_id
    union all
    select f.id, f.parent_id, c.level + 1
    from public.brand_asset_folders f join chain c on f.id = c.parent_id
    where c.level < 10
  )
  select max(level) into depth from chain;
  if depth >= 6 then
    raise exception 'Folders can be nested at most six levels deep' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger brand_folder_depth_guard before insert on public.brand_asset_folders
  for each row execute function private.brand_folder_depth_guard();

-- Deleting a folder keeps everything in it: its subfolders and assets move up to its parent. Only
-- the agency may delete a folder (RLS), and parent_id is not otherwise updatable, so this runs as
-- its owner.
create function private.brand_folder_release_contents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.brand_asset_folders set parent_id = old.parent_id where parent_id = old.id;
  update public.brand_assets set folder_id = old.parent_id where folder_id = old.id;
  return old;
end $$;
create trigger brand_folder_release_contents before delete on public.brand_asset_folders
  for each row execute function private.brand_folder_release_contents();
revoke execute on function private.brand_folder_depth_guard(), private.brand_folder_release_contents()
  from public, anon, authenticated;

alter table public.brand_assets add column link_url text;
alter table public.brand_assets add constraint brand_assets_link_valid check (
  link_url is null or (
    link_url ~ '^https://[^\s/$.?#][^\s]*$'
    and char_length(link_url) <= 2000
    and storage_path is null
    and mime_type is null
  )
);

drop policy brand_assets_client_insert on public.brand_assets;
create policy brand_assets_client_insert on public.brand_assets
  for insert to authenticated
  with check (
    private.is_client_member(client_id)
    and (
      (
        link_url is null
        and mime_type in ('image/png', 'image/jpeg', 'image/webp')
        and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'
      )
      or (link_url is not null and storage_path is null and mime_type is null)
    )
  );

comment on column public.brand_asset_folders.parent_id is
  'Null for a top-level folder. Set on creation only; deleting a folder moves its contents to its parent.';
comment on column public.brand_assets.link_url is
  'An HTTPS address for a link asset, which has no stored file.';
