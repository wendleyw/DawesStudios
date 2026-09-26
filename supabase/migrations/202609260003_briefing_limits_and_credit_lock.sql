-- R3 database hardening (system audit): nothing stopped a client from saving an arbitrarily large
-- briefing draft, because both scope triggers -- validate_submitted_briefing_scope
-- (202609200007_service_catalog.sql) and validate_submitted_service_answers
-- (202609200009_question_validation_and_storage_cleanup.sql) -- return immediately for
-- status='draft'. A read-only check of the local data before writing this migration found current
-- maxima, across all 80 existing briefings, of 3 deliverables, a 493-byte direction, a 49-character
-- title, a 146-character overview, a 126-character goals, a 67-character budget_note, 1 attachment
-- per briefing (49 total) and 3 drafts per client (4 total drafts) -- every existing row already
-- passes every cap this migration adds.

-- Applies at every status, not only a submission, so a draft cannot grow past what the existing
-- submitted-scope triggers would ever let through either. The per-client advisory lock (only taken
-- on the draft-count path, since that is the only check here backed by a count rather than the row
-- being written) mirrors the per-briefing lock enforce_briefing_attachment_limit takes below, and
-- the shape of the request_credits/post_comment idempotency locks: two concurrent draft inserts for
-- one client cannot both read a count under 100 and both insert past it.
create function private.enforce_briefing_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_array_length(new.requested_deliverables) > 50 then
    raise exception 'A briefing can list at most 50 deliverables.';
  end if;
  if octet_length(new.direction::text) > 65536 then
    raise exception 'The creative direction is too long.';
  end if;
  if char_length(new.title) > 200 then raise exception 'Title is too long.'; end if;
  if char_length(new.overview) > 10000 then raise exception 'Overview is too long.'; end if;
  if char_length(new.goals) > 10000 then raise exception 'Goals is too long.'; end if;
  if char_length(new.budget_note) > 10000 then raise exception 'Budget note is too long.'; end if;
  if tg_op = 'INSERT' and new.status = 'draft' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('briefing-drafts:'||new.client_id::text, 0));
    if (select count(*) from public.briefings
          where client_id = new.client_id and status = 'draft') >= 100 then
      raise exception 'This client already has 100 draft briefings. Submit or delete some first.';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function private.enforce_briefing_limits() from public, anon, authenticated;
create trigger enforce_briefing_limits before insert or update on public.briefings
  for each row execute function private.enforce_briefing_limits();

-- The per-briefing advisory lock so two concurrent uploads for one briefing cannot both read a
-- count under 20 and both insert a 21st row.
create function private.enforce_briefing_attachment_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('briefing-attachments:'||new.briefing_id::text, 0));
  if (select count(*) from public.briefing_attachments
        where briefing_id = new.briefing_id) >= 20 then
    raise exception 'A briefing can have at most 20 attachments.';
  end if;
  return new;
end
$$;
revoke execute on function private.enforce_briefing_attachment_limit() from public, anon, authenticated;
create trigger enforce_briefing_attachment_limit before insert on public.briefing_attachments
  for each row execute function private.enforce_briefing_attachment_limit();

-- adjust_credits looked up its idempotency key without the pg_advisory_xact_lock request_credits
-- (202609220003_request_credits_idempotency.sql) takes for the identical reason. Its existing
-- `select balance ... for update` only serializes two calls that target the same client_id; two
-- concurrent calls sharing one idempotency key for *different* clients take no shared lock at all,
-- so both can miss the lookup below and both attempt the insert, surfacing credit_ledger's raw
-- unique-violation instead of the friendly conflict message already handled a line later. Body
-- otherwise identical to the live definition; same signature, so grants are unaffected (restated
-- below only for the repository's own consistency, as 202609260002 already does for save_briefing).
create or replace function public.adjust_credits(p_client_id uuid, p_amount integer, p_description text, p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
 declare current_balance integer; previous public.credit_ledger; result_id uuid; begin
 perform private.assert_agency();
 if p_amount=0 or length(trim(p_description))=0 or length(trim(p_idempotency_key))=0 then raise exception 'Amount, description and idempotency key are required'; end if;
 select balance into current_balance from public.credit_accounts where client_id=p_client_id for update;
 if not found then raise exception 'Credit account not found'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
 select * into previous from public.credit_ledger where idempotency_key=p_idempotency_key;
 if found then
  if previous.client_id<>p_client_id or previous.amount<>p_amount or previous.description<>p_description then raise exception 'Idempotency key conflicts with a different adjustment'; end if;
  return previous.id;
 end if;
 if current_balance+p_amount<0 then raise exception 'Insufficient credit balance'; end if;
 update public.credit_accounts set balance=current_balance+p_amount,updated_at=now() where client_id=p_client_id;
 insert into public.credit_ledger(client_id,amount,balance_after,kind,description,idempotency_key) values(p_client_id,p_amount,current_balance+p_amount,'adjustment',p_description,p_idempotency_key) returning id into result_id;
 perform private.audit('credits.adjusted',p_client_id,jsonb_build_object('amount',p_amount));
 return result_id;
end $$;
revoke execute on function public.adjust_credits(uuid,integer,text,text) from public,anon;
grant execute on function public.adjust_credits(uuid,integer,text,text) to authenticated;
