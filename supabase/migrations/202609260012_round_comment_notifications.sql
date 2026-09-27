-- An internal comment on a Miro-workspace round must only notify that round's designer, not every
-- designer assigned to the project. Comments without a version, or on a per-deliverable version,
-- keep notifying every assigned designer exactly as before.
create or replace function public.post_comment(p_project_id uuid,p_channel text,p_body text,p_version_id uuid default null,p_design_id uuid default null,p_pin_x numeric default null,p_pin_y numeric default null,p_pin_t numeric default null,p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; target_client uuid; sender_name text; trimmed_body text; existing_internal public.internal_comments; existing_client public.client_comments; begin
 trimmed_body:=trim(p_body);
 select client_id into target_client from public.projects where id=p_project_id;
 if p_channel='internal' then
  if not private.can_produce(p_project_id) then raise exception 'Internal channel access required' using errcode='42501'; end if;
  if p_idempotency_key is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
   select * into existing_internal from public.internal_comments where idempotency_key=p_idempotency_key and project_id=p_project_id;
   if found then
    if existing_internal.version_id is distinct from p_version_id
       or existing_internal.design_id is distinct from p_design_id
       or existing_internal.body is distinct from trimmed_body
       or existing_internal.pin_x is distinct from p_pin_x
       or existing_internal.pin_y is distinct from p_pin_y
       or existing_internal.pin_t is distinct from p_pin_t
    then raise exception 'Idempotency key conflicts with a different comment'; end if;
    return existing_internal.id;
   end if;
   if exists(select 1 from public.internal_comments where idempotency_key=p_idempotency_key) then
    raise exception 'Idempotency key conflicts with a different comment';
   end if;
  end if;
  insert into public.internal_comments(project_id,version_id,design_id,author_id,body,pin_x,pin_y,pin_t,idempotency_key) values(p_project_id,p_version_id,p_design_id,auth.uid(),trimmed_body,p_pin_x,p_pin_y,p_pin_t,p_idempotency_key) returning id into result_id;
  if private.is_agency() then
   insert into public.notifications(user_id,client_id,project_id,title)
   select pa.designer_id,target_client,p_project_id,'New studio message'
   from public.project_assignments pa
   where pa.project_id=p_project_id
     and (
      not exists(select 1 from public.design_versions dv where dv.id=p_version_id and dv.board_id is not null)
      or pa.designer_id=(select db.designer_id from public.design_versions dv join public.design_boards db on db.id=dv.board_id where dv.id=p_version_id)
     );
  else perform private.notify_agency(target_client,p_project_id,'New internal message'); end if;
 elsif p_channel='client' then
  if not private.can_client_channel(p_project_id) then raise exception 'Client channel access required' using errcode='42501'; end if;
  if p_idempotency_key is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
   select * into existing_client from public.client_comments where idempotency_key=p_idempotency_key and project_id=p_project_id;
   if found then
    if existing_client.publication_id is distinct from p_version_id
       or existing_client.design_id is distinct from p_design_id
       or existing_client.body is distinct from trimmed_body
       or existing_client.pin_x is distinct from p_pin_x
       or existing_client.pin_y is distinct from p_pin_y
       or existing_client.pin_t is distinct from p_pin_t
    then raise exception 'Idempotency key conflicts with a different comment'; end if;
    return existing_client.id;
   end if;
   if exists(select 1 from public.client_comments where idempotency_key=p_idempotency_key) then
    raise exception 'Idempotency key conflicts with a different comment';
   end if;
  end if;
  select case when private.is_agency() then 'Studio' else display_name end into sender_name from public.profiles where id=auth.uid();
  insert into public.client_comments(project_id,publication_id,design_id,author_label,author_kind,body,pin_x,pin_y,pin_t,idempotency_key) values(p_project_id,p_version_id,p_design_id,sender_name,case when private.is_agency() then 'studio' else 'client' end,trimmed_body,p_pin_x,p_pin_y,p_pin_t,p_idempotency_key) returning id into result_id;
  insert into private.client_comment_authors(comment_id,author_id) values(result_id,auth.uid());
  if private.is_agency() then perform private.notify_client(target_client,p_project_id,'New message from Studio'); else perform private.notify_agency(target_client,p_project_id,'New client message'); end if;
 else raise exception 'Invalid comment channel'; end if;
 return result_id;
end $$;
