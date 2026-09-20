create function private.validate_service_answers() returns trigger language plpgsql security definer set search_path='' as $$
 declare questions jsonb; question jsonb; answer text; begin
 if new.status='draft' then return new; end if;
 select definition->'questions' into questions from public.service_catalog where id=new.service_type;
 for question in select value from jsonb_array_elements(coalesce(questions,'[]')) loop
  answer:=trim(coalesce(new.direction->'questions'->>(question->>'id'),''));
  if answer='' then raise exception 'Answer every service question before submitting'; end if;
  if question ? 'options' and not(question->'options' ? answer) then raise exception 'Choose an allowed option for each service question'; end if;
  if question->>'id'='pages' and answer !~ '^[1-9][0-9]*$' then raise exception 'Page count must be a positive whole number'; end if;
 end loop;
 return new;
end $$;
create trigger validate_submitted_service_answers before insert or update on public.briefings for each row execute function private.validate_service_answers();
revoke execute on function private.validate_service_answers() from public,anon,authenticated;
create policy brand_storage_delete on storage.objects for delete to authenticated using(
 bucket_id='brand-assets' and private.is_agency() and not exists(
  select 1 from public.brand_assets a where a.storage_path=storage.objects.name
 )
);
