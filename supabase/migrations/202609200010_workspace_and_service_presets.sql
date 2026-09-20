create table public.workspace_settings (
 id integer primary key default 1 check(id=1), studio_name text not null default 'Dawes Studio' check(length(studio_name) between 1 and 120),
 timezone text not null default 'America/New_York', updated_at timestamptz not null default now()
);
insert into public.workspace_settings default values;
alter table public.workspace_settings enable row level security;
revoke all on public.workspace_settings from anon,authenticated;
grant select on public.workspace_settings to authenticated;
create policy workspace_read on public.workspace_settings for select to authenticated using(true);
create table public.service_presets (
 service_type text primary key references public.service_catalog,
 min_credits integer not null check(min_credits>0), max_credits integer not null check(max_credits>=min_credits),
 due_days integer not null check(due_days between 1 and 365), revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
insert into public.service_presets(service_type,min_credits,max_credits,due_days) select id,coalesce((definition->>'min')::integer,3),coalesce((definition->>'max')::integer,6),coalesce((definition->>'days')::integer,7) from public.service_catalog;
create table public.service_preset_history (
 service_type text references public.service_catalog, revision integer not null,
 min_credits integer not null, max_credits integer not null, due_days integer not null, created_at timestamptz not null default now(),
 primary key(service_type,revision)
);
insert into public.service_preset_history(service_type,revision,min_credits,max_credits,due_days) select service_type,revision,min_credits,max_credits,due_days from public.service_presets;
alter table public.service_presets enable row level security;
alter table public.service_preset_history enable row level security;
revoke all on public.service_presets,public.service_preset_history from anon,authenticated;
grant select on public.service_presets,public.service_preset_history to authenticated;
create policy presets_read on public.service_presets for select to authenticated using(true);
create policy preset_history_read on public.service_preset_history for select to authenticated using(private.is_agency());
create trigger immutable_preset_history before update or delete on public.service_preset_history for each row execute function private.reject_mutation();
create function public.update_workspace_settings(p_studio_name text,p_timezone text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.assert_agency();
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid IANA timezone'; end if;
 update public.workspace_settings set studio_name=trim(p_studio_name),timezone=p_timezone,updated_at=now() where id=1;
 perform private.audit('workspace.updated',null);
 end
$$;
create function public.save_service_preset(p_service_type text,p_min_credits integer,p_max_credits integer,p_due_days integer) returns integer language plpgsql security definer set search_path='' as $$
 declare new_revision integer; begin
 perform private.assert_agency();
 update public.service_presets set min_credits=p_min_credits,max_credits=p_max_credits,due_days=p_due_days,revision=revision+1,updated_at=now() where service_type=p_service_type returning revision into new_revision;
 if not found then raise exception 'Service preset not found'; end if;
 insert into public.service_preset_history(service_type,revision,min_credits,max_credits,due_days) values(p_service_type,new_revision,p_min_credits,p_max_credits,p_due_days);
 perform private.audit('service_preset.updated',null,jsonb_build_object('service_type',p_service_type,'revision',new_revision));
 return new_revision;
 end
$$;
revoke execute on function public.update_workspace_settings(text,text),public.save_service_preset(text,integer,integer,integer) from public,anon;
grant execute on function public.update_workspace_settings(text,text),public.save_service_preset(text,integer,integer,integer) to authenticated;
