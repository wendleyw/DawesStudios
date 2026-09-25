begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(3);
select has_column('public', 'projects', 'delivered_at', 'Projects record when they were delivered');
select col_type_is('public', 'projects', 'delivered_at', 'timestamp with time zone',
  'The delivery instant is a timestamp with time zone');
select is(
  (select count(*)::int from public.projects where status = 'delivered' and delivered_at is null),
  0,
  'Every delivered project carries its delivery instant'
);
select * from finish();
rollback;
