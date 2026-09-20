-- Metadata records must use their own client/project's opaque Storage scope.
alter table public.project_assets add constraint project_asset_scope_valid check(split_part(storage_path,'/',1)=project_id::text);
alter table public.brand_assets add constraint brand_asset_scope_valid check(storage_path is null or split_part(storage_path,'/',1)=client_id::text);
alter table public.designs add constraint internal_design_asset_scope_valid check(internal_asset_path is null or split_part(internal_asset_path,'/',1)=project_id::text);
alter table public.published_designs add constraint published_design_asset_scope_valid check(asset_path is null or split_part(asset_path,'/',1)=project_id::text);
alter table public.delivery_files add constraint delivery_asset_scope_valid check(split_part(storage_path,'/',1)=project_id::text);
