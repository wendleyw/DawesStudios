-- SQLSTATE 40001 is reserved for transaction serialization failures. PostgREST 14 retries
-- custom business exceptions with that code indefinitely. Preserve each function's logic and
-- grants while mapping stale-edit conflicts to HTTP 409 with PostgREST's PT409 code.
do $$
declare routine record; definition text; changed_count integer := 0;
begin
 for routine in
  select p.oid,p.proname from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
   and p.prosrc like '%40001%'
 loop
  definition:=pg_catalog.pg_get_functiondef(routine.oid);
  if definition like '%40001%' then
   execute pg_catalog.replace(definition,'40001','PT409');
   changed_count:=changed_count+1;
  end if;
 end loop;
 if changed_count=0 then
  raise exception 'Expected to update stale-edit conflict functions';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n
  on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
  and p.prosrc like '%40001%') then
  raise exception 'A public RPC still emits a retryable custom conflict';
 end if;
end $$;
notify pgrst,'reload schema';
