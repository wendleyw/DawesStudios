-- Competitor ads: the competitors a client's studio team follows, and the board widget that shows
-- them. Internal only: the agency writes; the agency and designers with the client's work read;
-- clients never see either table.

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  website text check (
    website is null or (website ~ '^https?://[^[:space:]]+$' and char_length(website) <= 200)
  ),
  meta_page_id text check (meta_page_id is null or meta_page_id ~ '^[0-9]{1,20}$'),
  google_advertiser_id text check (
    google_advertiser_id is null or google_advertiser_id ~ '^AR[0-9]{10,30}$'
  ),
  tiktok_advertiser text check (
    tiktok_advertiser is null
    or (tiktok_advertiser = btrim(tiktok_advertiser) and char_length(tiktok_advertiser) between 1 and 80)
  ),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index competitors_client_name_key on public.competitors (client_id, lower(name));
create trigger competitor_updated_at before update on public.competitors
  for each row execute function private.touch_updated_at();

-- Holds the client row so two simultaneous additions cannot both pass the count. Row-level
-- security is checked after this trigger, so anyone but the agency is passed through untouched:
-- the policy refuses them, and they learn nothing about the list and lock nothing.
create function private.enforce_competitor_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_agency() then
    return new;
  end if;
  perform 1 from public.clients where id = new.client_id for update;
  if (select count(*) from public.competitors where client_id = new.client_id) >= 12 then
    raise exception 'A client can follow up to 12 competitors.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke execute on function private.enforce_competitor_limit() from public, anon, authenticated;
create trigger competitor_limit before insert on public.competitors
  for each row execute function private.enforce_competitor_limit();

create table public.client_board_widgets (
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('competitor_ads')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (client_id, kind)
);

-- The studio side of a client: the agency, or a designer who holds work for it. Never a client.
create function private.can_follow_competitors(target_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(
    private.current_role() in ('agency', 'designer') and private.can_access_client(target_client),
    false
  )
$$;
revoke execute on function private.can_follow_competitors(uuid) from public, anon;
grant execute on function private.can_follow_competitors(uuid) to authenticated;

alter table public.competitors enable row level security;
alter table public.client_board_widgets enable row level security;

create policy competitors_read on public.competitors for select to authenticated
  using (private.can_follow_competitors(client_id));
create policy competitors_insert on public.competitors for insert to authenticated
  with check (private.is_agency());
create policy competitors_update on public.competitors for update to authenticated
  using (private.is_agency()) with check (private.is_agency());
create policy competitors_delete on public.competitors for delete to authenticated
  using (private.is_agency());

create policy client_board_widgets_read on public.client_board_widgets for select to authenticated
  using (private.can_follow_competitors(client_id));
create policy client_board_widgets_insert on public.client_board_widgets for insert to authenticated
  with check (private.is_agency());
create policy client_board_widgets_delete on public.client_board_widgets for delete to authenticated
  using (private.is_agency());

revoke all on public.competitors, public.client_board_widgets from anon, authenticated;
grant select, delete on public.competitors to authenticated;
grant insert (client_id, name, website, meta_page_id, google_advertiser_id, tiktok_advertiser)
  on public.competitors to authenticated;
grant update (name, website, meta_page_id, google_advertiser_id, tiktok_advertiser)
  on public.competitors to authenticated;
grant select, delete on public.client_board_widgets to authenticated;
grant insert (client_id, kind) on public.client_board_widgets to authenticated;
