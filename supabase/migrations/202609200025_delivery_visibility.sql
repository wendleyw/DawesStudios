-- Final delivery files must not reach a client before the studio marks the project delivered.
--
-- `delivery_read` and `delivery_storage_read` both gated only on can_access_project, which client
-- members satisfy. Because add_delivery_file runs before mark_project_delivered, every upload was
-- readable and downloadable by the client during the window between the two calls — an unpublished
-- production artifact reaching the client channel.
--
-- Producers (the agency, and a designer assigned to the project) keep full access so the files can
-- be prepared and checked; the client gains access only once the project reaches 'delivered'.
create or replace function private.delivery_released(target_project uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select private.can_produce(target_project)
   or exists(select 1 from public.projects p where p.id=target_project and p.status='delivered')
$$;
grant execute on function private.delivery_released(uuid) to authenticated;

alter policy delivery_read on public.delivery_files using(
 private.can_access_project(project_id) and private.delivery_released(project_id)
);

-- Keep the qualified correlation introduced in 202609200006: delivery_files also has a `name`
-- column, so an unqualified `name` here binds to it instead of storage.objects and the predicate
-- silently compares two columns of the same row.
alter policy delivery_storage_read on storage.objects using(
 bucket_id='delivery-files' and (private.is_agency() or
 (private.can_access_project(private.storage_scope(name))
  and private.delivery_released(private.storage_scope(name))
  and exists(select 1 from public.delivery_files f where f.storage_path=storage.objects.name)))
);
