begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Own all mutable fixtures so this suite also runs on the reduced SABRE dataset.
insert into auth.users(id,email,raw_user_meta_data)
select md5('production-integrity:'||name)::uuid,'production-integrity-'||name||'@fixture.local',
 jsonb_build_object('display_name',name)
from unnest(array['agency','client-8','designer-1']) name;
update profiles set role='agency' where id=md5('production-integrity:agency')::uuid;
update profiles set role='designer' where id=md5('production-integrity:designer-1')::uuid;
insert into clients(id,name,slug)
values(md5('production-integrity:client-org-2')::uuid,'Production integrity','production-integrity');
insert into client_memberships(client_id,user_id,notify_all)
values(md5('production-integrity:client-org-2')::uuid,md5('production-integrity:client-8')::uuid,true);
insert into projects(id,client_id,title,service_type,status,due_date,updated_at)
select md5('production-integrity:'||name)::uuid,md5('production-integrity:client-org-2')::uuid,
 'Integrity '||name,'social',case when name='project-7' then 'delivered'::project_status
 else 'in_progress'::project_status end,'2026-10-10',now()-interval '1 day'
from unnest(array['project-2','project-4','project-7','project-sabre-campaign-landing-page']) name;
insert into project_assignments(project_id,designer_id)
values(md5('production-integrity:project-4')::uuid,md5('production-integrity:designer-1')::uuid);
insert into design_boards(id,project_id,name,designer_id,board_id,created_by)
values(md5('production-integrity:board')::uuid,md5('production-integrity:project-4')::uuid,
 'Assigned direction',md5('production-integrity:designer-1')::uuid,'uXjVIntegrityBoard=',
 md5('production-integrity:agency')::uuid);
insert into published_versions(id,project_id,version_number)
values(md5('production-integrity:delivered-version')::uuid,md5('production-integrity:project-7')::uuid,1);
insert into publication_reviews(publication_id,project_id,status)
values(md5('production-integrity:delivered-version')::uuid,md5('production-integrity:project-7')::uuid,'approved');
insert into delivery_files(project_id,name,storage_path,mime_type,file_size)
values(md5('production-integrity:project-7')::uuid,'Final.pdf',
 md5('production-integrity:project-7')::uuid::text||'/final.pdf','application/pdf',10);

create temporary table pi_baseline as
select v.id as latest_id,r.review_revision from public.published_versions v
left join public.publication_reviews r on r.publication_id=v.id
where v.project_id=md5('production-integrity:project-sabre-campaign-landing-page')::uuid
order by v.version_number desc limit 1;
grant select on pi_baseline to authenticated;
select set_config('request.jwt.claim.sub',md5('production-integrity:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$select set_config('test.first_publication',public.share_workflow_version(
 md5('production-integrity:project-sabre-campaign-landing-page')::uuid,
 'https://miro.com/app/board/uXjVRetry01=/','Retry regression','{}'::uuid[],
 (select latest_id from pi_baseline),(select review_revision from pi_baseline),true,
 md5('retry-attempt-1')::uuid)::text,true)$$,
 'Agency can share with a guarded submit-attempt key');
select is(public.share_workflow_version(md5('production-integrity:project-sabre-campaign-landing-page')::uuid,
 'https://miro.com/app/board/uXjVRetry01=/','Retry regression','{}'::uuid[],
 (select latest_id from pi_baseline),(select review_revision from pi_baseline),true,
 md5('retry-attempt-1')::uuid),current_setting('test.first_publication')::uuid,
 'Same submission key returns the original client version');
select throws_ok($$select public.share_workflow_version(
 md5('production-integrity:project-sabre-campaign-landing-page')::uuid,
 'https://miro.com/app/board/uXjVRetry01=/','Different intent','{}'::uuid[],
 (select latest_id from pi_baseline),(select review_revision from pi_baseline),true,
 md5('retry-attempt-1')::uuid)$$,'23505','Request ID conflicts with a different action',
 'A submission key cannot be reused for a different release note');
select lives_ok($$select set_config('test.latest_publication',public.share_workflow_version(
 md5('production-integrity:project-sabre-campaign-landing-page')::uuid,
 'https://miro.com/app/board/uXjVRetry01=/','Fresh revision','{}'::uuid[],
 current_setting('test.first_publication')::uuid,1,true,
 md5('retry-attempt-2')::uuid)::text,true)$$,
 'A fresh key and expected latest V permit a new client version');
select isnt(current_setting('test.first_publication')::uuid,
 current_setting('test.latest_publication')::uuid,
 'Separate submission attempts create separate immutable client versions');
reset role;
select set_config('request.jwt.claim.sub',md5('production-integrity:client-8')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.review_publication(current_setting('test.first_publication')::uuid,
 'changes_requested','Stale request')$$,'PT409','Review the latest published version',
 'Historical client review cannot change current project state');
select lives_ok($$select public.review_publication(current_setting('test.latest_publication')::uuid,
 'approved','Approved direction')$$,'Client can approve the latest pending snapshot');
select lives_ok($$select public.review_publication(current_setting('test.latest_publication')::uuid,
 'approved','Approved direction')$$,'Retrying the same decision succeeds without a second event');
select throws_ok($$select public.review_publication(current_setting('test.latest_publication')::uuid,
 'changes_requested','Reverse the decision')$$,'22023','This publication already has a review decision',
 'A finalized review cannot be silently reversed');
reset role;
select is((select count(*)::int from private.audit_events where event='publication.reviewed'
 and entity_id=current_setting('test.latest_publication')::uuid),1,
 'Repeated review writes one audit event');
select set_config('request.jwt.claim.sub',md5('production-integrity:agency')::uuid::text,true);
set local role authenticated;
select set_config('test.old_project_updated_at',(select updated_at::text from public.projects where id=md5('production-integrity:project-2')::uuid),true);
select ok(not has_column_privilege('authenticated','public.projects','title','UPDATE')
 and not has_column_privilege('authenticated','public.projects','description','UPDATE')
 and not has_column_privilege('authenticated','public.projects','due_date','UPDATE')
 and not has_column_privilege('authenticated','public.projects','start_date','UPDATE'),
 'Metadata columns cannot bypass the expected revision RPC');
select ok(has_column_privilege('authenticated','public.projects','board_position','UPDATE'),
 'Canvas position keeps its separate direct write grant');
select lives_ok($$select public.save_project_details_with_activity(md5('production-integrity:project-2')::uuid,
 p.title,'Concurrency-safe project update',p.due_date,p.start_date,p.activity,
 current_setting('test.old_project_updated_at')::timestamptz,p.workflow_revision,
 md5('production-integrity:project-save')::uuid)
 from public.projects p where p.id=md5('production-integrity:project-2')::uuid$$,
 'Guarded project details save succeeds');
select isnt((select updated_at::text from public.projects where id=md5('production-integrity:project-2')::uuid),
 current_setting('test.old_project_updated_at'),'Project edits refresh the optimistic concurrency token');
select throws_ok($$select public.save_project_details_with_activity(md5('production-integrity:project-2')::uuid,
 p.title,'Stale edit',p.due_date,p.start_date,p.activity,
 current_setting('test.old_project_updated_at')::timestamptz,p.workflow_revision,
 md5('production-integrity:stale-save')::uuid)
 from public.projects p where p.id=md5('production-integrity:project-2')::uuid$$,
 'PT409',null,'A stale project editor cannot overwrite newer changes');
select throws_ok($$update public.projects set description='Bypass' where id=md5('production-integrity:project-2')::uuid$$,
 '42501',null,'Direct metadata updates are denied');
select throws_ok($$update public.projects set title='   ' where id=md5('production-integrity:project-2')::uuid$$,
 '42501',null,'Direct title edits cannot bypass the guarded command');
select throws_ok($$update public.projects set due_date='2020-01-01' where id=md5('production-integrity:project-2')::uuid$$,
 '42501',null,'Direct date edits cannot bypass the guarded command');
select set_config('test.assignment_notifications',(select count(*)::text from public.notifications where project_id=md5('production-integrity:project-4')::uuid and user_id=md5('production-integrity:designer-1')::uuid),true);
select public.assign_designer(md5('production-integrity:project-4')::uuid,md5('production-integrity:designer-1')::uuid);
select is((select count(*)::text from public.notifications where project_id=md5('production-integrity:project-4')::uuid and user_id=md5('production-integrity:designer-1')::uuid),current_setting('test.assignment_notifications'),'Repeating an assignment does not notify twice');
select public.revoke_design_assignment(md5('production-integrity:project-4')::uuid,md5('production-integrity:designer-1')::uuid);
reset role;
select set_config('request.jwt.claim.sub',md5('production-integrity:designer-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.projects where id=md5('production-integrity:project-4')::uuid),0,'Revoking an assignment immediately removes project access');
select is((select count(*)::int from public.design_boards where project_id=md5('production-integrity:project-4')::uuid),0,'Revoking an assignment removes board access');
select is((select count(*)::int from public.briefings),0,'Designers cannot query raw financial briefing rows');
select is((select count(*)::int from public.get_assigned_briefings()),0,'Designers cannot read the original client brief');
select ok(not exists(select 1 from public.get_assigned_briefings() b where to_jsonb(b) ? 'confirmed_credits' or to_jsonb(b) ? 'estimated_credits' or to_jsonb(b) ? 'created_by'),'Designer briefing projection contains no budget or author fields');
-- A revoked designer cannot recover original briefing data through the retired projection.
select is(array(select id from public.get_assigned_briefings(md5('production-integrity:client-org-2')::uuid)),array[]::uuid[],'Retired client briefing projection stays empty after revocation');
reset role;
select set_config('request.jwt.claim.sub',md5('production-integrity:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$select public.mark_project_delivered(md5('production-integrity:project-7')::uuid)$$,'Delivered project transition accepts retries');
select throws_ok($$select public.add_delivery_file(md5('production-integrity:project-2')::uuid,'Invalid.png',md5('production-integrity:project-2')::uuid::text||'/'||md5('delivery-test')::uuid::text||'.png','image/png',100)$$,'P0001','Approve all deliverables before adding final files','Final delivery files require project approval');
select throws_ok($$select public.update_workspace_settings('Studio','Not/A_Timezone')$$,'P0001','Choose a valid IANA timezone','Workspace settings reject invalid timezones');
select ok((select min_credits is null and max_credits is null and due_days is null from public.service_presets where service_type='other'),'Unscoped work retains an estimate-required preset');
reset role;
insert into private.audit_events(actor_id,event) select md5('production-integrity:agency')::uuid,'invitation.created' from generate_series(1,20);
set local role authenticated;
select throws_ok($$select public.create_invitation('rate-limited@fixture.local','designer')$$,'P0001','Invitation rate limit reached. Try again in an hour.','Invitation limits are enforced at the database boundary');
select throws_ok($$update public.projects set board_position='null' where id=md5('production-integrity:project-2')::uuid$$,'23514',null,'Canvas positions cannot be JSON null');
select throws_ok($$update public.projects set board_position='{"x":"12","y":0}' where id=md5('production-integrity:project-2')::uuid$$,'23514',null,'Canvas coordinates must be numeric');
select throws_ok($$update public.projects set board_position='{"x":1000001,"y":0}' where id=md5('production-integrity:project-2')::uuid$$,'23514',null,'Canvas coordinates are bounded');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname='supabase_realtime'),'Realtime excludes deleted private row identifiers');
reset role;
insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,created_at)
values('delivery-files',md5('production-integrity:project-2')::uuid::text||'/'||md5('stale-cleanup-test')::uuid::text||'.pdf',md5('production-integrity:project-2')::uuid,repeat('a',64),'application/pdf',100,md5('production-integrity:agency')::uuid,now()-interval '25 hours');
-- Retired Versions cleanup, Task 2: the only test for this exclusion lived in the deleted
-- video_provenance_attestation.test.sql. `internal-assets` attestations have no TTL -- the
-- object's lifecycle is Storage's, not this table's, for that bucket -- so this row satisfies
-- every OTHER staleness condition (discard_requested, older than the 24-hour floor) to prove the
-- exclusion itself, not merely that a non-stale-looking row is absent.
insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,created_at,discard_requested)
values('internal-assets',md5('production-integrity:project-2')::uuid::text||'/'||md5('stale-internal-test')::uuid::text||'.png',md5('production-integrity:project-2')::uuid,repeat('b',64),'image/png',100,md5('production-integrity:agency')::uuid,now()-interval '48 hours',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select ok(exists(select 1 from public.list_stale_sanitized_assets() s where s.storage_path=md5('production-integrity:project-2')::uuid::text||'/'||md5('stale-cleanup-test')::uuid::text||'.pdf'),'Trusted cleanup can enumerate abandoned unreferenced assets');
select ok(not exists(select 1 from public.list_stale_sanitized_assets() s join public.delivery_files f on f.storage_path=s.storage_path),'Cleanup never selects a registered final delivery');
select ok(not exists(select 1 from public.list_stale_sanitized_assets() s where s.bucket_id='internal-assets' and s.storage_path=md5('production-integrity:project-2')::uuid::text||'/'||md5('stale-internal-test')::uuid::text||'.png'),'internal-assets attestations are excluded from the stale sweep even when discard_requested and old enough to otherwise qualify');
select * from finish();
rollback;
