create table public.credit_requests (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients,
 requested_by uuid not null references public.profiles, amount integer not null check(amount in (25,50,100)),
 note text not null default '', status text not null default 'pending' check(status in ('pending','fulfilled','rejected')),
 response_note text not null default '', ledger_id uuid unique references public.credit_ledger,
 created_at timestamptz not null default now(), resolved_at timestamptz
);
alter table public.credit_requests enable row level security;
revoke all on public.credit_requests from anon,authenticated;
grant select on public.credit_requests to authenticated;
create policy credit_requests_read on public.credit_requests for select to authenticated using(private.is_agency() or private.is_client_member(client_id));
create function public.request_credits(p_client_id uuid,p_amount integer,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 if not(private.is_agency() or private.is_client_member(p_client_id)) then raise exception 'Client access required' using errcode='42501'; end if;
 insert into public.credit_requests(client_id,requested_by,amount,note) values(p_client_id,auth.uid(),p_amount,p_note) returning id into result_id;
 perform private.notify_agency(p_client_id,null,'Credit allocation requested');
 return result_id;
end $$;
create function public.fulfill_credit_request(p_request_id uuid,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare request public.credit_requests; transaction_id uuid; begin
 perform private.assert_agency(); select * into request from public.credit_requests where id=p_request_id for update;
 if not found then raise exception 'Credit request not found'; end if;
 if request.status='fulfilled' then return request.ledger_id; end if;
 if request.status<>'pending' then raise exception 'Credit request is no longer pending'; end if;
 transaction_id:=public.adjust_credits(request.client_id,request.amount,'Credit request allocation','credit-request:'||request.id);
 update public.credit_requests set status='fulfilled',response_note=p_note,ledger_id=transaction_id,resolved_at=now() where id=request.id;
 perform private.notify_client(request.client_id,null,'Credits added to your workspace',p_note);
 return transaction_id;
end $$;
create function public.reject_credit_request(p_request_id uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
 declare target_client uuid; begin
 perform private.assert_agency();
 if length(trim(p_note))=0 then raise exception 'A response note is required'; end if;
 update public.credit_requests set status='rejected',response_note=p_note,resolved_at=now() where id=p_request_id and status='pending' returning client_id into target_client;
 if not found then raise exception 'Pending credit request not found'; end if;
 perform private.notify_client(target_client,null,'Credit request updated',p_note);
end $$;
create table public.briefing_attachments (
 id uuid primary key default gen_random_uuid(), briefing_id uuid not null references public.briefings,
 name text not null, storage_path text not null unique, mime_type text not null,
 file_size bigint not null check(file_size between 1 and 52428800), created_at timestamptz not null default now()
);
alter table public.briefing_attachments enable row level security;
revoke all on public.briefing_attachments from anon,authenticated;
grant select on public.briefing_attachments to authenticated;
create function private.can_access_briefing(target_briefing uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.briefings b where b.id=target_briefing and (private.is_agency() or private.is_client_member(b.client_id) or exists(select 1 from public.projects p where p.briefing_id=b.id and private.can_produce(p.id))))
$$;
create function private.can_edit_briefing(target_briefing uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.briefings b where b.id=target_briefing and b.status='draft' and (private.is_agency() or private.is_client_member(b.client_id)))
$$;
create policy briefing_attachments_read on public.briefing_attachments for select to authenticated using(private.can_access_briefing(briefing_id));
create function public.add_briefing_attachment(p_briefing_id uuid,p_name text,p_storage_path text,p_mime_type text,p_file_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; begin
 if not private.can_edit_briefing(p_briefing_id) then raise exception 'Draft briefing access required' using errcode='42501'; end if;
 if split_part(p_storage_path,'/',1)<>p_briefing_id::text or not exists(select 1 from storage.objects where bucket_id='briefing-files' and name=p_storage_path and owner_id=auth.uid()::text) then raise exception 'Upload an attachment for this briefing first'; end if;
 insert into public.briefing_attachments(briefing_id,name,storage_path,mime_type,file_size) values(p_briefing_id,p_name,p_storage_path,p_mime_type,p_file_size) returning id into result_id;
 return result_id;
end $$;
create function public.remove_briefing_attachment(p_attachment_id uuid) returns text language plpgsql security definer set search_path='' as $$
 declare attachment public.briefing_attachments; begin
 select * into attachment from public.briefing_attachments where id=p_attachment_id;
 if not found or not private.can_edit_briefing(attachment.briefing_id) then raise exception 'Draft briefing access required' using errcode='42501'; end if;
 delete from public.briefing_attachments where id=attachment.id;
 return attachment.storage_path;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('briefing-files','briefing-files',false,52428800,array['image/png','image/jpeg','image/webp','application/pdf']);
create policy briefing_storage_read on storage.objects for select to authenticated using(bucket_id='briefing-files' and private.can_access_briefing(private.storage_scope(name)));
create policy briefing_storage_insert on storage.objects for insert to authenticated with check(bucket_id='briefing-files' and private.can_edit_briefing(private.storage_scope(name)) and private.opaque_storage_path(name));
create policy briefing_storage_delete on storage.objects for delete to authenticated using(bucket_id='briefing-files' and private.can_edit_briefing(private.storage_scope(name)) and not exists(select 1 from public.briefing_attachments where storage_path=name));
revoke execute on function private.can_access_briefing(uuid),private.can_edit_briefing(uuid) from public,anon;
grant execute on function private.can_access_briefing(uuid),private.can_edit_briefing(uuid) to authenticated;
revoke execute on function public.request_credits(uuid,integer,text),public.fulfill_credit_request(uuid,text),public.reject_credit_request(uuid,text),public.add_briefing_attachment(uuid,text,text,text,bigint),public.remove_briefing_attachment(uuid) from public,anon;
grant execute on function public.request_credits(uuid,integer,text),public.fulfill_credit_request(uuid,text),public.reject_credit_request(uuid,text),public.add_briefing_attachment(uuid,text,text,text,bigint),public.remove_briefing_attachment(uuid) to authenticated;
