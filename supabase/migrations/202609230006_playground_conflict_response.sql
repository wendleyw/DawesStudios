-- PostgreSQL SQLSTATE 40001 means serialization failure, which PostgREST retries internally.
-- A stale item revision is a business conflict and retrying the same payload cannot resolve it.
-- Use the existing application's PT409 convention so the client receives an immediate HTTP 409.
create or replace function public.save_playground_item(p_board_id uuid,p_item jsonb,p_expected_revision integer default null)
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
      raise exception 'This item changed elsewhere. Reload the saved item before retrying.' using errcode='PT409';
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
      raise exception 'This item is no longer available. Reload the Playground.' using errcode='PT409';
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

create or replace function public.delete_playground_item(p_board_id uuid,p_item_id uuid,p_expected_revision integer,p_asset_path text default null)
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
    raise exception 'This item changed elsewhere. Reload the saved item before deleting it.' using errcode='PT409';
  end if;
  if previous.deleted_at is null then
    update public.playground_items set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1
      where id=p_item_id;
  end if;
  return previous.asset_path;
end $$;
