create function private.audit(event_name text, target_id uuid, event_details jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into private.audit_events(actor_id,event,entity_id,details) values(auth.uid(),event_name,target_id,event_details)
$$;
create function private.notify_agency(target_client uuid,target_project uuid,message_title text,message_body text default '') returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,client_id,project_id,title,body) select id,target_client,target_project,message_title,message_body from public.profiles where role='agency' and id<>auth.uid()
$$;
create function private.notify_client(target_client uuid,target_project uuid,message_title text,message_body text default '') returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,client_id,project_id,title,body) select user_id,target_client,target_project,message_title,message_body from public.client_memberships where client_id=target_client and user_id<>auth.uid()
$$;

create function public.save_briefing(p_client_id uuid,p_service_type text,p_title text default '',p_campaign_id uuid default null,p_overview text default '',p_goals text default '',p_direction jsonb default '{}',p_deliverables jsonb default '[]',p_due_date date default null,p_estimated_credits integer default 1,p_briefing_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; existing public.briefings; begin
 if not (private.is_agency() or private.is_client_member(p_client_id)) then raise exception 'Client access required' using errcode='42501'; end if;
 if p_briefing_id is not null then
  select * into existing from public.briefings where id=p_briefing_id and client_id=p_client_id for update;
  if not found then raise exception 'Briefing not found'; end if;
  if existing.status<>'draft' then raise exception 'Only draft briefings can be edited'; end if;
  update public.briefings set service_type=p_service_type,title=p_title,campaign_id=p_campaign_id,overview=p_overview,goals=p_goals,direction=p_direction,requested_deliverables=p_deliverables,due_date=p_due_date,estimated_credits=p_estimated_credits,updated_at=now() where id=p_briefing_id;
  return p_briefing_id;
 end if;
 insert into public.briefings(client_id,service_type,title,campaign_id,overview,goals,direction,requested_deliverables,due_date,estimated_credits,created_by) values(p_client_id,p_service_type,p_title,p_campaign_id,p_overview,p_goals,p_direction,p_deliverables,p_due_date,p_estimated_credits,auth.uid()) returning id into result_id;
 return result_id;
end $$;
create function public.submit_briefing(p_briefing_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare b public.briefings; begin
 select * into b from public.briefings where id=p_briefing_id for update;
 if not found or not(private.is_agency() or private.is_client_member(b.client_id)) then raise exception 'Briefing access required' using errcode='42501'; end if;
 if b.status<>'draft' then raise exception 'Only draft briefings can be submitted'; end if;
 if length(trim(b.title))=0 or length(trim(b.overview))=0 or b.campaign_id is null or jsonb_array_length(b.requested_deliverables)=0 then raise exception 'Campaign, title, overview and deliverables are required'; end if;
 update public.briefings set status='awaiting_review',updated_at=now() where id=b.id;
 perform private.notify_agency(b.client_id,null,'Briefing ready for review',b.title);
 perform private.audit('briefing.submitted',b.id);
end $$;
create function public.confirm_briefing_budget(p_briefing_id uuid,p_credits integer,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
 declare b public.briefings; begin
 perform private.assert_agency();
 select * into b from public.briefings where id=p_briefing_id for update;
 if not found or b.status not in ('awaiting_review','budget_confirmed') then raise exception 'Briefing is not awaiting a budget'; end if;
 if p_credits<=0 then raise exception 'Credits must be positive'; end if;
 if p_credits<>b.estimated_credits and length(trim(p_note))=0 then raise exception 'Explain any adjustment to estimated credits'; end if;
 update public.briefings set confirmed_credits=p_credits,budget_note=p_note,status='budget_confirmed',updated_at=now() where id=b.id;
 perform private.audit('briefing.budget_confirmed',b.id,jsonb_build_object('credits',p_credits));
end $$;
create function public.accept_briefing(p_briefing_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare b public.briefings; result_id uuid; current_balance integer; item jsonb; position integer:=0; begin
 perform private.assert_agency();
 select * into b from public.briefings where id=p_briefing_id for update;
 if not found then raise exception 'Briefing not found'; end if;
 if b.status='accepted' then select id into result_id from public.projects where briefing_id=b.id; return result_id; end if;
 if b.status<>'budget_confirmed' or b.confirmed_credits is null then raise exception 'Confirm the budget before accepting'; end if;
 select balance into current_balance from public.credit_accounts where client_id=b.client_id for update;
 if not found or current_balance<b.confirmed_credits then raise exception 'Insufficient credit balance' using errcode='P0001'; end if;
 if jsonb_array_length(b.requested_deliverables)=0 then raise exception 'At least one deliverable is required'; end if;
 insert into public.projects(client_id,campaign_id,briefing_id,title,description,service_type,due_date) values(b.client_id,b.campaign_id,b.id,b.title,b.overview,b.service_type,b.due_date) returning id into result_id;
 for item in select value from jsonb_array_elements(b.requested_deliverables) loop
  if length(trim(coalesce(item->>'name','')))=0 or length(trim(coalesce(item->>'format','')))=0 then raise exception 'Each deliverable requires a name and format'; end if;
  insert into public.deliverables(project_id,name,format,width,height,quantity,scope,sort_order) values(result_id,item->>'name',item->>'format',(item->>'width')::integer,(item->>'height')::integer,coalesce((item->>'quantity')::integer,1),coalesce(item->>'scope','original'),position);
  position:=position+1;
 end loop;
 update public.credit_accounts set balance=balance-b.confirmed_credits,updated_at=now() where client_id=b.client_id;
 insert into public.credit_ledger(client_id,project_id,amount,balance_after,kind,description,idempotency_key) values(b.client_id,result_id,-b.confirmed_credits,current_balance-b.confirmed_credits,'project_debit',b.title,'briefing:'||b.id);
 update public.briefings set status='accepted',updated_at=now() where id=b.id;
 perform private.notify_client(b.client_id,result_id,'Your project is ready',b.title);
 perform private.audit('briefing.accepted',b.id,jsonb_build_object('project_id',result_id));
 return result_id;
end $$;
create function public.adjust_credits(p_client_id uuid,p_amount integer,p_description text,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
 declare current_balance integer; previous public.credit_ledger; result_id uuid; begin
 perform private.assert_agency();
 if p_amount=0 or length(trim(p_description))=0 or length(trim(p_idempotency_key))=0 then raise exception 'Amount, description and idempotency key are required'; end if;
 select balance into current_balance from public.credit_accounts where client_id=p_client_id for update;
 if not found then raise exception 'Credit account not found'; end if;
 select * into previous from public.credit_ledger where idempotency_key=p_idempotency_key;
 if found then
  if previous.client_id<>p_client_id or previous.amount<>p_amount or previous.description<>p_description then raise exception 'Idempotency key conflicts with a different adjustment'; end if;
  return previous.id;
 end if;
 if current_balance+p_amount<0 then raise exception 'Insufficient credit balance'; end if;
 update public.credit_accounts set balance=current_balance+p_amount,updated_at=now() where client_id=p_client_id;
 insert into public.credit_ledger(client_id,amount,balance_after,kind,description,idempotency_key) values(p_client_id,p_amount,current_balance+p_amount,'adjustment',p_description,p_idempotency_key) returning id into result_id;
 perform private.audit('credits.adjusted',p_client_id,jsonb_build_object('amount',p_amount));
 return result_id;
end $$;
create function public.create_client(p_name text,p_slug text,p_industry text default '',p_initial_credits integer default 0) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 perform private.assert_agency();
 if p_initial_credits<0 then raise exception 'Initial credits cannot be negative'; end if;
 insert into public.clients(name,slug,industry,initials) values(p_name,p_slug,p_industry,upper(left(p_name,2))) returning id into result_id;
 insert into public.credit_accounts(client_id,balance) values(result_id,p_initial_credits);
 if p_initial_credits>0 then insert into public.credit_ledger(client_id,amount,balance_after,kind,description,idempotency_key) values(result_id,p_initial_credits,p_initial_credits,'allocation','Initial credit allocation','initial:'||result_id); end if;
 perform private.audit('client.created',result_id);
 return result_id;
end $$;
create function public.assign_designer(p_project_id uuid,p_designer_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare target_client uuid; begin
 perform private.assert_agency();
 if not exists(select 1 from public.profiles where id=p_designer_id and role='designer') then raise exception 'Select a designer account'; end if;
 select client_id into target_client from public.projects where id=p_project_id;
 insert into public.project_assignments(project_id,designer_id) values(p_project_id,p_designer_id) on conflict do nothing;
 insert into public.notifications(user_id,client_id,project_id,title,body) values(p_designer_id,target_client,p_project_id,'New project assignment','A project has been assigned to you.');
 perform private.audit('project.assigned',p_project_id);
end $$;
create function public.create_design_version(p_deliverable_id uuid,p_notes text default '',p_copy_version_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare target_project uuid; result_id uuid; next_version integer; begin
 select project_id into target_project from public.deliverables where id=p_deliverable_id for update;
 if not found or not private.can_produce(target_project) then raise exception 'Production access required' using errcode='42501'; end if;
 select coalesce(max(version_number),0)+1 into next_version from public.design_versions where deliverable_id=p_deliverable_id;
 insert into public.design_versions(project_id,deliverable_id,version_number,notes,created_by) values(target_project,p_deliverable_id,next_version,p_notes,auth.uid()) returning id into result_id;
 if p_copy_version_id is not null then
  if not exists(select 1 from public.design_versions where id=p_copy_version_id and deliverable_id=p_deliverable_id) then raise exception 'Source version belongs to another deliverable'; end if;
  insert into public.designs(project_id,version_id,title,content,internal_asset_path,sort_order,created_by) select target_project,result_id,title,content,internal_asset_path,sort_order,auth.uid() from public.designs where version_id=p_copy_version_id;
 end if;
 update public.projects set status='in_progress',updated_at=now() where id=target_project and status in ('planned','changes_requested');
 return result_id;
end $$;
create function public.add_design(p_version_id uuid,p_title text,p_content jsonb default '{}',p_internal_asset_path text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare target_project uuid; result_id uuid; begin
 select project_id into target_project from public.design_versions where id=p_version_id;
 if not found or not private.can_produce(target_project) then raise exception 'Production access required' using errcode='42501'; end if;
 if p_internal_asset_path is not null and split_part(p_internal_asset_path,'/',1)<>target_project::text then raise exception 'Asset path must belong to the project'; end if;
 insert into public.designs(project_id,version_id,title,content,internal_asset_path,sort_order,created_by) values(target_project,p_version_id,p_title,p_content,p_internal_asset_path,(select count(*) from public.designs where version_id=p_version_id),auth.uid()) returning id into result_id;
 return result_id;
end $$;
create function public.submit_design_version(p_version_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare v public.design_versions; target_client uuid; begin
 select * into v from public.design_versions where id=p_version_id;
 if not found or not private.can_produce(v.project_id) then raise exception 'Production access required' using errcode='42501'; end if;
 if not exists(select 1 from public.designs where version_id=v.id) then raise exception 'Add a design before submitting'; end if;
 update public.design_versions set status='submitted' where id=v.id;
 update public.projects set status='internal_review',updated_at=now() where id=v.project_id returning client_id into target_client;
 perform private.notify_agency(target_client,v.project_id,'Design ready for internal review');
end $$;

-- Copy a strict content allowlist; never copy arbitrary production metadata or storage paths.
create function private.public_design_content(source jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('headline',source->>'headline','subheading',source->>'subheading','body',source->>'body','background',source->>'background','foreground',source->>'foreground','accent',source->>'accent','eyebrow',source->>'eyebrow','layout',source->>'layout'))
$$;
create function public.publish_version(p_version_id uuid,p_release_note text default '',p_assets jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
 declare v public.design_versions; result_id uuid; target_client uuid; d public.designs; object_path text; next_number integer; begin
 perform private.assert_agency();
 select * into v from public.design_versions where id=p_version_id for update;
 if not found then raise exception 'Version not found'; end if;
 select publication_id into result_id from private.publication_sources where internal_version_id=v.id;
 if found then return result_id; end if;
 if not exists(select 1 from public.designs where version_id=v.id) then raise exception 'Add a design before publishing'; end if;
 perform 1 from public.deliverables where id=v.deliverable_id for update;
 select coalesce(max(version_number),0)+1 into next_number from public.published_versions where deliverable_id=v.deliverable_id;
 insert into public.published_versions(project_id,deliverable_id,version_number,release_note) values(v.project_id,v.deliverable_id,next_number,p_release_note) returning id into result_id;
 insert into private.publication_sources(publication_id,internal_version_id,published_by) values(result_id,v.id,auth.uid());
 for d in select * from public.designs where version_id=v.id order by sort_order loop
  object_path:=p_assets->>d.id::text;
  if d.internal_asset_path is not null and object_path is null then raise exception 'Prepare a sanitized publication asset for each uploaded design'; end if;
  if object_path is not null and (split_part(object_path,'/',1)<>v.project_id::text or not exists(select 1 from storage.objects where bucket_id='published-assets' and name=object_path and owner_id=auth.uid()::text)) then raise exception 'Publication asset must belong to this project and agency account'; end if;
  insert into public.published_designs(project_id,publication_id,title,content,asset_path,sort_order) values(v.project_id,result_id,d.title,private.public_design_content(d.content),object_path,d.sort_order);
 end loop;
 insert into public.publication_reviews(publication_id,project_id) values(result_id,v.project_id);
 update public.design_versions set status='reviewed' where id=v.id;
 update public.projects set status='client_review',updated_at=now() where id=v.project_id returning client_id into target_client;
 perform private.notify_client(target_client,v.project_id,'New designs ready for review',p_release_note);
 perform private.audit('version.published',result_id);
 return result_id;
end $$;
create function public.review_publication(p_publication_id uuid,p_decision text,p_feedback text default '') returns void language plpgsql security definer set search_path='' as $$
 declare target_project uuid; target_client uuid; begin
 select v.project_id,p.client_id into target_project,target_client from public.published_versions v join public.projects p on p.id=v.project_id where v.id=p_publication_id;
 if not found or not private.is_client_member(target_client) then raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 if p_decision='changes_requested' and length(trim(p_feedback))=0 then raise exception 'Describe the requested changes'; end if;
 if exists(select 1 from public.projects where id=target_project and status='delivered') then raise exception 'Delivered projects cannot be reviewed'; end if;
 update public.publication_reviews set status=p_decision,feedback=p_feedback,reviewed_at=now() where publication_id=p_publication_id;
 update public.projects set status=case when p_decision='changes_requested' then 'changes_requested'::public.project_status when not exists(select 1 from public.deliverables d where d.project_id=target_project and not exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.deliverable_id=d.id and r.status='approved' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=d.id))) then 'approved'::public.project_status else 'client_review'::public.project_status end,updated_at=now() where id=target_project;
 perform private.notify_agency(target_client,target_project,case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,p_feedback);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;
create function public.mark_project_delivered(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare p public.projects; begin
 perform private.assert_agency(); select * into p from public.projects where id=p_project_id for update;
 if not found or p.status<>'approved' then raise exception 'Approve all deliverables before delivery'; end if;
 if not exists(select 1 from public.delivery_files where project_id=p.id) then raise exception 'Add a delivery file before marking delivered'; end if;
 update public.projects set status='delivered',updated_at=now() where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;
create function public.add_delivery_file(p_project_id uuid,p_name text,p_storage_path text,p_mime_type text,p_file_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 perform private.assert_agency();
 if split_part(p_storage_path,'/',1)<>p_project_id::text or not exists(select 1 from storage.objects where bucket_id='delivery-files' and name=p_storage_path and owner_id=auth.uid()::text) then raise exception 'Upload a delivery file for this project first'; end if;
 insert into public.delivery_files(project_id,name,storage_path,mime_type,file_size) values(p_project_id,p_name,p_storage_path,p_mime_type,p_file_size) returning id into result_id;
 return result_id;
end $$;
create function public.post_comment(p_project_id uuid,p_channel text,p_body text,p_version_id uuid default null,p_design_id uuid default null,p_pin_x numeric default null,p_pin_y numeric default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; target_client uuid; sender_name text; begin
 select client_id into target_client from public.projects where id=p_project_id;
 if p_channel='internal' then
  if not private.can_produce(p_project_id) then raise exception 'Internal channel access required' using errcode='42501'; end if;
  insert into public.internal_comments(project_id,version_id,design_id,author_id,body,pin_x,pin_y) values(p_project_id,p_version_id,p_design_id,auth.uid(),trim(p_body),p_pin_x,p_pin_y) returning id into result_id;
  if private.is_agency() then insert into public.notifications(user_id,client_id,project_id,title) select designer_id,target_client,p_project_id,'New studio message' from public.project_assignments where project_id=p_project_id; else perform private.notify_agency(target_client,p_project_id,'New internal message'); end if;
 elsif p_channel='client' then
  if not private.can_client_channel(p_project_id) then raise exception 'Client channel access required' using errcode='42501'; end if;
  select case when private.is_agency() then 'Studio' else display_name end into sender_name from public.profiles where id=auth.uid();
  insert into public.client_comments(project_id,publication_id,design_id,author_label,author_kind,body,pin_x,pin_y) values(p_project_id,p_version_id,p_design_id,sender_name,case when private.is_agency() then 'studio' else 'client' end,trim(p_body),p_pin_x,p_pin_y) returning id into result_id;
  insert into private.client_comment_authors(comment_id,author_id) values(result_id,auth.uid());
  if private.is_agency() then perform private.notify_client(target_client,p_project_id,'New message from Studio'); else perform private.notify_agency(target_client,p_project_id,'New client message'); end if;
 else raise exception 'Invalid comment channel'; end if;
 return result_id;
end $$;
create function public.resolve_comment(p_comment_id uuid,p_channel text,p_resolved boolean default true) returns void language plpgsql security definer set search_path='' as $$
 declare target_project uuid; begin
 if p_channel='internal' then
  select project_id into target_project from public.internal_comments where id=p_comment_id;
  if not found or not private.can_produce(target_project) then raise exception 'Comment access required' using errcode='42501'; end if;
  update public.internal_comments set resolved=p_resolved where id=p_comment_id;
 elsif p_channel='client' then
  select project_id into target_project from public.client_comments where id=p_comment_id;
  if not found or not private.can_client_channel(target_project) then raise exception 'Comment access required' using errcode='42501'; end if;
  update public.client_comments set resolved=p_resolved where id=p_comment_id;
 else raise exception 'Invalid comment channel'; end if;
end $$;
create function public.create_invitation(p_email text,p_role public.app_role,p_client_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result_id uuid; token text; begin
 perform private.assert_agency();
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid email required'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.invitations(email,role,client_id) values(lower(trim(p_email)),p_role,p_client_id) returning id into result_id;
 insert into private.invitation_tokens(invitation_id,token_hash) values(result_id,encode(extensions.digest(token,'sha256'),'hex'));
 perform private.audit('invitation.created',result_id);
 return jsonb_build_object('id',result_id,'token',token);
end $$;
create function public.accept_invitation(p_token text) returns void language plpgsql security definer set search_path='' as $$
 declare inv public.invitations; user_email text; begin
 if auth.uid() is null then raise exception 'Sign in before accepting an invitation' using errcode='42501'; end if;
 select email into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select i.* into inv from public.invitations i join private.invitation_tokens t on t.invitation_id=i.id where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update of i;
 if not found or inv.status<>'pending' or inv.expires_at<now() or lower(inv.email)<>lower(coalesce(user_email,'')) then raise exception 'Invitation is invalid, expired or belongs to another email' using errcode='42501'; end if;
 if exists(select 1 from public.client_memberships where user_id=auth.uid()) or exists(select 1 from public.project_assignments where designer_id=auth.uid()) or private.current_role()<>'client' then raise exception 'Existing members require an administrator-managed role change'; end if;
 update public.profiles set role=inv.role where id=auth.uid();
 if inv.role='client' then insert into public.client_memberships(client_id,user_id) values(inv.client_id,auth.uid()); end if;
 update public.invitations set status='accepted' where id=inv.id;
 perform private.audit('invitation.accepted',inv.id);
end $$;
create function public.revoke_invitation(p_invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin perform private.assert_agency(); update public.invitations set status='revoked' where id=p_invitation_id and status='pending'; end
$$;

-- Freeze publications and ledger even for accidental privileged UPDATE/DELETE commands.
create function private.reject_mutation() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'This record is immutable'; end
$$;
create trigger immutable_published_versions before update or delete on public.published_versions for each row execute function private.reject_mutation();
create trigger immutable_published_designs before update or delete on public.published_designs for each row execute function private.reject_mutation();
create trigger immutable_credit_ledger before update or delete on public.credit_ledger for each row execute function private.reject_mutation();

revoke execute on all functions in schema public from public,anon;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.current_role(),private.is_agency(),private.is_client_member(uuid),private.can_access_project(uuid),private.can_produce(uuid),private.can_access_client(uuid),private.can_client_channel(uuid) to authenticated;
