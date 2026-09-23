-- Brainstorming boards are separate from production and published designs. A scope has one board
-- for each role; no role, including agency, can read another role's board through these APIs.
create table public.playground_boards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients,
  project_id uuid references public.projects,
  role public.app_role not null,
  created_at timestamptz not null default now()
);
create unique index playground_client_role on public.playground_boards(client_id,role) where project_id is null;
create unique index playground_project_role on public.playground_boards(project_id,role) where project_id is not null;

create table public.playground_items (
  id uuid primary key,
  board_id uuid not null references public.playground_boards,
  kind text not null check(kind in ('note','image','file')),
  title text not null check(length(title)<=160),
  body text not null check(length(body)<=20000),
  asset_path text,
  mime_type text,
  x double precision not null check(x between -100000 and 100000),
  y double precision not null check(y between -100000 and 100000),
  width double precision not null check(width between 100 and 2400),
  height double precision not null check(height between 100 and 2400),
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check((kind='note' and asset_path is null and mime_type is null) or
        (kind in ('image','file') and asset_path is not null and mime_type is not null))
);
create index playground_items_board on public.playground_items(board_id,created_at) where deleted_at is null;
create unique index playground_item_asset on public.playground_items(asset_path) where asset_path is not null;

create function private.can_access_playground(p_board_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.playground_boards b
    where b.id=p_board_id and b.role=private.current_role()
      and private.can_access_client(b.client_id)
      and (b.project_id is null or exists(select 1 from public.projects p
        where p.id=b.project_id and p.client_id=b.client_id and private.can_access_project(p.id))))
$$;
alter table public.playground_boards enable row level security;
alter table public.playground_items enable row level security;
revoke all on public.playground_boards,public.playground_items from public,anon,authenticated;
grant select on public.playground_boards,public.playground_items to authenticated;
grant all on public.playground_boards,public.playground_items to service_role;
create policy playground_boards_read on public.playground_boards for select to authenticated
  using(private.can_access_playground(id));
create policy playground_items_read on public.playground_items for select to authenticated
  using(deleted_at is null and private.can_access_playground(board_id));

create function public.get_playground_board(p_client_id uuid,p_project_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller_role public.app_role; result_id uuid;
begin
  caller_role:=private.current_role();
  if caller_role is null or not private.can_access_client(p_client_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  if p_project_id is not null and not exists(select 1 from public.projects
    where id=p_project_id and client_id=p_client_id and private.can_access_project(id)) then
    raise exception 'The project is unavailable in this workspace' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'playground-scope:'||p_client_id::text||':'||coalesce(p_project_id::text,'client')||':'||caller_role::text,0));
  select id into result_id from public.playground_boards
    where client_id=p_client_id and project_id is not distinct from p_project_id and role=caller_role;
  if found then return result_id; end if;
  insert into public.playground_boards(client_id,project_id,role)
    values(p_client_id,p_project_id,caller_role) returning id into result_id;
  return result_id;
end $$;

create function private.playground_item_input(p_item public.playground_items) returns jsonb
language sql immutable set search_path='' as $$
  select to_jsonb(p_item)-array['board_id','revision','created_at','updated_at','deleted_at']
$$;

-- Exactly three path segments: immutable board UUID, stable item UUID and a bounded safe filename.
create function private.playground_asset_ids(p_path text) returns uuid[]
language plpgsql immutable set search_path='' as $$
begin
  if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' then
    return null;
  end if;
  return array[split_part(p_path,'/',1)::uuid,split_part(p_path,'/',2)::uuid];
end $$;

create function public.save_playground_item(p_board_id uuid,p_item jsonb,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item_id uuid; proposed public.playground_items; previous public.playground_items; path_ids uuid[];
begin
  if not private.can_access_playground(p_board_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  if jsonb_typeof(p_item) is distinct from 'object'
    or not p_item ?& array['id','kind','title','body','asset_path','mime_type','x','y','width','height']
    or (p_item-array['id','kind','title','body','asset_path','mime_type','x','y','width','height'])<>'{}'::jsonb
    or jsonb_typeof(p_item->'id') is distinct from 'string'
    or jsonb_typeof(p_item->'kind') is distinct from 'string'
    or jsonb_typeof(p_item->'title') is distinct from 'string'
    or jsonb_typeof(p_item->'body') is distinct from 'string'
    or jsonb_typeof(p_item->'x') is distinct from 'number'
    or jsonb_typeof(p_item->'y') is distinct from 'number'
    or jsonb_typeof(p_item->'width') is distinct from 'number'
    or jsonb_typeof(p_item->'height') is distinct from 'number' then
    raise exception 'Provide a complete Playground item' using errcode='22023';
  end if;
  begin
    proposed:=jsonb_populate_record(null::public.playground_items,p_item);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'The Playground item contains an invalid value' using errcode='22023';
  end;
  if proposed.id is null or proposed.kind not in ('note','image','file')
    or length(proposed.title)>160 or length(proposed.body)>20000
    or not proposed.x between -100000 and 100000 or not proposed.y between -100000 and 100000
    or not proposed.width between 100 and 2400 or not proposed.height between 100 and 2400
    or (p_expected_revision is not null and p_expected_revision<1) then
    raise exception 'The Playground item exceeds its allowed limits' using errcode='22023';
  end if;
  item_id:=proposed.id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playground-board:'||p_board_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playground-item:'||item_id::text,0));
  if not private.can_access_playground(p_board_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  select * into previous from public.playground_items where id=item_id;
  if found then
    if previous.board_id<>p_board_id or previous.deleted_at is not null then
      raise exception 'This Playground item is unavailable' using errcode='42501';
    end if;
    -- Lost-response retry: exactly the same completed insert/update returns the committed row.
    if private.playground_item_input(previous)=p_item and (
      (p_expected_revision is null and previous.revision=1) or previous.revision=p_expected_revision+1
    ) then return to_jsonb(previous)-array['created_at','updated_at','deleted_at']; end if;
    if p_expected_revision is null or previous.revision<>p_expected_revision then
      raise exception 'This item changed elsewhere. Reload the saved item before retrying.' using errcode='40001';
    end if;
    if proposed.kind is distinct from previous.kind or proposed.asset_path is distinct from previous.asset_path
      or proposed.mime_type is distinct from previous.mime_type then
      raise exception 'Create a new item to replace an attachment' using errcode='22023';
    end if;
    update public.playground_items set title=proposed.title,body=proposed.body,x=proposed.x,y=proposed.y,
      width=proposed.width,height=proposed.height,revision=revision+1,updated_at=clock_timestamp()
      where id=item_id returning * into previous;
  else
    if p_expected_revision is not null then
      raise exception 'This item is no longer available. Reload the Playground.' using errcode='40001';
    end if;
    if (select count(*) from public.playground_items where board_id=p_board_id and deleted_at is null)>=500 then
      raise exception 'This Playground can hold up to 500 items' using errcode='22023';
    end if;
    if proposed.kind='note' then
      if proposed.asset_path is not null or proposed.mime_type is not null then
        raise exception 'Notes cannot reference files' using errcode='22023';
      end if;
    else
      path_ids:=private.playground_asset_ids(proposed.asset_path);
      if path_ids is null or path_ids[1]<>p_board_id or path_ids[2]<>item_id then
        raise exception 'The file must belong to this Playground item' using errcode='42501';
      end if;
      if proposed.mime_type is null or not proposed.mime_type=any(array[
        'image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv',
        'application/rtf','text/rtf','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]) or ((proposed.kind='image')<>(proposed.mime_type like 'image/%')) then
        raise exception 'Choose a supported image or document type' using errcode='22023';
      end if;
      if not exists(select 1 from storage.objects where bucket_id='playground-assets' and name=proposed.asset_path
        and owner_id=auth.uid()::text and metadata->>'mimetype'=proposed.mime_type
        and (metadata->>'size')::bigint between 1 and 26214400) then
        raise exception 'Upload your file before saving this item' using errcode='42501';
      end if;
    end if;
    insert into public.playground_items(id,board_id,kind,title,body,asset_path,mime_type,x,y,width,height)
      values(item_id,p_board_id,proposed.kind,proposed.title,proposed.body,proposed.asset_path,proposed.mime_type,
        proposed.x,proposed.y,proposed.width,proposed.height) returning * into previous;
  end if;
  return to_jsonb(previous)-array['created_at','updated_at','deleted_at'];
end $$;

-- A tombstone preserves the exact cleanup path and revision after SQL commits, allowing the
-- browser to retry an interrupted Storage deletion without touching a newer/live item.
create function public.delete_playground_item(p_board_id uuid,p_item_id uuid,p_expected_revision integer,p_asset_path text default null)
returns text language plpgsql security definer set search_path='' as $$
declare previous public.playground_items;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playground-board:'||p_board_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playground-item:'||p_item_id::text,0));
  if not private.can_access_playground(p_board_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  select * into previous from public.playground_items where id=p_item_id and board_id=p_board_id;
  if not found then raise exception 'This Playground item is unavailable' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision<1 or previous.asset_path is distinct from p_asset_path
    or (previous.deleted_at is null and previous.revision<>p_expected_revision)
    or (previous.deleted_at is not null and previous.revision<>p_expected_revision+1) then
    raise exception 'This item changed elsewhere. Reload the saved item before deleting it.' using errcode='40001';
  end if;
  if previous.deleted_at is null then
    update public.playground_items set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1
      where id=p_item_id;
  end if;
  return previous.asset_path;
end $$;

-- Visible retry state survives losing the component or reloading the page. The role-scoped board
-- may finish any of its committed deletions; only paths with physical metadata still present are
-- returned. Repeated cleanup is safe and does not expose another board's objects or item history.
create function public.get_playground_cleanup(p_board_id uuid) returns table(path text)
language plpgsql security definer set search_path='' as $$
begin
  if not private.can_access_playground(p_board_id) then
    raise exception 'Playground access required' using errcode='42501';
  end if;
  return query select i.asset_path from public.playground_items i
    join storage.objects o on o.bucket_id='playground-assets' and o.name=i.asset_path
    where i.board_id=p_board_id and i.deleted_at is not null
    order by i.deleted_at limit 100;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
  'playground-assets','playground-assets',false,26214400,array[
    'image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv',
    'application/rtf','text/rtf','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
);

create function private.playground_asset_read(p_path text,p_owner text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[];
begin
  ids:=private.playground_asset_ids(p_path);
  if ids is null or not private.can_access_playground(ids[1]) then return false; end if;
  return coalesce(p_owner=auth.uid()::text,false) or exists(
    select 1 from public.playground_items where id=ids[2] and board_id=ids[1] and asset_path=p_path
  );
end $$;
create function private.playground_asset_insert(p_path text,p_owner text) returns boolean
language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
  ids:=private.playground_asset_ids(p_path);
  if ids is null or p_owner is distinct from auth.uid()::text or not private.can_access_playground(ids[1]) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playground-item:'||ids[2]::text,0));
  return not exists(select 1 from public.playground_items where id=ids[2]);
end $$;
create function private.playground_asset_delete(p_path text,p_owner text) returns boolean
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; previous public.playground_items;
begin
  ids:=private.playground_asset_ids(p_path);
  if ids is null or not private.can_access_playground(ids[1]) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playground-item:'||ids[2]::text,0));
  select * into previous from public.playground_items where id=ids[2];
  if not found then return coalesce(p_owner=auth.uid()::text,false); end if;
  return previous.board_id=ids[1] and previous.deleted_at is not null and previous.asset_path=p_path;
end $$;
create policy playground_assets_read on storage.objects for select to authenticated
  using(bucket_id='playground-assets' and private.playground_asset_read(name,owner_id));
create policy playground_assets_insert on storage.objects for insert to authenticated
  with check(bucket_id='playground-assets' and private.playground_asset_insert(name,owner_id));
create policy playground_assets_delete on storage.objects for delete to authenticated
  using(bucket_id='playground-assets' and private.playground_asset_delete(name,owner_id));
-- No UPDATE policy: an upload cannot overwrite a referenced or another person's object.

revoke execute on function private.can_access_playground(uuid),private.playground_asset_ids(text),
  private.playground_asset_read(text,text),private.playground_asset_insert(text,text),private.playground_asset_delete(text,text)
  from public,anon;
grant execute on function private.can_access_playground(uuid),private.playground_asset_ids(text),
  private.playground_asset_read(text,text),private.playground_asset_insert(text,text),private.playground_asset_delete(text,text)
  to authenticated;
revoke execute on function private.playground_item_input(public.playground_items) from public,anon,authenticated;
revoke execute on function public.get_playground_board(uuid,uuid),public.save_playground_item(uuid,jsonb,integer),
  public.delete_playground_item(uuid,uuid,integer,text),public.get_playground_cleanup(uuid) from public,anon;
grant execute on function public.get_playground_board(uuid,uuid),public.save_playground_item(uuid,jsonb,integer),
  public.delete_playground_item(uuid,uuid,integer,text),public.get_playground_cleanup(uuid) to authenticated;
