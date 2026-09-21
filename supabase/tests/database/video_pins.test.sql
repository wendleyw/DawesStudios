begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(15);

-- The agency identity, because `private.can_produce()` grants it the internal channel with no
-- project assignment. `designer-1` is NOT assigned to these fixtures, and using it would fail
-- the test with `42501` for a reason that has nothing to do with pin time.
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;

-- A pin carrying time and position is accepted.
select lives_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Fix the logo entrance',
    md5('dawes:version-2-1')::uuid, md5('dawes:design-2-1-0')::uuid, 0.4, 0.6, 12.5)
$$, 'a pin with time and position is accepted');

select is(
  (select pin_t from public.internal_comments where body = 'Fix the logo entrance'),
  12.5::numeric, 'pin_t is stored as given');

-- Time without coordinates is a half-pin and has no rendering.
select throws_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Time only',
    md5('dawes:version-2-1')::uuid, md5('dawes:design-2-1-0')::uuid, null, null, 3.0)
$$, '23514', null, 'pin_t without coordinates is rejected');

-- Negative time is not a position in any video.
select throws_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Negative time',
    md5('dawes:version-2-1')::uuid, md5('dawes:design-2-1-0')::uuid, 0.4, 0.6, -1.0)
$$, '23514', null, 'negative pin_t is rejected');

-- Every existing caller omits the argument and still works.
select lives_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'No pin at all', null, null)
$$, 'the pre-existing seven-argument call still resolves');

-- A retry of an interrupted write must not leave two comments behind, on either channel, and a
-- key reused with genuinely different content must raise rather than silently returning or
-- silently dropping the new comment. `set_config`/`current_setting` carries the first call's id
-- across statements, following the same pattern `production_integrity.test.sql` already uses to
-- stash a value between assertions.
select set_config('test.internal_reply_id', (
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Retried once',
    null, null, null, null, null, 'comment:fixed-key')
)::text, true);

-- An exact retry -- same project, same content, same key -- returns the original row.
select is(
  (select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Retried once',
    null, null, null, null, null, 'comment:fixed-key'))::text,
  current_setting('test.internal_reply_id'),
  'an internal replay with the same key and the same content returns the original row id');

-- The same key with different content is a genuine collision, not a retry, and must raise
-- instead of silently returning the wrong row or silently discarding this call's text.
select throws_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Retried once - different text',
    null, null, null, null, null, 'comment:fixed-key')
$$, 'P0001', 'Idempotency key conflicts with a different comment',
  'reusing an internal key with different content raises a conflict instead of returning the original');

select is(
  (select count(*)::int from public.internal_comments where idempotency_key = 'comment:fixed-key'),
  1, 'replaying or conflicting on the same internal key leaves exactly one row');

select is(
  (select body from public.internal_comments where idempotency_key = 'comment:fixed-key'),
  'Retried once',
  'the stored body is the first call''s text, untouched by the retry or the conflicting attempt');

-- Same guarantees on the client channel, which looks the key up in `client_comments` instead --
-- a separate table, so it needs its own case rather than inferring it from the internal one.
-- The agency identity has client-channel access on every project via `private.is_agency()`, so
-- this reuses `project-2` with no publication or design, rather than needing a published-version
-- fixture.
select set_config('test.client_reply_id', (
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'client', 'Client retried once',
    null, null, null, null, null, 'client:fixed-key')
)::text, true);

select is(
  (select public.post_comment(
    md5('dawes:project-2')::uuid, 'client', 'Client retried once',
    null, null, null, null, null, 'client:fixed-key'))::text,
  current_setting('test.client_reply_id'),
  'a client replay with the same key and the same content returns the original row id');

select throws_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'client', 'Client retried once - different text',
    null, null, null, null, null, 'client:fixed-key')
$$, 'P0001', 'Idempotency key conflicts with a different comment',
  'reusing a client key with different content raises a conflict instead of returning the original');

select is(
  (select count(*)::int from public.client_comments where idempotency_key = 'client:fixed-key'),
  1, 'replaying or conflicting on the same client key leaves exactly one row');

select is(
  (select body from public.client_comments where idempotency_key = 'client:fixed-key'),
  'Client retried once',
  'the stored body is the first call''s text, untouched by the retry or the conflicting attempt');

-- The replay lookup must not become a cross-tenant existence oracle: an identity with no access
-- to this project must be refused before the idempotency lookup ever runs, even when it supplies
-- a key that genuinely exists (guessed, logged or otherwise leaked). `client-8` belongs to a
-- third client, unrelated to both project-2's client and project-4's -- see the cross-tenant
-- cases in `access_and_workflows.test.sql` for the same identity used the same way. This must
-- raise the ordinary access-denied error, not resolve to the id the key already maps to.
reset role;
select set_config('request.jwt.claim.sub', md5('dawes:client-8')::uuid::text, true);
set local role authenticated;

select throws_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'client', 'Attack using a leaked key',
    null, null, null, null, null, 'client:fixed-key')
$$, '42501', 'Client channel access required',
  'an identity outside the project is refused before the idempotency lookup runs, even with a real key');

reset role;

-- Critical 2: a `drop function` + `create` on a new signature reverts to Postgres's default
-- grants unless explicitly re-revoked, which would let PUBLIC -- and therefore an unauthenticated
-- `anon` caller through PostgREST -- execute this function at all. This one assertion would have
-- caught that defect on its own.
select ok(
  not has_function_privilege(
    'anon',
    'public.post_comment(uuid,text,text,uuid,uuid,numeric,numeric,numeric,text)',
    'EXECUTE'),
  'anon cannot execute post_comment');

select * from finish();
rollback;
