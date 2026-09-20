-- Deleted-row realtime payloads do not apply SELECT RLS. This dedicated studio needs insert/update events only.
alter publication supabase_realtime set (publish='insert,update');
alter table public.projects add constraint project_board_position_valid check (
 case when jsonb_typeof(board_position)='object' and jsonb_typeof(board_position->'x')='number' and jsonb_typeof(board_position->'y')='number' then
  (board_position->>'x')::numeric between -1000000 and 1000000 and (board_position->>'y')::numeric between -1000000 and 1000000
 else false end
);
