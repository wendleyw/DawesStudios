-- `update_workspace_settings` and `save_service_preset` (202609210003) already take an expected
-- revision, but the predicate treats a missing one as "skip the check":
--   where id=1 and (p_expected_updated_at is null or updated_at=p_expected_updated_at)
-- A caller that omits the revision gets last-write-wins back -- the exact defect that migration
-- exists to close. Every production call site already quotes a revision; only test doubles omit
-- one. Dropping the `is null or` escape makes the omission collide with `updated_at=null` (never
-- true) or `revision=null` (same), so a save with no revision is refused exactly like a stale one,
-- with the same PT409 message, instead of silently applying.
--
-- The parameters keep their `default null`: a caller that never reaches the compare-and-set at all
-- (an unauthorized caller failing `assert_agency()`, an invalid timezone failing its own check) is
-- unaffected either way, and changing only the predicate -- not the argument list -- means this is
-- not a signature change, so `create or replace` is correct here and keeps the ACL `202609210003`
-- already set. The explicit revoke/grant below, and the schema-wide sweep, are carried anyway: a
-- concurrent session's migrations since `202609210003` may have created functions of their own, and
-- each one comes back with EXECUTE for PUBLIC until swept (see `202609210003`'s own note on why
-- `alter default privileges` cannot close this permanently).
create or replace function public.update_workspace_settings(p_studio_name text,p_timezone text,p_expected_updated_at timestamptz default null) returns timestamptz language plpgsql security definer set search_path='' as $$
 declare new_revision timestamptz; begin
 perform private.assert_agency();
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid IANA timezone'; end if;
 update public.workspace_settings set studio_name=trim(p_studio_name),timezone=p_timezone,updated_at=now() where id=1 and updated_at=p_expected_updated_at returning updated_at into new_revision;
 if not found then raise exception 'These studio settings changed while you were editing. Reload the page to try again.' using errcode='PT409'; end if;
 perform private.audit('workspace.updated',null);
 return new_revision;
 end
$$;
create or replace function public.save_service_preset(p_service_type text,p_min_credits integer,p_max_credits integer,p_due_days integer,p_expected_revision integer default null) returns integer language plpgsql security definer set search_path='' as $$
 declare new_revision integer; begin
 perform private.assert_agency();
 update public.service_presets set min_credits=p_min_credits,max_credits=p_max_credits,due_days=p_due_days,revision=revision+1,updated_at=now() where service_type=p_service_type and revision=p_expected_revision returning revision into new_revision;
 if not found then
  if exists(select 1 from public.service_presets where service_type=p_service_type) then raise exception 'This service preset changed while you were editing. Close and reopen the preset to try again.' using errcode='PT409'; end if;
  raise exception 'Service preset not found';
 end if;
 insert into public.service_preset_history(service_type,revision,min_credits,max_credits,due_days) values(p_service_type,new_revision,p_min_credits,p_max_credits,p_due_days);
 perform private.audit('service_preset.updated',null,jsonb_build_object('service_type',p_service_type,'revision',new_revision));
 return new_revision;
 end
$$;
revoke execute on function public.update_workspace_settings(text,text,timestamptz),public.save_service_preset(text,integer,integer,integer,integer) from public,anon;
grant execute on function public.update_workspace_settings(text,text,timestamptz),public.save_service_preset(text,integer,integer,integer,integer) to authenticated;
-- Repeats `202609210003`'s repository-wide sweep for anything created by a concurrent session
-- since that migration ran; see that file for why this is the correct standing invariant rather
-- than `alter default privileges`.
revoke execute on all functions in schema public from public,anon;
