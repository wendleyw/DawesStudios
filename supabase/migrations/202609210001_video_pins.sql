-- A pin on a video needs a moment as well as a point. `pin_t` is seconds from the start of the
-- media, not a normalised fraction: a fraction would silently change meaning if the same design
-- were ever replaced by a clip of a different length, and the player reports `currentTime` in
-- seconds anyway.
alter table public.internal_comments add column pin_t numeric;
alter table public.client_comments add column pin_t numeric;

-- An interrupted write commits and returns 200 while the client sees a failure, so the retry
-- that failure invites used to persist a second comment. The key makes a replay return the
-- original row instead. It mirrors `credit_ledger.idempotency_key`, which solved the same
-- problem for credit adjustment; this function was simply the one that never got it.
alter table public.internal_comments add column idempotency_key text unique;
alter table public.client_comments add column idempotency_key text unique;

-- The pin rule gains time without loosening what it already guaranteed. A pin still requires a
-- design and normalised coordinates; `pin_t` is optional and non-negative, and may only appear
-- alongside coordinates. Time without a point is refused deliberately — the product pins a place
-- in a frame at a moment, and a half-pin has nothing to draw.
--
-- The brief that specified this migration assumed the unnamed-check auto-naming
-- `internal_comments_check1` / `client_comments_check1`. Verified against the live schema
-- (`\d public.internal_comments`, `\d public.client_comments`) before applying this migration:
-- both pin constraints are explicitly named `internal_comment_pin_pair` and
-- `client_comment_pin_pair` (not auto-numbered), so those are the names dropped below. The
-- `design_id is null or version_id/publication_id is not null` guarantees are separately named
-- `internal_comments_check` and `client_comments_check` and are left untouched.
--
-- The brief's constraint expression tested `pin_x between 0 and 1` without first requiring
-- `pin_x is not null`. A check constraint only fails on an explicit `false`; when `pin_x` and
-- `pin_y` are null and only `pin_t` is given, `pin_x between 0 and 1` evaluates to `null`, the
-- surrounding `and` chain evaluates to `null`, and `false or null` is `null` — which Postgres
-- treats as satisfied, silently admitting the exact half-pin (time with no coordinates) this
-- constraint exists to reject. The original `_pin_pair` constraints already guarded against this
-- with an explicit `pin_x is not null and pin_y is not null`, which is restored here.
alter table public.internal_comments drop constraint internal_comment_pin_pair;
alter table public.internal_comments add constraint internal_comments_pin_check check(
  (pin_x is null and pin_y is null and pin_t is null)
  or (design_id is not null
      and pin_x is not null and pin_y is not null
      and pin_x between 0 and 1 and pin_y between 0 and 1
      and (pin_t is null or pin_t >= 0)));

alter table public.client_comments drop constraint client_comment_pin_pair;
alter table public.client_comments add constraint client_comments_pin_check check(
  (pin_x is null and pin_y is null and pin_t is null)
  or (design_id is not null
      and pin_x is not null and pin_y is not null
      and pin_x between 0 and 1 and pin_y between 0 and 1
      and (pin_t is null or pin_t >= 0)));

-- `p_pin_t` is appended last with a default so that every existing seven-argument call site keeps
-- resolving to this function unchanged.
--
-- Postgres identifies a function by name AND argument types, so `create or replace` on a
-- signature with two extra parameters does not replace the old seven-argument function — it
-- creates a second overload beside it. With both present, any call that omits the new trailing
-- arguments becomes ambiguous (`42725: function ... is not unique`) once the arguments are
-- literals of type `unknown`, because both overloads are equally valid candidates. The old
-- overload must be dropped explicitly before the new one is created.
drop function if exists public.post_comment(uuid, text, text, uuid, uuid, numeric, numeric);
create or replace function public.post_comment(p_project_id uuid,p_channel text,p_body text,p_version_id uuid default null,p_design_id uuid default null,p_pin_x numeric default null,p_pin_y numeric default null,p_pin_t numeric default null,p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; target_client uuid; sender_name text; begin
 -- A replay returns the row the first attempt wrote. The lookup is per channel because the two
 -- tables are separate and a key is only ever used against one of them.
 if p_idempotency_key is not null then
  if p_channel='internal' then select id into result_id from public.internal_comments where idempotency_key=p_idempotency_key;
  else select id into result_id from public.client_comments where idempotency_key=p_idempotency_key; end if;
  if result_id is not null then return result_id; end if;
 end if;
 select client_id into target_client from public.projects where id=p_project_id;
 if p_channel='internal' then
  if not private.can_produce(p_project_id) then raise exception 'Internal channel access required' using errcode='42501'; end if;
  insert into public.internal_comments(project_id,version_id,design_id,author_id,body,pin_x,pin_y,pin_t,idempotency_key) values(p_project_id,p_version_id,p_design_id,auth.uid(),trim(p_body),p_pin_x,p_pin_y,p_pin_t,p_idempotency_key) returning id into result_id;
  if private.is_agency() then insert into public.notifications(user_id,client_id,project_id,title) select designer_id,target_client,p_project_id,'New studio message' from public.project_assignments where project_id=p_project_id; else perform private.notify_agency(target_client,p_project_id,'New internal message'); end if;
 elsif p_channel='client' then
  if not private.can_client_channel(p_project_id) then raise exception 'Client channel access required' using errcode='42501'; end if;
  select case when private.is_agency() then 'Studio' else display_name end into sender_name from public.profiles where id=auth.uid();
  insert into public.client_comments(project_id,publication_id,design_id,author_label,author_kind,body,pin_x,pin_y,pin_t,idempotency_key) values(p_project_id,p_version_id,p_design_id,sender_name,case when private.is_agency() then 'studio' else 'client' end,trim(p_body),p_pin_x,p_pin_y,p_pin_t,p_idempotency_key) returning id into result_id;
  insert into private.client_comment_authors(comment_id,author_id) values(result_id,auth.uid());
  if private.is_agency() then perform private.notify_client(target_client,p_project_id,'New message from Studio'); else perform private.notify_agency(target_client,p_project_id,'New client message'); end if;
 else raise exception 'Invalid comment channel'; end if;
 return result_id;
end $$;
