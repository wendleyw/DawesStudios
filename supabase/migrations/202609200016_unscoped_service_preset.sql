alter table public.service_presets alter column min_credits drop not null;
alter table public.service_presets alter column max_credits drop not null;
alter table public.service_presets alter column due_days drop not null;
alter table public.service_preset_history alter column min_credits drop not null;
alter table public.service_preset_history alter column max_credits drop not null;
alter table public.service_preset_history alter column due_days drop not null;
alter table public.service_presets add constraint preset_scope_valid check(
 (service_type='other' and min_credits is null and max_credits is null and due_days is null) or
 (min_credits is not null and max_credits is not null and due_days is not null)
);
update public.service_presets set min_credits=null,max_credits=null,due_days=null,revision=revision+1,updated_at=now() where service_type='other' and min_credits is not null;
insert into public.service_preset_history(service_type,revision,min_credits,max_credits,due_days) select service_type,revision,min_credits,max_credits,due_days from public.service_presets where service_type='other' on conflict do nothing;
