-- Validate dimensional requirements as well as positive values; references cannot carry credentials.
create function private.validate_production_brief_content() returns trigger
language plpgsql set search_path='' as $$
declare item jsonb; spec jsonb;
begin
 for item in select value from jsonb_array_elements(new.content->'deliverables') loop
  select definition into spec from public.format_catalog where id=item->>'format';
  if spec->>'layout' in ('fixed','fluid') and (item->>'width') is null then
   raise exception 'Add a width for each sized production deliverable' using errcode='22023'; end if;
  if spec->>'layout'='fixed' and (item->>'height') is null then
   raise exception 'Add a height for each fixed-size production deliverable' using errcode='22023'; end if;
 end loop;
 for item in select value from jsonb_array_elements(new.content->'references') loop
  if item->>'url' ~ '^https://[^/]*@' then
   raise exception 'Reference links cannot contain login credentials' using errcode='22023'; end if;
 end loop;
 return new;
end $$;
revoke execute on function private.validate_production_brief_content() from public,anon,authenticated;
create trigger production_brief_draft_content before insert or update on public.production_brief_drafts
 for each row execute function private.validate_production_brief_content();
create trigger production_brief_content before insert or update on public.production_briefs
 for each row execute function private.validate_production_brief_content();
