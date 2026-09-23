-- Recover uploads abandoned before the item save, including a closed/reloaded browser. A full day
-- protects current drafts. Only the current uploader's unclaimed objects are eligible; committed
-- item deletions remain recoverable by every authorized collaborator in the role board.
create or replace function public.get_playground_cleanup(p_board_id uuid) returns table(path text)
language plpgsql security definer set search_path='' as $$
begin
  if not private.can_access_playground(p_board_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  return query select candidates.asset_path from (
    select i.asset_path,i.deleted_at as eligible_at from public.playground_items i
      join storage.objects o on o.bucket_id='playground-assets' and o.name=i.asset_path
      where i.board_id=p_board_id and i.deleted_at is not null
    union all
    select o.name,o.created_at from storage.objects o
      where o.bucket_id='playground-assets'
        and (private.playground_asset_ids(o.name))[1]=p_board_id
        and o.owner_id=auth.uid()::text and o.created_at<now()-interval '24 hours'
        and not exists(select 1 from public.playground_items i
          where i.id=(private.playground_asset_ids(o.name))[2])
  ) candidates order by candidates.eligible_at limit 100;
end $$;
revoke execute on function public.get_playground_cleanup(uuid) from public,anon;
grant execute on function public.get_playground_cleanup(uuid) to authenticated;

-- The existing item-locking Storage DELETE policy rechecks that an unclaimed item has not been
-- saved since discovery. If saving won the lock, the object is retained. If cleanup won, the save
-- reports the missing upload and the component may restage its retained File with the same path.
