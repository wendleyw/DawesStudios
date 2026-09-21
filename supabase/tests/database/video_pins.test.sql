begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(11);

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

-- A retry of an interrupted write must not leave two comments behind, on either channel. The
-- second call uses a different body than the first so a broken replay -- one that quietly
-- updates the existing row, or inserts a second one -- is distinguishable from a correct one
-- that returns the first call's row untouched. `set_config`/`current_setting` carries the first
-- call's id across statements, following the same pattern `production_integrity.test.sql`
-- already uses to stash a value between assertions.
select set_config('test.internal_reply_id', (
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Retried once',
    null, null, null, null, null, 'comment:fixed-key')
)::text, true);

select is(
  (select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Retried once - different text',
    null, null, null, null, null, 'comment:fixed-key'))::text,
  current_setting('test.internal_reply_id'),
  'an internal replay with the same key returns the original row id, not a new one');

select is(
  (select count(*)::int from public.internal_comments where idempotency_key = 'comment:fixed-key'),
  1, 'replaying the same internal key leaves exactly one row');

select is(
  (select body from public.internal_comments where idempotency_key = 'comment:fixed-key'),
  'Retried once',
  'the internal replay preserves the first call''s body, not the retried call''s text');

-- Same guarantee on the client channel, which looks the key up in `client_comments` instead --
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
    md5('dawes:project-2')::uuid, 'client', 'Client retried once - different text',
    null, null, null, null, null, 'client:fixed-key'))::text,
  current_setting('test.client_reply_id'),
  'a client replay with the same key returns the original row id, not a new one');

select is(
  (select count(*)::int from public.client_comments where idempotency_key = 'client:fixed-key'),
  1, 'replaying the same client key leaves exactly one row');

select is(
  (select body from public.client_comments where idempotency_key = 'client:fixed-key'),
  'Client retried once',
  'the client replay preserves the first call''s body, not the retried call''s text');

select * from finish();
rollback;
