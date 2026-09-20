create or replace function public.review_publication(p_publication_id uuid,p_decision text,p_feedback text default '') returns void language plpgsql security definer set search_path='' as $$
 declare target_project uuid;target_client uuid;target_deliverable uuid;publication_number integer;existing public.publication_reviews;project_state public.project_status; begin
 select v.project_id,p.client_id,v.deliverable_id,v.version_number into target_project,target_client,target_deliverable,publication_number from public.published_versions v join public.projects p on p.id=v.project_id where v.id=p_publication_id;
 if not found or not private.is_client_member(target_client) then raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 p_feedback:=trim(coalesce(p_feedback,''));
 if p_decision='changes_requested' and p_feedback='' then raise exception 'Describe the requested changes'; end if;
 select status into project_state from public.projects where id=target_project for update;
 if exists(select 1 from public.published_versions where deliverable_id=target_deliverable and version_number>publication_number) then raise exception 'Review the latest published version'; end if;
 select * into existing from public.publication_reviews where publication_id=p_publication_id for update;
 if existing.status<>'pending' then
  if existing.status=p_decision and existing.feedback=p_feedback then return; end if;
  raise exception 'This publication already has a review decision';
 end if;
 if project_state='delivered' then raise exception 'Delivered projects cannot be reviewed'; end if;
 update public.publication_reviews set status=p_decision,feedback=p_feedback,reviewed_at=now() where publication_id=p_publication_id;
 update public.projects set status=case
  when exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.project_id=target_project and r.status='changes_requested' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=v.deliverable_id)) then 'changes_requested'::public.project_status
  when exists(select 1 from public.deliverables d where d.project_id=target_project and not exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.deliverable_id=d.id and r.status='approved' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=d.id))) then 'client_review'::public.project_status
  else 'approved'::public.project_status end,updated_at=now() where id=target_project;
 perform private.notify_agency(target_client,target_project,case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,p_feedback);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;
create or replace function public.publish_version(p_version_id uuid,p_release_note text default '',p_assets jsonb default '{}',p_idempotency_key uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare v public.design_versions; result_id uuid; target_client uuid; d public.designs; object_path text; next_number integer; existing private.publication_sources; begin
 perform private.assert_agency();
 if p_idempotency_key is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0)); end if;
 select * into v from public.design_versions where id=p_version_id for update;
 if not found then raise exception 'Version not found'; end if;
 perform 1 from public.projects where id=v.project_id for update;
 if p_idempotency_key is null then
  select publication_id into result_id from private.publication_sources where internal_version_id=v.id order by publication_id limit 1;
  if found then return result_id; end if;
  p_idempotency_key:=gen_random_uuid();
 end if;
 select * into existing from private.publication_sources where request_key=p_idempotency_key;
 if found then
  if existing.internal_version_id<>v.id or existing.published_by<>auth.uid() or existing.request_note<>p_release_note then raise exception 'Idempotency key conflicts with a different publication'; end if;
  return existing.publication_id;
 end if;
 if exists(select 1 from public.projects where id=v.project_id and status='delivered') then raise exception 'Delivered projects cannot publish new revisions'; end if;
 if not exists(select 1 from public.designs where version_id=v.id) then raise exception 'Add a design before publishing'; end if;
 perform 1 from public.deliverables where id=v.deliverable_id for update;
 select coalesce(max(version_number),0)+1 into next_number from public.published_versions where deliverable_id=v.deliverable_id;
 insert into public.published_versions(project_id,deliverable_id,version_number,release_note) values(v.project_id,v.deliverable_id,next_number,p_release_note) returning id into result_id;
 insert into private.publication_sources(publication_id,internal_version_id,published_by,request_key,request_note) values(result_id,v.id,auth.uid(),p_idempotency_key,p_release_note);
 for d in select * from public.designs where version_id=v.id order by sort_order loop
  object_path:=p_assets->>d.id::text;
  if d.internal_asset_path is not null and object_path is null then raise exception 'Prepare a sanitized publication asset for each uploaded design'; end if;
  if object_path is not null and (split_part(object_path,'/',1)<>v.project_id::text or not exists(select 1 from private.sanitized_assets s where s.bucket_id='published-assets' and not s.discard_requested and s.storage_path=object_path and s.project_id=v.project_id and s.prepared_by=auth.uid() and s.source_design_id=d.id and s.source_path=d.internal_asset_path)) then raise exception 'A trusted sanitized publication asset is required for this design'; end if;
  insert into public.published_designs(project_id,publication_id,title,content,asset_path,sort_order) values(v.project_id,result_id,d.title,private.public_design_content(d.content),object_path,d.sort_order);
 end loop;
 insert into public.publication_reviews(publication_id,project_id) values(result_id,v.project_id);
 update public.design_versions set status='reviewed' where id=v.id;
 update public.projects set status='client_review',updated_at=now() where id=v.project_id returning client_id into target_client;
 perform private.notify_client(target_client,v.project_id,'New designs ready for review',p_release_note);
 perform private.audit('version.published',result_id);
 return result_id;
end $$;

