-- The instant a project was delivered, for the client and designer dashboards. `updated_at` cannot
-- date a delivery: any later edit rewrites it, including a board move (`board_position`).
alter table public.projects add column delivered_at timestamptz;

-- Projects delivered before this column existed take their last update, the best record left.
-- The trigger stays off for the backfill alone, so it does not restamp updated_at to the deploy time.
alter table public.projects disable trigger project_updated_at;
update public.projects set delivered_at = updated_at where status = 'delivered' and delivered_at is null;
alter table public.projects enable trigger project_updated_at;

-- Unchanged from 202609200014_delivery_integrity.sql apart from stamping `delivered_at`.
create or replace function public.mark_project_delivered(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare p public.projects; begin
 perform private.assert_agency(); select * into p from public.projects where id=p_project_id for update;
 if found and p.status='delivered' then return; end if;
 if not found or p.status<>'approved' then raise exception 'Approve all deliverables before delivery'; end if;
 if not exists(select 1 from public.delivery_files where project_id=p.id) then raise exception 'Add a delivery file before marking delivered'; end if;
 update public.projects set status='delivered',delivered_at=now(),updated_at=now() where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;
