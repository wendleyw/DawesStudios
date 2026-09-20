-- Creative Canvas: tenant boundaries are enforced in PostgreSQL, independently of the UI.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create extension if not exists pgcrypto with schema extensions;
create type public.app_role as enum ('agency', 'client', 'designer');
create type public.briefing_status as enum ('draft', 'awaiting_review', 'budget_confirmed', 'accepted');
create type public.project_status as enum ('planned', 'in_progress', 'internal_review', 'client_review', 'changes_requested', 'approved', 'delivered');

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 display_name text not null check (length(display_name) between 1 and 120),
 role public.app_role not null default 'client',
 avatar_url text,
 created_at timestamptz not null default now()
);
create table public.clients (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(name) between 1 and 120),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 industry text not null default '', initials text not null default '',
 website text not null default '', description text not null default '',
 archived boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.client_memberships (
 client_id uuid references public.clients on delete cascade,
 user_id uuid references public.profiles on delete cascade,
 primary key(client_id,user_id)
);
create table public.campaigns (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 title text not null check(length(title) between 1 and 200), description text not null default '',
 start_date date, end_date date, created_at timestamptz not null default now(),
 unique(id,client_id), check(end_date is null or start_date is null or end_date>=start_date)
);
create table public.briefings (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 campaign_id uuid, title text not null default '', service_type text not null,
 status public.briefing_status not null default 'draft', overview text not null default '',
 goals text not null default '', direction jsonb not null default '{}',
 requested_deliverables jsonb not null default '[]' check(jsonb_typeof(requested_deliverables)='array'),
 due_date date, estimated_credits integer not null default 1 check(estimated_credits>0),
 confirmed_credits integer check(confirmed_credits>0), budget_note text,
 created_by uuid not null references public.profiles, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(campaign_id,client_id) references public.campaigns(id,client_id),
 unique(id,client_id)
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 campaign_id uuid, briefing_id uuid unique, title text not null,
 description text not null default '', status public.project_status not null default 'planned',
 service_type text not null, due_date date, start_date date default current_date,
 board_position jsonb not null default '{"x":0,"y":0}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(campaign_id,client_id) references public.campaigns(id,client_id),
 foreign key(briefing_id,client_id) references public.briefings(id,client_id), unique(id,client_id)
);
create table public.project_assignments (
 project_id uuid references public.projects on delete cascade,
 designer_id uuid references public.profiles on delete cascade,
 primary key(project_id,designer_id)
);
create table public.deliverables (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 name text not null, format text not null, width integer check(width>0), height integer check(height>0),
 quantity integer not null default 1 check(quantity between 1 and 100),
 scope text not null default 'original' check(scope in ('original','adaptation')),
 sort_order integer not null default 0, unique(id,project_id)
);
create table public.design_versions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 deliverable_id uuid not null, version_number integer not null check(version_number>0),
 notes text not null default '', status text not null default 'draft' check(status in ('draft','submitted','reviewed')),
 created_by uuid not null references public.profiles, created_at timestamptz not null default now(),
 foreign key(deliverable_id,project_id) references public.deliverables(id,project_id),
 unique(deliverable_id,version_number), unique(id,project_id)
);
create table public.designs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 version_id uuid not null, title text not null,
 content jsonb not null default '{}' check(jsonb_typeof(content)='object'),
 internal_asset_path text, sort_order integer not null default 0,
 created_by uuid not null references public.profiles, created_at timestamptz not null default now(),
 foreign key(version_id,project_id) references public.design_versions(id,project_id), unique(id,project_id,version_id)
);
-- Client publications intentionally contain no internal version/design IDs or authorship fields.
create table public.published_versions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 deliverable_id uuid not null, version_number integer not null, release_note text not null default '',
 published_at timestamptz not null default now(),
 foreign key(deliverable_id,project_id) references public.deliverables(id,project_id),
 unique(deliverable_id,version_number), unique(id,project_id)
);
create table private.publication_sources (
 publication_id uuid primary key references public.published_versions,
 internal_version_id uuid not null unique references public.design_versions,
 published_by uuid not null references public.profiles
);
create table public.published_designs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 publication_id uuid not null, title text not null, content jsonb not null default '{}',
 asset_path text, sort_order integer not null default 0,
 foreign key(publication_id,project_id) references public.published_versions(id,project_id),
 unique(id,project_id,publication_id)
);
create table public.publication_reviews (
 id uuid primary key default gen_random_uuid(), publication_id uuid not null unique references public.published_versions,
 project_id uuid not null references public.projects,
 status text not null default 'pending' check(status in ('pending','approved','changes_requested')),
 feedback text not null default '', reviewed_at timestamptz,
 foreign key(publication_id,project_id) references public.published_versions(id,project_id)
);
create table public.internal_comments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 version_id uuid, design_id uuid, author_id uuid not null references public.profiles,
 body text not null check(length(body) between 1 and 10000), pin_x numeric, pin_y numeric,
 resolved boolean not null default false, created_at timestamptz not null default now(),
 foreign key(version_id,project_id) references public.design_versions(id,project_id),
 foreign key(design_id,project_id,version_id) references public.designs(id,project_id,version_id),
 check(design_id is null or version_id is not null),
 check((pin_x is null and pin_y is null) or (design_id is not null and pin_x between 0 and 1 and pin_y between 0 and 1))
);
create table public.client_comments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 publication_id uuid, design_id uuid,
 author_label text not null check(length(author_label) between 1 and 120),
 author_kind text not null check(author_kind in ('studio','client')),
 body text not null check(length(body) between 1 and 10000), pin_x numeric, pin_y numeric,
 resolved boolean not null default false, created_at timestamptz not null default now(),
 foreign key(publication_id,project_id) references public.published_versions(id,project_id),
 foreign key(design_id,project_id,publication_id) references public.published_designs(id,project_id,publication_id),
 check(design_id is null or publication_id is not null),
 check((pin_x is null and pin_y is null) or (design_id is not null and pin_x between 0 and 1 and pin_y between 0 and 1))
);
create table private.client_comment_authors (
 comment_id uuid primary key references public.client_comments, author_id uuid not null references public.profiles
);
create table public.credit_accounts (
 client_id uuid primary key references public.clients,
 balance integer not null default 0 check(balance>=0), updated_at timestamptz not null default now()
);
create table public.credit_ledger (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 project_id uuid, amount integer not null check(amount<>0), balance_after integer not null check(balance_after>=0),
 kind text not null check(kind in ('allocation','project_debit','adjustment')),
 description text not null, idempotency_key text not null unique,
 created_at timestamptz not null default now(),
 foreign key(project_id,client_id) references public.projects(id,client_id),
 check((kind='project_debit' and amount<0 and project_id is not null) or (kind<>'project_debit' and project_id is null))
);
create unique index one_debit_per_project on public.credit_ledger(project_id) where kind='project_debit';
create table public.brand_sections (
 client_id uuid references public.clients, section text not null check(section in ('overview','logos','colors','typography','visual-style','products','messaging','ai')),
 content jsonb not null default '{}', updated_at timestamptz not null default now(), primary key(client_id,section)
);
create table public.brand_assets (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 name text not null, category text not null, description text not null default '',
 storage_path text, mime_type text, tags text[] not null default '{}',
 created_at timestamptz not null default now()
);
create table public.brand_templates (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 name text not null, category text not null, width integer not null, height integer not null,
 content jsonb not null default '{}', unique(id,client_id)
);
create table public.template_drafts (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 template_id uuid not null, owner_id uuid not null references public.profiles default auth.uid(),
 name text not null, content jsonb not null default '{}', updated_at timestamptz not null default now(),
 foreign key(template_id,client_id) references public.brand_templates(id,client_id)
);
create table public.project_assets (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 name text not null, category text not null default 'reference', storage_path text not null,
 mime_type text not null, file_size bigint not null check(file_size>=0),
 created_at timestamptz not null default now()
);
create table public.delivery_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects,
 name text not null, storage_path text not null, mime_type text not null,
 file_size bigint not null check(file_size>=0), created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
 client_id uuid references public.clients, project_id uuid references public.projects,
 title text not null, body text not null default '', kind text not null default 'activity',
 read_at timestamptz, created_at timestamptz not null default now()
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), email text not null,
 role public.app_role not null, client_id uuid references public.clients,
 status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(), check((role='client')=(client_id is not null))
);
create unique index one_pending_invitation_per_email on public.invitations(lower(email)) where status='pending';
create table private.invitation_tokens (invitation_id uuid primary key references public.invitations, token_hash text not null unique);
create table private.audit_events (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles,
 event text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);

create function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid()
$$;
create function private.is_agency() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.current_role()='agency',false)
$$;
create function private.is_client_member(target_client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role()='client' and exists(select 1 from public.client_memberships where client_id=target_client and user_id=auth.uid())
$$;
create function private.can_access_project(target_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=target_project and (private.is_agency() or private.is_client_member(p.client_id) or exists(select 1 from public.project_assignments a where a.project_id=p.id and a.designer_id=auth.uid())))
$$;
create function private.can_produce(target_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_agency() or (private.current_role()='designer' and exists(select 1 from public.project_assignments where project_id=target_project and designer_id=auth.uid()))
$$;
create function private.can_access_client(target_client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_agency() or private.is_client_member(target_client) or (private.current_role()='designer' and exists(select 1 from public.projects p join public.project_assignments a on a.project_id=p.id where p.client_id=target_client and a.designer_id=auth.uid()))
$$;
create function private.can_client_channel(target_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_agency() or exists(select 1 from public.projects where id=target_project and private.is_client_member(client_id))
$$;
create function private.assert_agency() returns void language plpgsql stable security definer set search_path='' as $$
 begin if not private.is_agency() then raise exception 'Agency access required' using errcode='42501'; end if; end
$$;

-- Auth metadata can never assign an application role.
create function private.handle_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.profiles(id,display_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(new.email,'@',1),'Member'),120)); return new; end
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_auth_user();

-- Nothing in the public schema is accessible anonymously. Direct writes exist only for non-sensitive fields.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_agency());
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant update(display_name,avatar_url) on public.profiles to authenticated;
create policy clients_read on public.clients for select to authenticated using(private.can_access_client(id));
create policy clients_edit on public.clients for update to authenticated using(private.is_agency()) with check(private.is_agency());
grant update(name,industry,website,description,archived,initials) on public.clients to authenticated;
create policy memberships_read on public.client_memberships for select to authenticated using(private.is_agency() or user_id=auth.uid());
create policy campaigns_read on public.campaigns for select to authenticated using(private.can_access_client(client_id));
create policy campaigns_create on public.campaigns for insert to authenticated with check(private.is_agency() or private.is_client_member(client_id));
create policy campaigns_edit on public.campaigns for update to authenticated using(private.is_agency() or private.is_client_member(client_id)) with check(private.is_agency() or private.is_client_member(client_id));
grant insert(id,client_id,title,description,start_date,end_date),update(title,description,start_date,end_date) on public.campaigns to authenticated;
create policy briefings_read on public.briefings for select to authenticated using(private.is_agency() or private.is_client_member(client_id) or (status='accepted' and exists(select 1 from public.projects p where p.briefing_id=briefings.id and private.can_produce(p.id))));
create policy projects_read on public.projects for select to authenticated using(private.can_access_project(id));
create policy projects_edit on public.projects for update to authenticated using(private.is_agency()) with check(private.is_agency());
grant update(title,description,due_date,start_date,board_position) on public.projects to authenticated;
create policy assignments_read on public.project_assignments for select to authenticated using(private.is_agency() or designer_id=auth.uid());
create policy deliverables_read on public.deliverables for select to authenticated using(private.can_access_project(project_id));
create policy versions_read on public.design_versions for select to authenticated using(private.can_produce(project_id));
create policy designs_read on public.designs for select to authenticated using(private.can_produce(project_id));
create policy designs_edit on public.designs for update to authenticated using(private.can_produce(project_id)) with check(private.can_produce(project_id));
grant update(title,content,internal_asset_path,sort_order) on public.designs to authenticated;
create policy publications_read on public.published_versions for select to authenticated using(private.can_client_channel(project_id));
create policy published_designs_read on public.published_designs for select to authenticated using(private.can_client_channel(project_id));
create policy reviews_read on public.publication_reviews for select to authenticated using(private.can_client_channel(project_id));
create policy internal_comments_read on public.internal_comments for select to authenticated using(private.can_produce(project_id));
create policy client_comments_read on public.client_comments for select to authenticated using(private.can_client_channel(project_id));
create policy account_read on public.credit_accounts for select to authenticated using(private.is_agency() or private.is_client_member(client_id));
create policy ledger_read on public.credit_ledger for select to authenticated using(private.is_agency() or private.is_client_member(client_id));
create policy brand_sections_read on public.brand_sections for select to authenticated using(private.can_access_client(client_id));
create policy brand_sections_write on public.brand_sections for all to authenticated using(private.is_agency()) with check(private.is_agency());
grant insert,update,delete on public.brand_sections to authenticated;
create policy brand_assets_read on public.brand_assets for select to authenticated using(private.can_access_client(client_id));
create policy brand_assets_write on public.brand_assets for all to authenticated using(private.is_agency()) with check(private.is_agency());
grant insert,update,delete on public.brand_assets to authenticated;
create policy templates_read on public.brand_templates for select to authenticated using(private.can_access_client(client_id));
create policy templates_write on public.brand_templates for all to authenticated using(private.is_agency()) with check(private.is_agency());
grant insert,update,delete on public.brand_templates to authenticated;
create policy drafts_owner on public.template_drafts for all to authenticated using(owner_id=auth.uid() and private.can_access_client(client_id)) with check(owner_id=auth.uid() and private.can_access_client(client_id));
grant insert(id,client_id,template_id,owner_id,name,content),update(name,content,updated_at),delete on public.template_drafts to authenticated;
create policy assets_read on public.project_assets for select to authenticated using(private.can_produce(project_id));
create policy assets_write on public.project_assets for insert to authenticated with check(private.can_produce(project_id) and split_part(storage_path,'/',1)=project_id::text);
grant insert on public.project_assets to authenticated;
create policy delivery_read on public.delivery_files for select to authenticated using(private.can_access_project(project_id));
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_edit on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant update(read_at) on public.notifications to authenticated;
create policy invitations_read on public.invitations for select to authenticated using(private.is_agency());

create index memberships_user on public.client_memberships(user_id);
create index projects_client_status on public.projects(client_id,status);
create index assignments_designer on public.project_assignments(designer_id);
create index briefings_client_status on public.briefings(client_id,status);
create index designs_version on public.designs(version_id);
create index internal_comments_project on public.internal_comments(project_id,created_at);
create index client_comments_project on public.client_comments(project_id,created_at);
create index ledger_client_date on public.credit_ledger(client_id,created_at);
create index notifications_user_date on public.notifications(user_id,created_at desc);
