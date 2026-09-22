begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(24);
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
set local role authenticated;
select lives_ok($$select public.request_credits(md5('dawes:client-org-1')::uuid,25,'Next campaign')$$,'Client can request a supported credit allocation');
select is((select balance from public.credit_accounts where client_id=md5('dawes:client-org-1')::uuid),95,'Requesting credits does not alter the balance');
select throws_ok($$select public.request_credits(md5('dawes:client-org-2')::uuid,25)$$,'42501','Client access required','Client cannot request for another tenant');
select throws_ok($$select public.request_credits(md5('dawes:client-org-1')::uuid,99999)$$,'23514',null,'Unsupported allocation amounts are rejected');
select throws_ok($$select public.fulfill_credit_request((select id from public.credit_requests limit 1))$$,'42501','Agency access required','Client cannot fulfill its own credit request');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id) values('briefing-files',md5('dawes:pending-1')::uuid::text||'/'||md5('attachment-test')::uuid::text||'.pdf',auth.uid()::text)$$,'Client can upload a draft briefing attachment');
select lives_ok($$select public.add_briefing_attachment(md5('dawes:pending-1')::uuid,'Reference.pdf',md5('dawes:pending-1')::uuid::text||'/'||md5('attachment-test')::uuid::text||'.pdf','application/pdf',100)$$,'Uploaded draft attachment can be registered');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('briefing-files',md5('dawes:pending-2')::uuid::text||'/'||md5('attachment-test')::uuid::text||'.pdf',auth.uid()::text)$$,'42501',null,'Cross-tenant attachment upload is rejected');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('published-assets',md5('dawes:project-2')::uuid::text||'/'||md5('attachment-test')::uuid::text||'.png',auth.uid()::text)$$,'42501',null,'Client cannot upload publication assets');
select is((select count(*)::int from storage.objects where bucket_id='internal-assets'),0,'Client cannot list internal storage objects');
select lives_ok($$select public.submit_briefing(md5('dawes:pending-1')::uuid)$$,'Briefing with attachment can be submitted');
select is((select count(*)::int from public.briefing_attachments),1,'Submitted attachments remain readable');
select throws_ok($$select public.remove_briefing_attachment((select id from public.briefing_attachments limit 1))$$,'42501','Draft briefing access required','Submitted attachments cannot be removed');
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$select public.fulfill_credit_request((select id from public.credit_requests where client_id=md5('dawes:client-org-1')::uuid and status='pending' limit 1),'Allocation approved')$$,'Agency can fulfill a credit request');
select is((select balance from public.credit_accounts where client_id=md5('dawes:client-org-1')::uuid),120,'Fulfillment adds exactly the requested credits');
select is(public.fulfill_credit_request((select id from public.credit_requests where client_id=md5('dawes:client-org-1')::uuid limit 1)),(select ledger_id from public.credit_requests where client_id=md5('dawes:client-org-1')::uuid limit 1),'Repeated fulfillment returns the original transaction');
select is((select count(*)::int from public.credit_ledger where client_id=md5('dawes:client-org-1')::uuid and idempotency_key like 'credit-request:%'),1,'Repeated fulfillment produces one ledger entry');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('published-assets',md5('dawes:project-2')::uuid::text||'/Alex-Morgan.png',auth.uid()::text)$$,'42501',null,'Publication filenames cannot carry producer identities');

-- request_credits idempotency (Defect I-7): a replayed key with the same payload returns the
-- original row rather than inserting a second one; the same key with a different payload is
-- refused; an unrelated key succeeds independently rather than colliding.
select public.request_credits(md5('dawes:client-org-1')::uuid,50,'Idempotency probe','probe:replay') as idempotency_probe_first \gset
select is(public.request_credits(md5('dawes:client-org-1')::uuid,50,'Idempotency probe','probe:replay')::text,:'idempotency_probe_first'::text,'A replayed key with the same payload returns the original request, not a new one');
select is((select count(*)::int from public.credit_requests where idempotency_key='probe:replay'),1,'A replayed key with the same payload writes exactly one row');
select throws_ok($$select public.request_credits(md5('dawes:client-org-1')::uuid,100,'Different note','probe:replay')$$,'P0001','Idempotency key conflicts with a different credit request','The same key with a different payload is refused rather than silently returning the wrong row');
select is((select count(*)::int from public.credit_requests where idempotency_key='probe:replay'),1,'The refused replay with a different payload adds no second row');
select isnt(public.request_credits(md5('dawes:client-org-1')::uuid,50,'Idempotency probe','probe:distinct')::text,:'idempotency_probe_first'::text,'A different key for the same client and amount creates its own, independent request');
select is((select count(*)::int from public.credit_requests where idempotency_key in('probe:replay','probe:distinct')),2,'Two distinct keys leave two distinct rows, not a collision');

select * from finish();
rollback;
