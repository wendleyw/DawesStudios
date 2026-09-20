-- Qualify correlated object names because delivery/attachment records also have a `name` column.
alter policy delivery_storage_read on storage.objects using(
 bucket_id='delivery-files' and (private.is_agency() or
 (private.can_access_project(private.storage_scope(name)) and exists(
  select 1 from public.delivery_files f where f.storage_path=storage.objects.name
 )))
);
alter policy briefing_storage_delete on storage.objects using(
 bucket_id='briefing-files' and private.can_edit_briefing(private.storage_scope(name)) and not exists(
  select 1 from public.briefing_attachments a where a.storage_path=storage.objects.name
 )
);
