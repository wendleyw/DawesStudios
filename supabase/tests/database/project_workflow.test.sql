begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create temporary table workflow_fixture(key text primary key,value uuid);
grant select on workflow_fixture to authenticated;
insert into workflow_fixture select name,md5('project-workflow:'||name)::uuid
from unnest(array['agency','client','designer-a','designer-b','client-org','project','board-a','board-b',
 'release-a','release-b','submit-a','share-v1','handoff','pause','resume','close','reactivate']) name;
create function pg_temp.wf(p_key text) returns uuid language sql as $$
 select value from workflow_fixture where key=p_key
$$;
create function pg_temp.actor(p_key text) returns text language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.wf(p_key)::text,true)
$$;
create function pg_temp.instructions(p_title text) returns jsonb language sql as $$
 select jsonb_build_object('title',p_title,'serviceId','social','overview','Explore directions',
 'goals','Develop concepts','direction',jsonb_build_object('notes','Private studio direction'),
 'deliverables',jsonb_build_array(jsonb_build_object('name','Concept','format','feed',
 'quantity',1,'scope','original','width',1080,'height',1350)),
 'dueDate','2026-10-01','references',jsonb_build_array())
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.wf(name),'workflow-'||name||'@fixture.local',jsonb_build_object('display_name',name)
from unnest(array['agency','client','designer-a','designer-b']) name;
update profiles set role='agency' where id=pg_temp.wf('agency');
update profiles set role='designer' where id in(pg_temp.wf('designer-a'),pg_temp.wf('designer-b'));
insert into clients(id,name,slug) values(pg_temp.wf('client-org'),'Workflow fixture','workflow-fixture');
insert into client_memberships(client_id,user_id,notify_all)
values(pg_temp.wf('client-org'),pg_temp.wf('client'),true);
insert into projects(id,client_id,title,service_type,status,due_date)
values(pg_temp.wf('project'),pg_temp.wf('client-org'),'Workflow project','social','in_progress','2026-10-10');
insert into project_assignments(project_id,designer_id)
values(pg_temp.wf('project'),pg_temp.wf('designer-a')),
(pg_temp.wf('project'),pg_temp.wf('designer-b'));
insert into design_boards(id,project_id,name,designer_id,board_id,created_by)
values(pg_temp.wf('board-a'),pg_temp.wf('project'),'Direction A',pg_temp.wf('designer-a'),
'uXjVWorkflowA=',pg_temp.wf('agency')),
(pg_temp.wf('board-b'),pg_temp.wf('project'),'Direction B',pg_temp.wf('designer-b'),
'uXjVWorkflowB=',pg_temp.wf('agency'));

select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc like '%40001%'),
 'No public RPC raises a custom serialization failure');
select ok(not has_function_privilege('authenticated',
 'public.send_board_round(uuid,text,text,uuid)','EXECUTE'),
 'Legacy round submission cannot bypass current request guards');
select ok(not has_function_privilege('authenticated',
 'public.share_miro_version(uuid,text,text,uuid,uuid)','EXECUTE'),
 'Legacy sharing cannot bypass latest-version guards');
select pg_temp.actor('agency'); set local role authenticated;
select is(save_production_brief(pg_temp.wf('board-a'),pg_temp.instructions('A'),0,true,
 pg_temp.wf('release-a'),1,1),1,'Agency releases first work request');
select is((select outcome from board_work_requests where board_id=pg_temp.wf('board-a') and current),
 'open','Released instructions create an open request');
select is((get_project_workflow(pg_temp.wf('project'))->'boards'->0->>'briefRevision')::integer,
 1,'Agency projection includes current draft revision');
select is((get_project_workflow(pg_temp.wf('project'))->'project'->>'status'),
 'in_progress','Releasing instructions preserves public phase');
select throws_ok($$select save_production_brief(pg_temp.wf('board-a'),pg_temp.instructions('Changed'),1,true,
 md5('workflow:stale-release')::uuid,1,1)$$,'PT409',null,'A stale board revision cannot release');
reset role;

select pg_temp.actor('designer-a'); set local role authenticated;
select ok((get_project_workflow(pg_temp.wf('project'))->'project'->>'latestPublication') is null,
 'Designer projection contains no client publication');
select is((get_project_workflow(pg_temp.wf('project'))->'boards'->0->'currentRequest'->'content'->>'title'),
 'A','Assigned designer receives released instructions');
select is(jsonb_array_length(get_project_workflow(pg_temp.wf('project'))->'boards'),1,
 'Assigned designer receives only their board');
select throws_ok($$select send_board_round_for_request(pg_temp.wf('board-b'),gen_random_uuid(),1,'x',null,
 md5('workflow:other-submit')::uuid)$$,'42501',null,'Designer cannot submit another board');
select set_config('workflow.round_a',send_board_round_for_request(pg_temp.wf('board-a'),
 (select id from board_work_requests where board_id=pg_temp.wf('board-a') and current),2,
 'First pass',null,pg_temp.wf('submit-a'))::text,true);
select is((select status::text from projects where id=pg_temp.wf('project')),
 'in_progress','Internal submission never exposes Studio review as a public phase');
select throws_ok($$select send_board_round_for_request(pg_temp.wf('board-a'),
 (select id from board_work_requests where board_id=pg_temp.wf('board-a') and current),3,
 'Duplicate',null,md5('workflow:duplicate-submit')::uuid)$$,'PT409',null,
 'A submitted request cannot be sent twice');
reset role;

select pg_temp.actor('agency'); set local role authenticated;
select set_config('workflow.v1',share_workflow_version(pg_temp.wf('project'),
 'https://miro.com/app/board/uXjVClientWorkflow=/', 'First look',
 array[current_setting('workflow.round_a')::uuid],null,null,false,pg_temp.wf('share-v1'))::text,true);
select is((select status::text from projects where id=pg_temp.wf('project')),
 'client_review','Publication moves the public phase to client review');
select is((select outcome from board_work_requests where board_id=pg_temp.wf('board-a') and current),
 'shared','Only the included request becomes shared');
select throws_ok($$select share_workflow_version(pg_temp.wf('project'),
 'https://miro.com/app/board/uXjVClientWorkflow=/', 'Unexpected replacement',
 '{}'::uuid[],current_setting('workflow.v1')::uuid,1,false,
 md5('workflow:replacement')::uuid)$$,'22023',null,
 'Replacing a pending client version needs confirmation');
reset role;

select pg_temp.actor('client'); set local role authenticated;
select is(jsonb_array_length(get_project_workflow(pg_temp.wf('project'))->'boards'),0,
 'Client projection contains no internal boards');
select is((select count(*)::integer from board_work_requests),0,
 'Client direct reads contain no internal requests');
select review_publication(current_setting('workflow.v1')::uuid,'changes_requested','Please refine the concept');
select is((select status::text from projects where id=pg_temp.wf('project')),
 'changes_requested','Client feedback updates only the public phase');
reset role;

select pg_temp.actor('agency'); set local role authenticated;
select throws_ok($$select handoff_board_work(pg_temp.wf('project'),current_setting('workflow.v1')::uuid,2,
 jsonb_build_array(jsonb_build_object('boardId',pg_temp.wf('board-b'),'action','close',
 'expectedBoardRevision',1,'expectedAssignmentGeneration',1)),
 md5('workflow:close-only')::uuid)$$,'22023',null,
 'A close-only feedback handoff cannot clear the obligation');
select is((handoff_board_work(pg_temp.wf('project'),current_setting('workflow.v1')::uuid,2,
 jsonb_build_array(
 jsonb_build_object('boardId',pg_temp.wf('board-a'),'action','continue',
 'content',pg_temp.instructions('Revision A'),'expectedBoardRevision',4,
 'expectedAssignmentGeneration',1,'expectedBriefRevision',1),
 jsonb_build_object('boardId',pg_temp.wf('board-b'),'action','close',
 'expectedBoardRevision',1,'expectedAssignmentGeneration',1)),
 pg_temp.wf('handoff'))->>'continued')::integer,1,
 'One continuing board and one explicit closure commit together');
select is((select activity from design_boards where id=pg_temp.wf('board-b')),
 'closed','Selected board closes');
select is((select status::text from projects where id=pg_temp.wf('project')),
 'in_progress','Recorded feedback handoff returns public phase to in progress');
select is((select count(*)::integer from action_notifications where kind='respond_feedback'
 and project_id=pg_temp.wf('project')),0,'Receipt removes the feedback obligation');
select is(private.has_feedback_handoff(current_setting('workflow.v1')::uuid),true,
 'Agency can derive that current feedback has a receipt');
select throws_ok($$select handoff_board_work(pg_temp.wf('project'),current_setting('workflow.v1')::uuid,2,
 '[]'::jsonb,md5('workflow:stale-handoff')::uuid)$$,'22023',null,
 'Empty handoff is rejected');
reset role;

select pg_temp.actor('client'); set local role authenticated;
select is(private.has_feedback_handoff(current_setting('workflow.v1')::uuid),false,
 'Client cannot infer private handoff receipts from the helper');
reset role;
select pg_temp.actor('designer-b'); set local role authenticated;
select is((get_project_workflow(pg_temp.wf('project'))->'boards'->0->>'activity'),
 'closed','Closed direction remains visible to its designer');
select is((get_project_workflow(pg_temp.wf('project'))->'boards'->0->'capabilities'->>'submit'),
 'false','Closed direction cannot submit');
reset role;

select pg_temp.actor('agency'); set local role authenticated;
select set_config('workflow.pause_result',save_project_details_with_activity(pg_temp.wf('project'),
 'Workflow project','', '2026-10-10'::date,current_date,'backlog',
 (select updated_at from projects where id=pg_temp.wf('project')),
 (select workflow_revision from projects where id=pg_temp.wf('project')),
 pg_temp.wf('pause'))::text,true);
select is((select count(*)::integer from action_notifications where project_id=pg_temp.wf('project')),
 0,'Backlog suppresses current project obligations');
select throws_ok($$select close_board_work(pg_temp.wf('board-a'),5,pg_temp.wf('close'))$$,
 '22023',null,'Backlog blocks workflow advancement');
reset role;

select pg_temp.actor('client'); set local role authenticated;
select throws_ok($$select review_publication(current_setting('workflow.v1')::uuid,'approved','')$$,
 '22023',null,'Backlog blocks client decisions');
reset role;


select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select save_project_details_with_activity(pg_temp.wf('project'),
 'Workflow project','', '2026-10-10'::date,current_date,'active',
 (select updated_at from projects where id=pg_temp.wf('project')),
 (select workflow_revision from projects where id=pg_temp.wf('project')),
 pg_temp.wf('resume'))$$,'Agency resumes the existing obligations');
select lives_ok($$select update_design_board(pg_temp.wf('board-a'),'Direction A',
 'https://miro.com/app/board/uXjVWorkflowA=/',pg_temp.wf('designer-b'),null)$$,
 'Reassignment closes the outgoing generation');
select is((select assignment_generation from design_boards where id=pg_temp.wf('board-a')),
 2,'Board assignment generation increments');
select is((select count(*)::integer from board_work_requests
 where board_id=pg_temp.wf('board-a') and current),0,
 'Reassignment leaves no inherited request');
select is((select count(*)::integer from production_briefs where board_id=pg_temp.wf('board-a')),
 0,'Old release is removed from the current brief surface');
reset role;
select pg_temp.actor('designer-a'); set local role authenticated;
select is(jsonb_array_length(get_project_workflow(pg_temp.wf('project'))->'boards'),0,
 'Outgoing designer loses the reassigned board');
select is((select count(*)::integer from design_versions where id=current_setting('workflow.round_a')::uuid),
 0,'Outgoing designer cannot read old round history after reassignment');
reset role;
select pg_temp.actor('designer-b'); set local role authenticated;
select is((select x->'currentRequest' from jsonb_array_elements(
 get_project_workflow(pg_temp.wf('project'))->'boards') x
 where x->>'id'=pg_temp.wf('board-a')::text)::text,
 'null','New assignee waits for fresh release');
reset role;
select pg_temp.actor('agency'); set local role authenticated;
select is(save_production_brief(pg_temp.wf('board-a'),pg_temp.instructions('Fresh assignment'),0,true,
 md5('workflow:fresh-assignment')::uuid,6,2),1,'Agency explicitly releases new generation');
reset role;
select pg_temp.actor('designer-b'); set local role authenticated;
select is((select content->>'title' from board_work_requests where board_id=pg_temp.wf('board-a')
 and current),'Fresh assignment','New assignee receives only fresh instructions');
select is((select count(*)::integer from design_versions where id=current_setting('workflow.round_a')::uuid),
 0,'New assignee cannot read prior generation rounds');
reset role;


select pg_temp.actor('agency'); set local role authenticated;
select throws_ok($$select handoff_board_work(pg_temp.wf('project'),null,null,
 jsonb_build_array(
 jsonb_build_object('boardId',pg_temp.wf('board-a'),'action','continue',
 'content',pg_temp.instructions('Valid'),'expectedBoardRevision',7,
 'expectedAssignmentGeneration',2,'expectedBriefRevision',1),
 jsonb_build_object('boardId',pg_temp.wf('board-b'),'expectedBoardRevision',2,
 'expectedAssignmentGeneration',1)),md5('workflow:null-action')::uuid)$$,
 '22023',null,'One valid continuation cannot hide a null action in the same batch');
reset role;
insert into projects(id,client_id,title,service_type,status)
 values(md5('workflow:delivery-project')::uuid,pg_temp.wf('client-org'),
 'Delivery guard fixture','social','approved');
insert into delivery_files(project_id,name,storage_path,mime_type,file_size)
 values(md5('workflow:delivery-project')::uuid,'Final.pdf',
 (md5('workflow:delivery-project')::uuid)::text||'/final.pdf','application/pdf',10);
select pg_temp.actor('agency'); set local role authenticated;
select throws_ok($$select mark_project_delivered(md5('workflow:delivery-project')::uuid)$$,
 '22023',null,'A manually approved project without latest client approval cannot deliver');
reset role;
insert into published_versions(id,project_id,version_number)
 values(md5('workflow:delivery-v1')::uuid,md5('workflow:delivery-project')::uuid,1);
insert into publication_reviews(publication_id,project_id,status)
 values(md5('workflow:delivery-v1')::uuid,md5('workflow:delivery-project')::uuid,'approved');
select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select mark_project_delivered(md5('workflow:delivery-project')::uuid)$$,
 'Latest approved V with final file can be delivered');
select ok((select delivered_at is not null from projects
 where id=md5('workflow:delivery-project')::uuid),
 'Delivery stamps delivered_at');
select set_config('workflow.first_delivery_at',(select delivered_at::text from projects
 where id=md5('workflow:delivery-project')::uuid),true);
select lives_ok($$select mark_project_delivered(md5('workflow:delivery-project')::uuid)$$,
 'Delivery retry returns without a second transition');
select is((select delivered_at::text from projects
 where id=md5('workflow:delivery-project')::uuid),current_setting('workflow.first_delivery_at'),
 'Delivery retry preserves the original delivered_at');
reset role;
select is((select count(*)::integer from notifications
 where project_id=md5('workflow:delivery-project')::uuid and title='Your project has been delivered'),
 1,'Delivery retry emits only one event');

delete from project_assignments where project_id=pg_temp.wf('project')
 and designer_id=pg_temp.wf('designer-b');
select pg_temp.actor('agency'); set local role authenticated;
select is((select x->'capabilities'->>'release' from jsonb_array_elements(
 get_project_workflow(pg_temp.wf('project'))->'boards') x
 where x->>'id'=pg_temp.wf('board-a')::text),'false',
 'Projection does not offer release without an active project assignment');
reset role;

select * from finish();
rollback;
