-- A client logo is raster-only. An SVG opened directly from its signed Storage URL can run script,
-- and the logo is shown to every member of the client, so SVG stays a Brand Hub file only.
alter table public.clients drop constraint clients_logo_path_scope;
alter table public.clients add constraint clients_logo_path_scope check (
  logo_path is null
  or (
    split_part(logo_path, '/', 1) = id::text
    and logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'
  )
);
