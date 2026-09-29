-- Canvas campaign frames a viewer folded on a client's board. Each id is a campaign of that client
-- the viewer could see when folding it; the all-zero uuid stands for the "Studio projects" frame,
-- which groups projects without a campaign. Stale ids (a deleted campaign) are harmless: the board
-- only folds frames it renders.
alter table public.board_preferences
  add column collapsed_campaigns uuid[] not null default '{}'::uuid[],
  add constraint board_collapsed_campaigns_valid check (
    cardinality(collapsed_campaigns) <= 500
    and array_position(collapsed_campaigns, null) is null
  );

-- Written only through set_board_campaign_collapsed, which checks the campaign; there is no
-- column-level update grant for it.

-- Folds or unfolds one frame. One campaign per call, applied to the stored array inside the upsert,
-- so two tabs folding different campaigns never overwrite each other.
create function public.set_board_campaign_collapsed(
  p_client_id uuid,
  p_campaign_id uuid,
  p_collapsed boolean
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  frame uuid := coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid);
  result uuid[];
begin
  if auth.uid() is null or not private.can_access_client(p_client_id) then
    raise exception 'You cannot change this board' using errcode = '42501';
  end if;
  if p_collapsed is null then
    raise exception 'Say whether the campaign is folded' using errcode = '22023';
  end if;
  -- A real campaign must belong to this client; folding is allowed for any campaign the client
  -- has, because the frame is only drawn for campaigns the viewer can already read.
  if p_campaign_id is not null and not exists (
    select 1 from public.campaigns c where c.id = p_campaign_id and c.client_id = p_client_id
  ) then
    raise exception 'That campaign is not on this board' using errcode = '22023';
  end if;
  insert into public.board_preferences as bp (user_id, client_id, collapsed_campaigns)
  values (auth.uid(), p_client_id, case when p_collapsed then array[frame] else '{}'::uuid[] end)
  on conflict (user_id, client_id) do update set collapsed_campaigns =
    case when p_collapsed
      then array_append(array_remove(bp.collapsed_campaigns, frame), frame)
      else array_remove(bp.collapsed_campaigns, frame)
    end
  returning bp.collapsed_campaigns into result;
  return result;
end
$$;
revoke execute on function public.set_board_campaign_collapsed(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_board_campaign_collapsed(uuid, uuid, boolean) to authenticated;

comment on column public.board_preferences.collapsed_campaigns is
  'Canvas campaign frames this viewer folded; the all-zero uuid is the Studio projects frame.';
