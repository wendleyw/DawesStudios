-- An internal due date per design board, so the agency can ask a designer to deliver before the
-- date the client sees. Boards are never readable by a client (`design_boards_read` admits the
-- agency and the board's designer), so the date stays internal without column privileges.

alter table public.design_boards add column due_date date;

-- The board's date may not fall after the project's own due date. A project without a due date
-- accepts any board date.
create function private.assert_board_due_date(p_project_id uuid, p_due_date date)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if p_due_date is not null and exists(
    select 1 from public.projects
    where id = p_project_id and due_date is not null and p_due_date > due_date
  ) then
    raise exception 'Set the board''s due date on or before the project''s due date'
      using errcode = '22023';
  end if;
end $$;
revoke execute on function private.assert_board_due_date(uuid, date) from public, anon, authenticated;

-- The two board writes gain an optional due date. The old signatures are dropped rather than
-- overloaded, so a call without the date stays unambiguous.
drop function public.create_design_board(uuid, text, text, uuid);
drop function public.update_design_board(uuid, text, text, uuid);

create function public.create_design_board(p_project_id uuid, p_name text, p_url text,
  p_designer_id uuid, p_due_date date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_board text; v_widget text; result_id uuid;
begin
  perform private.assert_agency();
  if not exists(select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Name the board (up to 80 characters)' using errcode = '22023';
  end if;
  if not exists(select 1 from public.project_assignments where project_id = p_project_id and designer_id = p_designer_id) then
    raise exception 'Assign this designer to the project first' using errcode = '22023';
  end if;
  perform private.assert_board_due_date(p_project_id, p_due_date);
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  begin
    insert into public.design_boards(project_id, name, designer_id, board_id, widget_id, due_date, created_by)
    values (p_project_id, v_name, p_designer_id, v_board, v_widget, p_due_date, auth.uid())
    returning id into result_id;
  exception when unique_violation then
    raise exception 'A board with this name already exists in this project' using errcode = '23505';
  end;
  perform private.audit('design_board.created', result_id, jsonb_build_object('project', p_project_id));
  return result_id;
end $$;

create function public.update_design_board(p_board_id uuid, p_name text, p_url text,
  p_designer_id uuid, p_due_date date default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name, '')); b public.design_boards; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select * into b from public.design_boards where id = p_board_id for update;
  if not found then raise exception 'Board not found' using errcode = 'P0002'; end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Name the board (up to 80 characters)' using errcode = '22023';
  end if;
  if not exists(select 1 from public.project_assignments where project_id = b.project_id and designer_id = p_designer_id) then
    raise exception 'Assign this designer to the project first' using errcode = '22023';
  end if;
  perform private.assert_board_due_date(b.project_id, p_due_date);
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  begin
    update public.design_boards set name = v_name, designer_id = p_designer_id, board_id = v_board,
      widget_id = v_widget, due_date = p_due_date, updated_at = now() where id = p_board_id;
  exception when unique_violation then
    raise exception 'A board with this name already exists in this project' using errcode = '23505';
  end;
  perform private.audit('design_board.updated', p_board_id, jsonb_build_object('project', b.project_id));
end $$;

revoke execute on function public.create_design_board(uuid, text, text, uuid, date),
  public.update_design_board(uuid, text, text, uuid, date) from public, anon;
grant execute on function public.create_design_board(uuid, text, text, uuid, date),
  public.update_design_board(uuid, text, text, uuid, date) to authenticated;
