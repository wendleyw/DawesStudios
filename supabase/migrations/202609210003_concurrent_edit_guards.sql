-- Give the four unguarded settings writes the compare-and-set the project editor already has.
--
-- `clients` and `campaigns` carried no revision at all, so a stale editor could only ever win.
-- Both get `updated_at` and a `before update` trigger that owns it: the timestamp is the database's,
-- never a caller's clock, so two browsers a few seconds apart cannot make a stale write look fresh.
-- `workspace_settings` and `service_presets` already carried a revision their RPC never read; both
-- functions now take the revision the form was opened on. That argument defaults to null, which
-- skips the guard, because non-interactive callers (fixtures and restore paths) write without ever
-- having opened a form; every editor in the product passes it.
alter table public.clients add column updated_at timestamptz not null default now();
alter table public.campaigns add column updated_at timestamptz not null default now();
create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
 begin new.updated_at:=clock_timestamp(); return new; end
$$;
create trigger client_updated_at before update on public.clients for each row execute function private.touch_updated_at();
create trigger campaign_updated_at before update on public.campaigns for each row execute function private.touch_updated_at();
revoke execute on function private.touch_updated_at() from public,anon,authenticated;
drop function public.update_workspace_settings(text,text);
-- Returns the revision the save produced, the way `save_service_preset` returns its new revision:
-- the studio form stays on screen, so it needs the value its own write created rather than a later
-- read, which another editor could already have moved past.
create function public.update_workspace_settings(p_studio_name text,p_timezone text,p_expected_updated_at timestamptz default null) returns timestamptz language plpgsql security definer set search_path='' as $$
 declare new_revision timestamptz; begin
 perform private.assert_agency();
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid IANA timezone'; end if;
 update public.workspace_settings set studio_name=trim(p_studio_name),timezone=p_timezone,updated_at=now() where id=1 and (p_expected_updated_at is null or updated_at=p_expected_updated_at) returning updated_at into new_revision;
 if not found then raise exception 'These studio settings changed while you were editing. Reload the page to try again.' using errcode='PT409'; end if;
 perform private.audit('workspace.updated',null);
 return new_revision;
 end
$$;
drop function public.save_service_preset(text,integer,integer,integer);
create function public.save_service_preset(p_service_type text,p_min_credits integer,p_max_credits integer,p_due_days integer,p_expected_revision integer default null) returns integer language plpgsql security definer set search_path='' as $$
 declare new_revision integer; begin
 perform private.assert_agency();
 update public.service_presets set min_credits=p_min_credits,max_credits=p_max_credits,due_days=p_due_days,revision=revision+1,updated_at=now() where service_type=p_service_type and (p_expected_revision is null or revision=p_expected_revision) returning revision into new_revision;
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
-- Recreating a function under a new signature creates a new object, and a new object in `public` is
-- created with EXECUTE for PUBLIC: `202609200002_workflows.sql` swept that away once, over the
-- functions that existed then, and nothing has kept it true since. The two functions above are
-- therefore revoked and granted by their full new signatures, and the sweep is repeated here for
-- anything created between that migration and this one.
--
-- `alter default privileges in schema public revoke execute on functions from public` is not the
-- permanent fix it looks like. Measured on this stack (PostgreSQL 17.6, run as `postgres`): the
-- stored default ACL never records the revocation and a function created afterwards still carries
-- `=X/postgres`. The same statement against `anon` does take effect, but anon keeps EXECUTE through
-- PUBLIC, so nothing changes. Closing it for every future migration needs a `ddl_command_end` event
-- trigger, which is a repository-wide decision rather than part of this defect; until it is taken,
-- `supabase/tests/database/concurrent_edit_guards.test.sql` asserts the invariant so the next lapse
-- fails a test instead of shipping.
revoke execute on all functions in schema public from public,anon;
