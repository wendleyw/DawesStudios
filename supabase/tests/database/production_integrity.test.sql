begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$select public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Retry regression',null,md5('retry-attempt-1')::uuid)$$,'Agency can share with an explicit submit-attempt key');
select is(public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Retry regression',null,md5('retry-attempt-1')::uuid),public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Retry regression',null,md5('retry-attempt-1')::uuid),'Same submission key returns the original client version');
select throws_ok($$select public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Different intent',null,md5('retry-attempt-1')::uuid)$$,'23505','Idempotency key conflicts with a different version','A submission key cannot be reused for a different release note');
select lives_ok($$select public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Fresh revision',null,md5('retry-attempt-2')::uuid)$$,'A fresh key permits a new client version');
select isnt(public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Retry regression',null,md5('retry-attempt-1')::uuid),public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Fresh revision',null,md5('retry-attempt-2')::uuid),'Separate submission attempts create separate immutable client versions');
select set_config('test.first_publication',public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Retry regression',null,md5('retry-attempt-1')::uuid)::text,true);
select set_config('test.latest_publication',public.share_miro_version(md5('dawes:project-sabre-campaign-landing-page')::uuid,'https://miro.com/app/board/uXjVRetry01=/','Fresh revision',null,md5('retry-attempt-2')::uuid)::text,true);
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:client-8')::uuid::text,true);
set local role authenticated;
select throws_ok($$select public.review_publication(current_setting('test.first_publication')::uuid,'changes_requested','Stale request')$$,'P0001','Review the latest published version','Historical client review cannot change current project state');
select lives_ok($$select public.review_publication(current_setting('test.latest_publication')::uuid,'approved','Approved direction')$$,'Client can approve the latest pending snapshot');
select lives_ok($$select public.review_publication(current_setting('test.latest_publication')::uuid,'approved','Approved direction')$$,'Retrying the same decision succeeds without a second event');
select throws_ok($$select public.review_publication(current_setting('test.latest_publication')::uuid,'changes_requested','Reverse the decision')$$,'P0001','This publication already has a review decision','A finalized review cannot be silently reversed');
reset role;
select is((select count(*)::int from private.audit_events where event='publication.reviewed' and entity_id=current_setting('test.latest_publication')::uuid),1,'Repeated review writes one audit event');
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select set_config('test.old_project_updated_at',(select updated_at::text from public.projects where id=md5('dawes:project-2')::uuid),true);
update public.projects set description='Concurrency-safe project update' where id=md5('dawes:project-2')::uuid;
select isnt((select updated_at::text from public.projects where id=md5('dawes:project-2')::uuid),current_setting('test.old_project_updated_at'),'Project edits refresh the optimistic concurrency token');
with changed as (update public.projects set description='Stale edit' where id=md5('dawes:project-2')::uuid and updated_at=current_setting('test.old_project_updated_at')::timestamptz returning id) select is((select count(*)::int from changed),0,'A stale project update cannot overwrite a newer change');
select throws_ok($$update public.projects set title='   ' where id=md5('dawes:project-2')::uuid$$,'23514',null,'Blank project titles are rejected');
select throws_ok($$update public.projects set due_date='2020-01-01' where id=md5('dawes:project-2')::uuid$$,'23514',null,'Project due dates cannot precede start dates');
select set_config('test.assignment_notifications',(select count(*)::text from public.notifications where project_id=md5('dawes:project-4')::uuid and user_id=md5('dawes:designer-1')::uuid),true);
select public.assign_designer(md5('dawes:project-4')::uuid,md5('dawes:designer-1')::uuid);
select is((select count(*)::text from public.notifications where project_id=md5('dawes:project-4')::uuid and user_id=md5('dawes:designer-1')::uuid),current_setting('test.assignment_notifications'),'Repeating an assignment does not notify twice');
select public.revoke_design_assignment(md5('dawes:project-4')::uuid,md5('dawes:designer-1')::uuid);
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.projects where id=md5('dawes:project-4')::uuid),0,'Revoking an assignment immediately removes project access');
select is((select count(*)::int from public.design_boards where project_id=md5('dawes:project-4')::uuid),0,'Revoking an assignment removes board access');
select is((select count(*)::int from public.briefings),0,'Designers cannot query raw financial briefing rows');
select ok(exists(select 1 from public.get_assigned_briefings()),'Designers retain a safe briefing projection for remaining assigned work');
select ok(not exists(select 1 from public.get_assigned_briefings() b where to_jsonb(b) ? 'confirmed_credits' or to_jsonb(b) ? 'estimated_credits' or to_jsonb(b) ? 'created_by'),'Designer briefing projection contains no budget or author fields');
-- Harbor & Pine keeps project 3 (shared with designer-2) after project 4 is revoked.
select is(array(select id from public.get_assigned_briefings(md5('dawes:client-org-2')::uuid)),array[md5('dawes:briefing-3')::uuid],'Safe briefing projection respects assignment revocation');
reset role;
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$select public.mark_project_delivered(md5('dawes:project-7')::uuid)$$,'Delivered project transition accepts retries');
select throws_ok($$select public.add_delivery_file(md5('dawes:project-2')::uuid,'Invalid.png',md5('dawes:project-2')::uuid::text||'/'||md5('delivery-test')::uuid::text||'.png','image/png',100)$$,'P0001','Approve all deliverables before adding final files','Final delivery files require project approval');
select throws_ok($$select public.update_workspace_settings('Studio','Not/A_Timezone')$$,'P0001','Choose a valid IANA timezone','Workspace settings reject invalid timezones');
select ok((select min_credits is null and max_credits is null and due_days is null from public.service_presets where service_type='other'),'Unscoped work retains an estimate-required preset');
reset role;
insert into private.audit_events(actor_id,event) select md5('dawes:agency')::uuid,'invitation.created' from generate_series(1,20);
set local role authenticated;
select throws_ok($$select public.create_invitation('rate-limited@fixture.local','designer')$$,'P0001','Invitation rate limit reached. Try again in an hour.','Invitation limits are enforced at the database boundary');
select throws_ok($$update public.projects set board_position='null' where id=md5('dawes:project-2')::uuid$$,'23514',null,'Canvas positions cannot be JSON null');
select throws_ok($$update public.projects set board_position='{"x":"12","y":0}' where id=md5('dawes:project-2')::uuid$$,'23514',null,'Canvas coordinates must be numeric');
select throws_ok($$update public.projects set board_position='{"x":1000001,"y":0}' where id=md5('dawes:project-2')::uuid$$,'23514',null,'Canvas coordinates are bounded');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname='supabase_realtime'),'Realtime excludes deleted private row identifiers');
reset role;
insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,created_at)
values('delivery-files',md5('dawes:project-2')::uuid::text||'/'||md5('stale-cleanup-test')::uuid::text||'.pdf',md5('dawes:project-2')::uuid,repeat('a',64),'application/pdf',100,md5('dawes:agency')::uuid,now()-interval '25 hours');
-- Retired Versions cleanup, Task 2: the only test for this exclusion lived in the deleted
-- video_provenance_attestation.test.sql. `internal-assets` attestations have no TTL -- the
-- object's lifecycle is Storage's, not this table's, for that bucket -- so this row satisfies
-- every OTHER staleness condition (discard_requested, older than the 24-hour floor) to prove the
-- exclusion itself, not merely that a non-stale-looking row is absent.
insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,created_at,discard_requested)
values('internal-assets',md5('dawes:project-2')::uuid::text||'/'||md5('stale-internal-test')::uuid::text||'.png',md5('dawes:project-2')::uuid,repeat('b',64),'image/png',100,md5('dawes:agency')::uuid,now()-interval '48 hours',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select ok(exists(select 1 from public.list_stale_sanitized_assets() s where s.storage_path=md5('dawes:project-2')::uuid::text||'/'||md5('stale-cleanup-test')::uuid::text||'.pdf'),'Trusted cleanup can enumerate abandoned unreferenced assets');
select ok(not exists(select 1 from public.list_stale_sanitized_assets() s join public.delivery_files f on f.storage_path=s.storage_path),'Cleanup never selects a registered final delivery');
select ok(not exists(select 1 from public.list_stale_sanitized_assets() s where s.bucket_id='internal-assets' and s.storage_path=md5('dawes:project-2')::uuid::text||'/'||md5('stale-internal-test')::uuid::text||'.png'),'internal-assets attestations are excluded from the stale sweep even when discard_requested and old enough to otherwise qualify');
select * from finish();
rollback;
