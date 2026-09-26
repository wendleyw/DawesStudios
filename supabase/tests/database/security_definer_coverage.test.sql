begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- One rolled-back transaction covering six previously untested security-definer functions
-- (submit_design_version, resolve_comment for both channels, revoke_invitation,
-- reject_credit_request, discard_sanitized_asset, finalize_asset_discard), the new item-1
-- briefing/attachment size limits from 202609260003_briefing_limits_and_credit_lock.sql, and
-- adjust_credits' idempotent retry. Every fixture below is created here, not reused from the seed
-- or the SABRE demonstration overlay, so these assertions do not depend on either's current shape.
create temporary table sdc_context(key text primary key, value uuid);
grant all on sdc_context to authenticated, service_role;
insert into sdc_context values
  ('agency', md5('sdc:agency')::uuid),
  ('client', md5('sdc:client')::uuid),
  ('designer', md5('sdc:designer')::uuid),
  ('client-org', md5('sdc:client-org')::uuid),
  ('drafts-client', md5('sdc:drafts-client')::uuid),
  ('project', md5('sdc:project')::uuid),
  ('deliverable', md5('sdc:deliverable')::uuid),
  ('version', md5('sdc:version')::uuid),
  ('design', md5('sdc:design')::uuid),
  ('internal-comment', md5('sdc:internal-comment')::uuid),
  ('client-comment', md5('sdc:client-comment')::uuid),
  ('invitation', md5('sdc:invitation')::uuid),
  ('credit-request', md5('sdc:credit-request')::uuid),
  ('attachment-briefing', md5('sdc:attachment-briefing')::uuid),
  ('asset-allowed', md5('sdc:asset-allowed')::uuid),
  ('asset-refused', md5('sdc:asset-refused')::uuid);
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from sdc_context where key=p_key
$$;
-- The JWT subject every following statement acts as, until the next call.
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.context(p_key)::text,true)
$$;

-- Fixture people, client, production chain, comments, invitation and credit request. Direct table
-- inserts run as the connecting role (no RLS/grant boundary to satisfy, the same way
-- production_integrity.test.sql seeds private.audit_events and private.sanitized_assets directly);
-- every write actually under test happens through the RPC further below.
insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.context('agency'),'sdc-agency@fixture.local','{"display_name":"SDC Agency"}'),
  (pg_temp.context('client'),'sdc-client@fixture.local','{"display_name":"SDC Client"}'),
  (pg_temp.context('designer'),'sdc-designer@fixture.local','{"display_name":"SDC Designer"}');
update public.profiles set role='agency' where id=pg_temp.context('agency');
update public.profiles set role='designer' where id=pg_temp.context('designer');

insert into public.clients(id,name,slug) values
  (pg_temp.context('client-org'),'SDC Coverage Client','sdc-coverage-client'),
  (pg_temp.context('drafts-client'),'SDC Drafts Client','sdc-drafts-client');
insert into public.client_memberships(client_id,user_id) values
  (pg_temp.context('client-org'),pg_temp.context('client'));
insert into public.credit_accounts(client_id,balance) values
  (pg_temp.context('client-org'),1000);

insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.context('project'),pg_temp.context('client-org'),'SDC coverage project','ai','in_progress');
insert into public.project_assignments(project_id,designer_id) values
  (pg_temp.context('project'),pg_temp.context('designer'));
insert into public.deliverables(id,project_id,name,format) values
  (pg_temp.context('deliverable'),pg_temp.context('project'),'Fixture deliverable','a4');
insert into public.design_versions(id,project_id,deliverable_id,version_number,created_by) values
  (pg_temp.context('version'),pg_temp.context('project'),pg_temp.context('deliverable'),1,pg_temp.context('agency'));
insert into public.designs(id,project_id,version_id,title,created_by) values
  (pg_temp.context('design'),pg_temp.context('project'),pg_temp.context('version'),'Fixture design',pg_temp.context('agency'));

insert into public.internal_comments(id,project_id,author_id,body) values
  (pg_temp.context('internal-comment'),pg_temp.context('project'),pg_temp.context('agency'),'Internal note');
insert into public.client_comments(id,project_id,author_label,author_kind,body) values
  (pg_temp.context('client-comment'),pg_temp.context('project'),'Studio','studio','Client-visible note');

insert into public.invitations(id,email,role,status) values
  (pg_temp.context('invitation'),'sdc-invitee@fixture.local','designer','pending');
insert into public.credit_requests(id,client_id,requested_by,amount,status) values
  (pg_temp.context('credit-request'),pg_temp.context('client-org'),pg_temp.context('client'),50,'pending');

-- 1. submit_design_version: a client has no production access; the agency does, and the version
-- and its project really transition.
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.submit_design_version(pg_temp.context('version'))$$,
  '42501','Production access required','A client cannot submit a design version');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.submit_design_version(pg_temp.context('version'))$$,
  'The agency submits the design version');
select is((select status from public.design_versions where id=pg_temp.context('version')),
  'submitted','Submitting the version records its new status');
select is((select status::text from public.projects where id=pg_temp.context('project')),
  'internal_review','Submitting the version moves the project into internal review');
reset role;

-- 2. resolve_comment: a client cannot resolve an internal comment; a designer cannot resolve a
-- client-channel comment. The agency may resolve either, and a client may resolve its own channel.
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.resolve_comment(pg_temp.context('internal-comment'),'internal',true)$$,
  '42501','Comment access required','A client cannot resolve an internal comment');
reset role;
select pg_temp.act_as('designer');
set local role authenticated;
select throws_ok($$select public.resolve_comment(pg_temp.context('client-comment'),'client',true)$$,
  '42501','Comment access required','A designer cannot resolve a client-channel comment');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.resolve_comment(pg_temp.context('internal-comment'),'internal',true)$$,
  'The agency resolves the internal comment');
select is((select resolved from public.internal_comments where id=pg_temp.context('internal-comment')),
  true,'The internal comment is really resolved');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select lives_ok($$select public.resolve_comment(pg_temp.context('client-comment'),'client',true)$$,
  'The client resolves its own client-channel comment');
select is((select resolved from public.client_comments where id=pg_temp.context('client-comment')),
  true,'The client comment is really resolved');
reset role;

-- 3. revoke_invitation: agency only.
select pg_temp.act_as('client');
set local role authenticated;
select throws_ok($$select public.revoke_invitation(pg_temp.context('invitation'))$$,
  '42501','Agency access required','A client cannot revoke an invitation');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.revoke_invitation(pg_temp.context('invitation'))$$,
  'The agency revokes the invitation');
select is((select status from public.invitations where id=pg_temp.context('invitation')),
  'revoked','The invitation is really revoked');
reset role;

-- 4. reject_credit_request: agency only.
select pg_temp.act_as('designer');
set local role authenticated;
select throws_ok($$select public.reject_credit_request(pg_temp.context('credit-request'),'No budget this cycle')$$,
  '42501','Agency access required','A designer cannot reject a credit request');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.reject_credit_request(pg_temp.context('credit-request'),'No budget this cycle')$$,
  'The agency rejects the credit request');
select is((select status from public.credit_requests where id=pg_temp.context('credit-request')),
  'rejected','The credit request is really rejected');
reset role;

-- 5/6. discard_sanitized_asset and finalize_asset_discard: the trusted media worker only. Neither
-- function grants EXECUTE to authenticated at all (only to service_role), so an authenticated
-- agency session is refused at the grant layer before the function body's own
-- "auth.role() <> service_role" check would even run; the message is Postgres' own generic denial,
-- not the function's.
insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by) values
  ('internal-assets',pg_temp.context('project')::text||'/'||pg_temp.context('asset-allowed')::text||'.mp4',
    pg_temp.context('project'),repeat('a',64),'video/mp4',1000,pg_temp.context('agency')),
  ('internal-assets',pg_temp.context('project')::text||'/'||pg_temp.context('asset-refused')::text||'.mp4',
    pg_temp.context('project'),repeat('b',64),'video/mp4',1000,pg_temp.context('agency'));
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.discard_sanitized_asset('internal-assets',
    pg_temp.context('project')::text||'/'||pg_temp.context('asset-refused')::text||'.mp4')$$,
  '42501',null,'The agency cannot discard a sanitized asset directly');
select throws_ok($$select public.finalize_asset_discard('internal-assets',
    pg_temp.context('project')::text||'/'||pg_temp.context('asset-refused')::text||'.mp4')$$,
  '42501',null,'The agency cannot finalize a sanitized asset discard directly');
reset role;

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select lives_ok($$select public.discard_sanitized_asset('internal-assets',
    pg_temp.context('project')::text||'/'||pg_temp.context('asset-allowed')::text||'.mp4')$$,
  'The trusted media worker discards a sanitized asset');
select lives_ok($$select public.finalize_asset_discard('internal-assets',
    pg_temp.context('project')::text||'/'||pg_temp.context('asset-allowed')::text||'.mp4')$$,
  'The trusted media worker finalizes the discard once no storage object remains');
reset role;
-- private is not exposed to any API role, so this read runs as the connecting role, the same way
-- video_provenance_attestation.test.sql reads private.sanitized_assets after a service_role write.
select is((select count(*)::int from private.sanitized_assets where bucket_id='internal-assets'
    and storage_path=pg_temp.context('project')::text||'/'||pg_temp.context('asset-allowed')::text||'.mp4'),
  0,'The finalized discard really removed the attestation row');

-- 7. The new item-1 limits: each refused just above its cap and accepted at the cap. Drafts skip
-- the existing scope triggers, so status='draft' isolates these size checks from that separate
-- validation. Service type 'ai' and format 'a4' are real catalog rows; format only matters for the
-- deliverables FK on the fixture, not for the JSON size check itself.
select lives_ok($$
  insert into public.briefings(client_id,service_type,status,requested_deliverables,created_by)
  values (pg_temp.context('client-org'),'ai','draft',
    (select jsonb_agg(jsonb_build_object('name','D'||n)) from generate_series(1,50) n),
    pg_temp.context('agency'))
$$,'A draft with exactly 50 deliverables is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,requested_deliverables,created_by)
  values (pg_temp.context('client-org'),'ai','draft',
    (select jsonb_agg(jsonb_build_object('name','D'||n)) from generate_series(1,51) n),
    pg_temp.context('agency'))
$$,'P0001','A briefing can list at most 50 deliverables.','A draft with 51 deliverables is refused');

-- to_jsonb() of a plain string adds exactly two bytes of quoting overhead, so repeat() lengths
-- below land exactly on and one past the 65536-byte cap.
select lives_ok($$
  insert into public.briefings(client_id,service_type,status,direction,created_by)
  values (pg_temp.context('client-org'),'ai','draft',to_jsonb(repeat('a',65534)),pg_temp.context('agency'))
$$,'A draft whose direction is exactly 65536 bytes is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,direction,created_by)
  values (pg_temp.context('client-org'),'ai','draft',to_jsonb(repeat('a',65535)),pg_temp.context('agency'))
$$,'P0001','The creative direction is too long.','A draft whose direction exceeds 65536 bytes is refused');

select lives_ok($$
  insert into public.briefings(client_id,service_type,status,title,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('t',200),pg_temp.context('agency'))
$$,'A 200-character title is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,title,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('t',201),pg_temp.context('agency'))
$$,'P0001','Title is too long.','A 201-character title is refused');

select lives_ok($$
  insert into public.briefings(client_id,service_type,status,overview,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('o',10000),pg_temp.context('agency'))
$$,'A 10,000-character overview is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,overview,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('o',10001),pg_temp.context('agency'))
$$,'P0001','Overview is too long.','A 10,001-character overview is refused');

select lives_ok($$
  insert into public.briefings(client_id,service_type,status,goals,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('g',10000),pg_temp.context('agency'))
$$,'A 10,000-character goals is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,goals,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('g',10001),pg_temp.context('agency'))
$$,'P0001','Goals is too long.','A 10,001-character goals is refused');

select lives_ok($$
  insert into public.briefings(client_id,service_type,status,budget_note,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('b',10000),pg_temp.context('agency'))
$$,'A 10,000-character budget_note is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,budget_note,created_by)
  values (pg_temp.context('client-org'),'ai','draft',repeat('b',10001),pg_temp.context('agency'))
$$,'P0001','Budget note is too long.','A 10,001-character budget_note is refused');

-- The drafts cap: 99 existing drafts leave room for exactly one more; a 101st is refused.
insert into public.briefings(client_id,service_type,status,created_by)
  select pg_temp.context('drafts-client'),'ai','draft',pg_temp.context('agency') from generate_series(1,99);
select lives_ok($$
  insert into public.briefings(client_id,service_type,status,created_by)
  values (pg_temp.context('drafts-client'),'ai','draft',pg_temp.context('agency'))
$$,'The 100th draft for one client is accepted');
select throws_ok($$
  insert into public.briefings(client_id,service_type,status,created_by)
  values (pg_temp.context('drafts-client'),'ai','draft',pg_temp.context('agency'))
$$,'P0001','This client already has 100 draft briefings. Submit or delete some first.',
  'The 101st draft for one client is refused');
select is((select count(*)::int from public.briefings where client_id=pg_temp.context('drafts-client') and status='draft'),
  100,'Exactly 100 drafts exist for that client once the cap holds');

-- The attachments cap: 19 existing attachments leave room for exactly one more; a 21st is refused.
insert into public.briefings(id,client_id,service_type,status,created_by) values
  (pg_temp.context('attachment-briefing'),pg_temp.context('client-org'),'ai','draft',pg_temp.context('agency'));
insert into public.briefing_attachments(briefing_id,name,storage_path,mime_type,file_size)
  select pg_temp.context('attachment-briefing'),'File '||n,
    pg_temp.context('attachment-briefing')::text||'/'||n||'.png','image/png',1000
  from generate_series(1,19) n;
select lives_ok($$
  insert into public.briefing_attachments(briefing_id,name,storage_path,mime_type,file_size)
  values (pg_temp.context('attachment-briefing'),'File 20',
    pg_temp.context('attachment-briefing')::text||'/20.png','image/png',1000)
$$,'The 20th attachment for one briefing is accepted');
select throws_ok($$
  insert into public.briefing_attachments(briefing_id,name,storage_path,mime_type,file_size)
  values (pg_temp.context('attachment-briefing'),'File 21',
    pg_temp.context('attachment-briefing')::text||'/21.png','image/png',1000)
$$,'P0001','A briefing can have at most 20 attachments.','The 21st attachment for one briefing is refused');
select is((select count(*)::int from public.briefing_attachments where briefing_id=pg_temp.context('attachment-briefing')),
  20,'Exactly 20 attachments exist for that briefing once the cap holds');

-- 8. adjust_credits: a repeated idempotency key returns the original ledger id, not an error,
-- mirroring production_integrity.test.sql's identical check on publish_version.
select pg_temp.act_as('agency');
set local role authenticated;
select is(
  public.adjust_credits(pg_temp.context('client-org'),10,'SDC coverage bonus','sdc-coverage-adjustment-1'),
  public.adjust_credits(pg_temp.context('client-org'),10,'SDC coverage bonus','sdc-coverage-adjustment-1'),
  'A repeated adjustment idempotency key returns the same ledger id, not an error');
reset role;

select * from finish();
rollback;
