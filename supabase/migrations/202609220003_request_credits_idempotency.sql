-- request_credits (202609200004_requests_and_attachments.sql) took no idempotency key at all,
-- unlike adjust_credits (202609200002_workflows.sql), publish_version
-- (202609200018_review_serialization.sql) and post_comment
-- (202609210002_post_comment_replay_hardening.sql). An interrupted call followed by a client retry
-- with the same payload produced two credit_requests rows instead of one. See Defect I-7,
-- docs/verification/acceptance-family-i.md.
--
-- credit_ledger.idempotency_key is declared `text not null unique`
-- (202609200001_foundation.sql:148), and adjust_credits pairs that column with a select-then-compare
-- lookup rather than relying on the unique constraint alone. credit_requests follows the same
-- combination -- a unique column plus an application-level compare -- adapted the way
-- update_workspace_settings/save_service_preset (202609210003_concurrent_edit_guards.sql) already
-- adapted the same idea: the key is optional (`default null`), because request_credits has existing
-- callers with nothing to quote (supabase/tests/database/requests_and_storage.test.sql,
-- supabase/tests/concurrent_workflows_test.py) that this task does not touch, and neither may be
-- modified for this to stay additive. A caller that omits the key gets the prior, unguarded
-- behaviour; the web client always supplies one from here on.
--
-- Unlike adjust_credits, request_credits does not lock a pre-existing per-client row (there is no
-- balance to serialize against here), so it is closer in shape to post_comment: an insert-only write
-- with nothing else to hang a lock on. It therefore takes the same pg_advisory_xact_lock
-- post_comment's hardening pass added for the identical reason -- two genuinely concurrent retries
-- could otherwise both miss the lookup and both attempt to insert -- and the same two-step lookup:
-- scoped to client_id first (so a guessed or leaked key belonging to a different tenant cannot be
-- used to read that tenant's amount/note back through the conflict message), then a second, unscoped
-- existence check that raises the same generic conflict message instead of leaking which tenant holds
-- the key or falling through to a bare unique-violation.
alter table public.credit_requests add column idempotency_key text unique;

drop function public.request_credits(uuid,integer,text);
create function public.request_credits(p_client_id uuid,p_amount integer,p_note text default '',p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; previous public.credit_requests; key text; begin
 if not(private.is_agency() or private.is_client_member(p_client_id)) then raise exception 'Client access required' using errcode='42501'; end if;
 key:=nullif(trim(p_idempotency_key),'');
 if key is not null then
  -- Serializes concurrent retries sharing this key so only one reaches the lookup+insert section at
  -- a time; mirrors publish_version's and post_comment's guard against the same race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(key,0));
  select * into previous from public.credit_requests where idempotency_key=key and client_id=p_client_id;
  if found then
   if previous.amount<>p_amount or previous.note<>p_note then raise exception 'Idempotency key conflicts with a different credit request'; end if;
   return previous.id;
  end if;
  if exists(select 1 from public.credit_requests where idempotency_key=key) then
   raise exception 'Idempotency key conflicts with a different credit request';
  end if;
 end if;
 insert into public.credit_requests(client_id,requested_by,amount,note,idempotency_key) values(p_client_id,auth.uid(),p_amount,p_note,key) returning id into result_id;
 perform private.notify_agency(p_client_id,null,'Credit allocation requested');
 return result_id;
end $$;

revoke execute on function public.request_credits(uuid,integer,text,text) from public,anon;
grant execute on function public.request_credits(uuid,integer,text,text) to authenticated;
-- Repeats the repository-wide sweep (202609210003's own note explains why this, not
-- `alter default privileges`, is the standing invariant here) for anything created by a concurrent
-- session since the last migration that ran it.
revoke execute on all functions in schema public from public,anon;
