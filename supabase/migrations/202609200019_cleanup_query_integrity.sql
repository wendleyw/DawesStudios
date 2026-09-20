-- Qualify output-column names so the hourly cleanup queue executes correctly.
create or replace function public.discard_prepared_assets(p_paths text[]) returns text[] language plpgsql security definer set search_path='' as $$
 declare item record; removed text[]:=array[]::text[]; begin
 perform private.assert_agency();
 if coalesce(array_length(p_paths,1),0)>20 then raise exception 'Discard at most 20 prepared assets per request'; end if;
 for item in select s.project_id,s.storage_path from private.sanitized_assets s where s.bucket_id='published-assets' and s.prepared_by=auth.uid() and s.storage_path=any(p_paths) order by s.project_id,s.storage_path loop
  perform 1 from public.projects where id=item.project_id for update;
  if not exists(select 1 from public.published_designs where asset_path=item.storage_path) then
   update private.sanitized_assets set discard_requested=true where bucket_id='published-assets' and storage_path=item.storage_path and prepared_by=auth.uid();
   if found then removed:=array_append(removed,item.storage_path); end if;
  end if;
 end loop;
 return removed;
end $$;

create or replace function public.list_stale_sanitized_assets() returns table(bucket_id text,storage_path text) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query select s.bucket_id,s.storage_path from private.sanitized_assets s where (s.discard_requested or s.created_at<now()-interval '24 hours') and not exists(select 1 from public.published_designs where asset_path=s.storage_path) and not exists(select 1 from public.delivery_files f where f.storage_path=s.storage_path) order by s.created_at limit 100;
 end
$$;
