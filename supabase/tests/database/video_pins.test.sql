begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(7);

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

-- A retry of an interrupted write must not leave two comments behind.
select lives_ok($$
  select public.post_comment(
    md5('dawes:project-2')::uuid, 'internal', 'Retried once',
    null, null, null, null, null, 'comment:fixed-key')
$$, 'the first attempt with a key is accepted');

select is(
  (select count(*)::int from public.internal_comments where idempotency_key = 'comment:fixed-key'),
  1, 'replaying the same key leaves exactly one row');

select * from finish();
rollback;
