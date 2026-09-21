-- Hardening pass on post_comment's idempotency replay (202609210001), per code review. Four
-- defects, all in the migration this repairs rather than in how it was executed:
--
-- 1. The replay lookup ran BEFORE authorization and matched on `idempotency_key` alone, with no
--    `project_id` in the WHERE clause. Any caller could pass an arbitrary `p_project_id` plus a
--    guessed or leaked key and get back the id of whatever row held that key, with zero
--    authorization evaluated -- a cross-tenant existence oracle. Authorization
--    (`private.can_produce` / `private.can_client_channel`) now runs first, and the lookup is
--    scoped to `project_id` as well as the channel's own table, matching the shape
--    `adjust_credits` (202609200002_workflows.sql) and `publish_version`
--    (202609200018_review_serialization.sql) already established in this codebase.
-- 2. A replayed key was trusted unconditionally: any call with a matching key returned the
--    existing row's id regardless of whether the rest of the call matched, which would silently
--    return the wrong row -- or, across tenants, would have silently done so across a tenant
--    boundary. The row found by the scoped lookup is now compared field by field
--    (`version_id`/`publication_id`, `design_id`, `body`, `pin_x`, `pin_y`, `pin_t`) against the
--    current call, and a mismatch raises, following `adjust_credits`'s and `publish_version`'s
--    "Idempotency key conflicts with a different ..." wording. A key already used by a different
--    project (the cross-tenant collision case, since `idempotency_key` is unique per table, not
--    per tenant) raises the same way instead of falling through to a bare unique-violation.
-- 3. No concurrency guard: two genuinely concurrent retries could both miss the lookup and both
--    attempt to insert, with the second failing on the unique constraint instead of replaying.
--    `publish_version` guards exactly this with `pg_advisory_xact_lock`; `post_comment` now takes
--    the same lock, keyed on the idempotency key, before its lookup.
-- 4. `drop function` + `create` in 202609210001 produced a brand-new function object. This repo
--    has no `alter default privileges`, and the PUBLIC/anon revoke in 202609200002 was a one-time
--    pass over the functions that existed at the time, so the new object reverted to Postgres's
--    default grants -- PUBLIC (and therefore anon) could execute it. Combined with defect 1, an
--    unauthenticated caller could reach another tenant's comment id through PostgREST. Revoked
--    and re-granted explicitly below, matching `adjust_credits`'s and `publish_version`'s ACL.
--
-- The signature is unchanged from 202609210001, so this is a true `create or replace` on the
-- same function object -- no new overload, no repeat of 202609210001's own drop-then-create
-- mistake.
create or replace function public.post_comment(p_project_id uuid,p_channel text,p_body text,p_version_id uuid default null,p_design_id uuid default null,p_pin_x numeric default null,p_pin_y numeric default null,p_pin_t numeric default null,p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; target_client uuid; sender_name text; trimmed_body text; existing_internal public.internal_comments; existing_client public.client_comments; begin
 trimmed_body:=trim(p_body);
 select client_id into target_client from public.projects where id=p_project_id;
 if p_channel='internal' then
  if not private.can_produce(p_project_id) then raise exception 'Internal channel access required' using errcode='42501'; end if;
  if p_idempotency_key is not null then
   -- Serializes concurrent retries sharing this key so only one reaches the lookup+insert
   -- section at a time; mirrors publish_version's guard against the same race.
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
   select * into existing_internal from public.internal_comments where idempotency_key=p_idempotency_key and project_id=p_project_id;
   if found then
    if existing_internal.version_id is distinct from p_version_id
       or existing_internal.design_id is distinct from p_design_id
       or existing_internal.body<>trimmed_body
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
  if private.is_agency() then insert into public.notifications(user_id,client_id,project_id,title) select designer_id,target_client,p_project_id,'New studio message' from public.project_assignments where project_id=p_project_id; else perform private.notify_agency(target_client,p_project_id,'New internal message'); end if;
 elsif p_channel='client' then
  if not private.can_client_channel(p_project_id) then raise exception 'Client channel access required' using errcode='42501'; end if;
  if p_idempotency_key is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
   select * into existing_client from public.client_comments where idempotency_key=p_idempotency_key and project_id=p_project_id;
   if found then
    if existing_client.publication_id is distinct from p_version_id
       or existing_client.design_id is distinct from p_design_id
       or existing_client.body<>trimmed_body
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

revoke execute on function public.post_comment(uuid,text,text,uuid,uuid,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.post_comment(uuid,text,text,uuid,uuid,numeric,numeric,numeric,text) to authenticated;
