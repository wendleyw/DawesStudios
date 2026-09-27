-- Retire Versions, Phase 2: delete the legacy per-deliverable Versions data and drop the schema that
-- only it used. What stays is the Miro workspace: rounds are `design_versions` rows on a
-- `design_boards` board, client versions are project-level `published_versions`, and comments are
-- per channel with no design or pin data. Spec: docs/superpowers/specs/2026-09-27-retire-versions-design.md.
--
-- Inventory (live catalog, 2026-09-27) of every object that mentions `designs`, `published_designs`,
-- `deliverable_id` on the version tables, `design_id` / `pin_x` / `pin_y` / `pin_t` on the comment
-- tables, `internal_asset_path`, or the `published-assets` bucket, and what this migration does:
--
-- Tables
--   public.designs, public.published_designs ........................................ dropped
--   design_versions.deliverable_id, published_versions.deliverable_id ................ dropped
--   internal_comments / client_comments: design_id, pin_x, pin_y, pin_t .............. dropped
--   private.sanitized_assets.source_design_id (FK to designs) ......................... dropped
--   design_versions.board_id ......................................... becomes not null
-- Constraints and indexes (dropped with their columns or tables)
--   design_versions_one_parent, design_versions_deliverable_id_version_number_key,
--   published_versions_deliverable_id_version_number_key, internal_comments_check,
--   client_comments_check, internal_comments_pin_check, client_comments_pin_check, every FK from
--   or to designs / published_designs; published_versions_project_number (partial on
--   `deliverable_id is null`) is recreated as a plain unique index.
-- Triggers
--   designs_no_round_uploads (designs) + private.guard_round_designs() ................ dropped
--   immutable_published_designs (published_designs) ................... dropped with its table
--   immutable_published_versions: disabled only around the legacy delete, then re-enabled.
-- Functions dropped (legacy Versions only)
--   public.add_design, public.create_design_version, public.submit_design_version,
--   public.publish_version, private.public_design_content (used only by publish_version),
--   public.discard_prepared_assets (published-assets staging),
--   public.register_sanitized_video, public.find_sanitized_video_by_source,
--   public.list_stale_video_uploads (the design-video attestation pipeline; the media worker no
--   longer calls them), and the nine-argument public.post_comment.
-- Functions recreated in the Miro shape
--   public.post_comment(uuid,text,text,uuid,text) (no design or pin arguments),
--   public.review_publication (no deliverable branch), public.share_miro_version (no deliverable
--   column), public.clear_publication_miro_link (every version is project-level),
--   private.can_see_version (board_id is always set), public.register_sanitized_asset (same
--   signature for the media worker; refuses `published-assets` and any source design),
--   public.discard_sanitized_asset and public.list_stale_sanitized_assets (no designs references).
--   Unchanged and still valid: resolve_comment, send_board_round, set_version_miro_link,
--   set_publication_miro_link, clear_version_miro_link, accept_briefing,
--   private.can_read_internal_comment, private.guard_internal_comment_privacy.
-- Policies
--   designs_read, designs_edit, published_designs_read ................ dropped with their tables
--   storage published_storage_read (published-assets, read through published_designs) ... dropped;
--     the bucket keeps no browser policy, and the Task 2 cleanup runs as service_role.
--   storage internal_storage_delete ............................. recreated without designs
--   public.design_versions versions_read ................... recreated without the null branch
-- Realtime: public.designs leaves supabase_realtime (published_designs was never in it).
-- Grants: the author-column privileges of 202609260011 are untouched; dropped columns take their
--   column grants with them.
-- Storage: the `published-assets` bucket still holds objects, so it is NOT dropped here; the Task 2
--   cleanup script removes the bytes and its follow-up migration drops the bucket. The paths the
--   deleted rows referenced are kept in private.retired_version_objects for that script.
--
-- Guard: the counts of every table this migration must not touch are compared before and after;
-- any difference aborts the migration.

create temporary table retire_versions_protected as
select 'clients' as name, (select count(*) from public.clients) as rows
union all select 'projects', (select count(*) from public.projects)
union all select 'briefings', (select count(*) from public.briefings)
union all select 'deliverables', (select count(*) from public.deliverables)
union all select 'campaigns', (select count(*) from public.campaigns)
union all select 'credit_accounts', (select count(*) from public.credit_accounts)
union all select 'credit_months', (select count(*) from public.credit_months)
union all select 'credit_ledger', (select count(*) from public.credit_ledger)
union all select 'credit_plans', (select count(*) from public.credit_plans)
union all select 'credit_requests', (select count(*) from public.credit_requests)
union all select 'project_settlements', (select count(*) from public.project_settlements)
union all select 'project_covers', (select count(*) from public.project_covers)
union all select 'project_assets', (select count(*) from public.project_assets)
union all select 'project_assignments', (select count(*) from public.project_assignments)
union all select 'delivery_files', (select count(*) from public.delivery_files)
union all select 'design_boards', (select count(*) from public.design_boards)
union all select 'rounds', (select count(*) from public.design_versions where board_id is not null)
union all select 'client_versions', (select count(*) from public.published_versions where deliverable_id is null)
union all select 'playground_items', (select count(*) from public.playground_items)
union all select 'brand_assets', (select count(*) from public.brand_assets);

-- 1. The legacy rows.
create temporary table retired_versions as
  select id from public.design_versions where deliverable_id is not null;
create temporary table retired_publications as
  select id from public.published_versions where deliverable_id is not null;

-- The Storage objects the deleted rows point at, for the Task 2 cleanup script (the migration
-- cannot delete Storage bytes). Private: no API role reads it.
create table private.retired_version_objects(
  bucket_id text not null,
  storage_path text not null,
  primary key (bucket_id, storage_path)
);
revoke all on private.retired_version_objects from public, anon, authenticated, service_role;
insert into private.retired_version_objects(bucket_id, storage_path)
select 'internal-assets', internal_asset_path from public.designs where internal_asset_path is not null
union select 'published-assets', asset_path from public.published_designs where asset_path is not null
union select bucket_id, storage_path from private.sanitized_assets
  where bucket_id = 'published-assets'
     or (bucket_id = 'internal-assets'
         and storage_path in (select internal_asset_path from public.designs where internal_asset_path is not null));

delete from private.audit_events
 where entity_id in (select id from retired_versions)
    or entity_id in (select id from retired_publications)
    or entity_id in (select id from public.designs)
    or entity_id in (select id from public.published_designs);

delete from private.client_comment_authors
 where comment_id in (select id from public.client_comments
                       where design_id is not null or publication_id in (select id from retired_publications));
delete from public.client_comments
 where design_id is not null or publication_id in (select id from retired_publications);
delete from public.internal_comments
 where design_id is not null or version_id in (select id from retired_versions);

delete from private.sanitized_assets
 where bucket_id = 'published-assets'
    or (bucket_id = 'internal-assets'
        and storage_path in (select internal_asset_path from public.designs where internal_asset_path is not null));

delete from public.publication_miro_links where publication_id in (select id from retired_publications);
delete from public.publication_reviews where publication_id in (select id from retired_publications);
delete from private.publication_sources
 where publication_id in (select id from retired_publications)
    or internal_version_id in (select id from retired_versions);
delete from private.miro_share_requests
 where publication_id in (select id from retired_publications)
    or source_round in (select id from retired_versions);
delete from public.design_version_miro_links where version_id in (select id from retired_versions);

-- 2. The legacy-only policies, triggers and functions, before the tables they read go.
drop policy if exists published_storage_read on storage.objects;
drop policy if exists internal_storage_delete on storage.objects;
create policy internal_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'internal-assets'
         and owner_id = auth.uid()::text
         and private.can_produce(private.storage_scope(name))
         and not exists(select 1 from public.project_assets a where a.storage_path = objects.name));

drop function public.add_design(uuid, text, jsonb, text);
drop function public.create_design_version(uuid, text, uuid);
drop function public.submit_design_version(uuid);
drop function public.publish_version(uuid, text, jsonb, uuid);
drop function private.public_design_content(jsonb);
drop function public.discard_prepared_assets(text[]);
drop function public.register_sanitized_video(uuid, text, text, text, bigint, uuid, text);
drop function public.find_sanitized_video_by_source(uuid, text);
drop function public.list_stale_video_uploads();
drop function public.post_comment(uuid, text, text, uuid, uuid, numeric, numeric, numeric, text);

alter publication supabase_realtime drop table public.designs;
drop trigger designs_no_round_uploads on public.designs;
drop function private.guard_round_designs();

-- 3. The tables and columns.
alter table public.internal_comments
  drop constraint if exists internal_comments_check,
  drop constraint if exists internal_comments_pin_check,
  drop column design_id,
  drop column pin_x,
  drop column pin_y,
  drop column pin_t;
alter table public.client_comments
  drop constraint if exists client_comments_check,
  drop constraint if exists client_comments_pin_check,
  drop column design_id,
  drop column pin_x,
  drop column pin_y,
  drop column pin_t;
alter table private.sanitized_assets drop column source_design_id;

drop table public.published_designs;
drop table public.designs;

alter table public.published_versions disable trigger immutable_published_versions;
delete from public.published_versions where id in (select id from retired_publications);
alter table public.published_versions enable trigger immutable_published_versions;
delete from public.design_versions where id in (select id from retired_versions);

alter table public.design_versions drop constraint design_versions_one_parent;
alter table public.design_versions drop column deliverable_id;
alter table public.design_versions alter column board_id set not null;
alter table public.published_versions drop column deliverable_id;
create unique index published_versions_project_number
  on public.published_versions(project_id, version_number);

drop policy versions_read on public.design_versions;
create policy versions_read on public.design_versions for select to authenticated
  using (private.can_produce(project_id) and private.can_see_board(board_id));

-- 4. The Miro-model functions, without the dropped branches and parameters.
create or replace function private.can_see_version(target_version uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  -- A missing version stays `true`, as before: a project-level comment has no version to hide.
  select coalesce((select private.can_see_board(v.board_id)
    from public.design_versions v where v.id = target_version), true)
$$;

create function public.post_comment(
  p_project_id uuid, p_channel text, p_body text,
  p_version_id uuid default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid; target_client uuid; sender_name text; trimmed_body text;
  existing_internal public.internal_comments; existing_client public.client_comments;
begin
  trimmed_body := trim(p_body);
  select client_id into target_client from public.projects where id = p_project_id;
  if p_channel = 'internal' then
    if not private.can_produce(p_project_id) then
      raise exception 'Internal channel access required' using errcode = '42501';
    end if;
    if p_idempotency_key is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
      select * into existing_internal from public.internal_comments
        where idempotency_key = p_idempotency_key and project_id = p_project_id;
      if found then
        if existing_internal.version_id is distinct from p_version_id
           or existing_internal.body is distinct from trimmed_body then
          raise exception 'Idempotency key conflicts with a different comment';
        end if;
        return existing_internal.id;
      end if;
      if exists(select 1 from public.internal_comments where idempotency_key = p_idempotency_key) then
        raise exception 'Idempotency key conflicts with a different comment';
      end if;
    end if;
    insert into public.internal_comments(project_id, version_id, author_id, body, idempotency_key)
    values (p_project_id, p_version_id, auth.uid(), trimmed_body, p_idempotency_key)
    returning id into result_id;
    if private.is_agency() then
      -- A round note reaches only that board's designer; a project note reaches every assignee.
      insert into public.notifications(user_id, client_id, project_id, title)
      select pa.designer_id, target_client, p_project_id, 'New studio message'
        from public.project_assignments pa
       where pa.project_id = p_project_id
         and (p_version_id is null
              or pa.designer_id = (select db.designer_id from public.design_versions dv
                                     join public.design_boards db on db.id = dv.board_id
                                    where dv.id = p_version_id));
    else
      perform private.notify_agency(target_client, p_project_id, 'New internal message');
    end if;
  elsif p_channel = 'client' then
    if not private.can_client_channel(p_project_id) then
      raise exception 'Client channel access required' using errcode = '42501';
    end if;
    if p_idempotency_key is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
      select * into existing_client from public.client_comments
        where idempotency_key = p_idempotency_key and project_id = p_project_id;
      if found then
        if existing_client.publication_id is distinct from p_version_id
           or existing_client.body is distinct from trimmed_body then
          raise exception 'Idempotency key conflicts with a different comment';
        end if;
        return existing_client.id;
      end if;
      if exists(select 1 from public.client_comments where idempotency_key = p_idempotency_key) then
        raise exception 'Idempotency key conflicts with a different comment';
      end if;
    end if;
    select case when private.is_agency() then 'Studio' else display_name end into sender_name
      from public.profiles where id = auth.uid();
    insert into public.client_comments(project_id, publication_id, author_label, author_kind, body, idempotency_key)
    values (p_project_id, p_version_id, sender_name,
            case when private.is_agency() then 'studio' else 'client' end, trimmed_body, p_idempotency_key)
    returning id into result_id;
    insert into private.client_comment_authors(comment_id, author_id) values (result_id, auth.uid());
    if private.is_agency() then
      perform private.notify_client(target_client, p_project_id, 'New message from Studio');
    else
      perform private.notify_agency(target_client, p_project_id, 'New client message');
    end if;
  else
    raise exception 'Invalid comment channel';
  end if;
  return result_id;
end $$;
revoke all on function public.post_comment(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.post_comment(uuid, text, text, uuid, text) to authenticated, service_role;

create or replace function public.review_publication(p_publication_id uuid, p_decision text, p_feedback text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare target_project uuid; target_client uuid; publication_number integer;
  existing public.publication_reviews; project_state public.project_status;
begin
  select v.project_id, p.client_id, v.version_number into target_project, target_client, publication_number
    from public.published_versions v join public.projects p on p.id = v.project_id
   where v.id = p_publication_id;
  if not found or not private.is_client_member(target_client) then
    raise exception 'Client review access required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'changes_requested') then raise exception 'Invalid review decision'; end if;
  p_feedback := trim(coalesce(p_feedback, ''));
  if p_decision = 'changes_requested' and p_feedback = '' then
    raise exception 'Describe the requested changes';
  end if;
  select status into project_state from public.projects where id = target_project for update;
  if exists(select 1 from public.published_versions
             where project_id = target_project and version_number > publication_number) then
    raise exception 'Review the latest published version';
  end if;
  select * into existing from public.publication_reviews where publication_id = p_publication_id for update;
  if existing.status <> 'pending' then
    if existing.status = p_decision and existing.feedback = p_feedback then return; end if;
    raise exception 'This publication already has a review decision';
  end if;
  if project_state = 'delivered' then raise exception 'Delivered projects cannot be reviewed'; end if;
  update public.publication_reviews
     set status = p_decision, feedback = p_feedback, reviewed_at = now(), reviewed_by = auth.uid()
   where publication_id = p_publication_id;
  -- A client version stands for the whole project.
  update public.projects
     set status = case when p_decision = 'approved' then 'approved'::public.project_status
                       else 'changes_requested'::public.project_status end,
         updated_at = now()
   where id = target_project;
  perform private.notify_agency(target_client, target_project,
    case when p_decision = 'approved' then 'Client approved a design' else 'Client requested changes' end,
    p_feedback);
  perform private.audit('publication.reviewed', p_publication_id, jsonb_build_object('decision', p_decision));
end $$;

create or replace function public.share_miro_version(p_project_id uuid, p_url text, p_note text default '',
  p_source_round uuid default null, p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_note text := btrim(coalesce(p_note, '')); v_board text; v_widget text; next_number integer;
  result_id uuid; target_client uuid; req private.miro_share_requests; req_board text; req_widget text;
begin
  perform private.assert_agency();
  if p_idempotency_key is null then p_idempotency_key := gen_random_uuid(); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  select * into req from private.miro_share_requests where request_key = p_idempotency_key;
  if found then
    select board_id, widget_id into req_board, req_widget from public.publication_miro_links
      where publication_id = req.publication_id;
    if req.project_id <> p_project_id or req.source_round is distinct from p_source_round
       or (select release_note from public.published_versions where id = req.publication_id) <> v_note
       or req_board is distinct from v_board or req_widget is distinct from v_widget then
      raise exception 'Idempotency key conflicts with a different version' using errcode = '23505';
    end if;
    return req.publication_id;
  end if;
  select client_id into target_client from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.projects where id = p_project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot publish new revisions' using errcode = '22023';
  end if;
  if p_source_round is not null and not exists(
    select 1 from public.design_versions where id = p_source_round and project_id = p_project_id
  ) then
    raise exception 'Round not found in this project' using errcode = 'P0002';
  end if;
  if p_source_round is not null and exists(
    select 1 from private.publication_sources where internal_version_id = p_source_round
  ) then
    raise exception 'This round is already shared' using errcode = '23505';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.published_versions where project_id = p_project_id;
  insert into public.published_versions(project_id, version_number, release_note)
  values (p_project_id, next_number, v_note) returning id into result_id;
  insert into public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by)
  values (result_id, p_project_id, v_board, v_widget, auth.uid());
  insert into public.publication_reviews(publication_id, project_id) values (result_id, p_project_id);
  if p_source_round is not null then
    begin
      insert into private.publication_sources(publication_id, internal_version_id, published_by, request_key, request_note)
      values (result_id, p_source_round, auth.uid(), p_idempotency_key, v_note);
    exception when unique_violation then
      raise exception 'Idempotency key conflicts with a different version' using errcode = '23505';
    end;
    update public.design_versions set status = 'reviewed' where id = p_source_round;
  end if;
  insert into private.miro_share_requests(request_key, publication_id, project_id, source_round, requested_by)
  values (p_idempotency_key, result_id, p_project_id, p_source_round, auth.uid());
  update public.projects set status = 'client_review', updated_at = now() where id = p_project_id;
  perform private.notify_client(target_client, p_project_id, 'New designs ready for review', v_note);
  perform private.audit('version.published', result_id);
  return result_id;
end $$;

create or replace function public.clear_publication_miro_link(p_publication_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_agency();
  -- Every client version is project-level, and its Miro link is what the client opens.
  if exists(select 1 from public.published_versions where id = p_publication_id) then
    raise exception 'A shared version needs its Miro link' using errcode = '22023';
  end if;
end $$;

-- The media worker still sends `p_source_design_id` (always null now), so the signature stays.
create or replace function public.register_sanitized_asset(p_project_id uuid, p_bucket_id text,
  p_storage_path text, p_sha256 text, p_mime_type text, p_file_size bigint, p_prepared_by uuid,
  p_source_design_id uuid default null, p_source_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted media service required' using errcode = '42501';
  end if;
  if not exists(select 1 from public.profiles where id = p_prepared_by and role = 'agency') then
    raise exception 'Agency preparation identity required';
  end if;
  if private.storage_scope(p_storage_path) <> p_project_id or not private.opaque_storage_path(p_storage_path) then
    raise exception 'Invalid sanitized storage path';
  end if;
  if p_bucket_id = 'published-assets' then
    raise exception 'Published design assets are retired' using errcode = '22023';
  end if;
  if p_source_design_id is not null then
    raise exception 'Uploaded designs are retired' using errcode = '22023';
  end if;
  if p_bucket_id = 'delivery-files' and p_mime_type not in ('image/png', 'application/pdf') then
    raise exception 'Unsupported sanitized delivery type';
  end if;
  if p_bucket_id = 'project-covers' and p_mime_type <> 'image/png' then
    raise exception 'Unsupported sanitized cover' using errcode = '22023';
  end if;
  if not exists(select 1 from storage.objects where bucket_id = p_bucket_id and name = p_storage_path
                  and (metadata->>'size')::bigint = p_file_size) then
    raise exception 'Sanitized object is missing or its size differs';
  end if;
  if exists(select 1 from private.sanitized_assets s where s.bucket_id = p_bucket_id and s.storage_path = p_storage_path) then
    if exists(select 1 from private.sanitized_assets s
               where s.bucket_id = p_bucket_id and s.storage_path = p_storage_path and s.sha256 = p_sha256
                 and s.file_size = p_file_size and s.mime_type = p_mime_type and s.prepared_by = p_prepared_by
                 and s.source_path is not distinct from p_source_path and not s.discard_requested) then
      return;
    end if;
    raise exception 'Sanitized asset registration conflicts with existing bytes';
  end if;
  insert into private.sanitized_assets(bucket_id, storage_path, project_id, sha256, mime_type, file_size, prepared_by, source_path)
  values (p_bucket_id, p_storage_path, p_project_id, p_sha256, p_mime_type, p_file_size, p_prepared_by, p_source_path);
end $$;

create or replace function public.discard_sanitized_asset(p_bucket_id text, p_storage_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_project uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted media service required' using errcode = '42501';
  end if;
  select project_id into target_project from private.sanitized_assets
   where bucket_id = p_bucket_id and storage_path = p_storage_path;
  if found then perform 1 from public.projects where id = target_project for update; end if;
  if exists(select 1 from public.delivery_files where storage_path = p_storage_path)
     or exists(select 1 from public.project_covers where storage_path = p_storage_path) then
    raise exception 'Referenced assets cannot be discarded';
  end if;
  update private.sanitized_assets set discard_requested = true
   where bucket_id = p_bucket_id and storage_path = p_storage_path;
end $$;

create or replace function public.list_stale_sanitized_assets()
returns table(bucket_id text, storage_path text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted media service required' using errcode = '42501';
  end if;
  return query
    select s.bucket_id, s.storage_path from private.sanitized_assets s
     where s.bucket_id <> 'internal-assets'
       and (s.discard_requested or s.created_at < now() - interval '24 hours')
       and not exists(select 1 from public.delivery_files f where f.storage_path = s.storage_path)
       and not exists(select 1 from public.project_covers c where c.storage_path = s.storage_path)
     order by s.created_at limit 100;
end $$;

-- 5. The guard: nothing outside the legacy Versions data moved.
do $$
declare changed text;
begin
  select string_agg(p.name || ' ' || p.rows || '->' || now_rows.rows, ', ') into changed
    from retire_versions_protected p
    join (
      select 'clients' as name, (select count(*) from public.clients) as rows
      union all select 'projects', (select count(*) from public.projects)
      union all select 'briefings', (select count(*) from public.briefings)
      union all select 'deliverables', (select count(*) from public.deliverables)
      union all select 'campaigns', (select count(*) from public.campaigns)
      union all select 'credit_accounts', (select count(*) from public.credit_accounts)
      union all select 'credit_months', (select count(*) from public.credit_months)
      union all select 'credit_ledger', (select count(*) from public.credit_ledger)
      union all select 'credit_plans', (select count(*) from public.credit_plans)
      union all select 'credit_requests', (select count(*) from public.credit_requests)
      union all select 'project_settlements', (select count(*) from public.project_settlements)
      union all select 'project_covers', (select count(*) from public.project_covers)
      union all select 'project_assets', (select count(*) from public.project_assets)
      union all select 'project_assignments', (select count(*) from public.project_assignments)
      union all select 'delivery_files', (select count(*) from public.delivery_files)
      union all select 'design_boards', (select count(*) from public.design_boards)
      union all select 'rounds', (select count(*) from public.design_versions)
      union all select 'client_versions', (select count(*) from public.published_versions)
      union all select 'playground_items', (select count(*) from public.playground_items)
      union all select 'brand_assets', (select count(*) from public.brand_assets)
    ) now_rows on now_rows.name = p.name
   where p.rows <> now_rows.rows;
  if changed is not null then
    raise exception 'Retire Versions touched protected rows: %', changed;
  end if;
end $$;

drop table retire_versions_protected, retired_versions, retired_publications;
