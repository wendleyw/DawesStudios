-- A client's workspace logo, chosen by the agency in Settings > Clients and shown beside the client's
-- name on the board. The file lives in `brand-assets` under the client's own scope, so the existing
-- read and insert policies already limit who can see and upload it. Only an image the board can
-- render is accepted; brand files such as PDFs stay in the Brand Hub.
alter table public.clients add column logo_path text
  constraint clients_logo_path_scope check (
    logo_path is null
    or (
      split_part(logo_path, '/', 1) = id::text
      and logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|svg)$'
    )
  );
grant update(logo_path) on public.clients to authenticated;

-- A referenced logo is never an orphan, so the agency cannot delete the file a client still shows.
drop policy brand_storage_delete on storage.objects;
create policy brand_storage_delete on storage.objects for delete to authenticated using(
 bucket_id='brand-assets' and private.is_agency()
 and not exists(select 1 from public.brand_assets a where a.storage_path=storage.objects.name)
 and not exists(select 1 from public.clients c where c.logo_path=storage.objects.name)
);
