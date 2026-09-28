begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create temporary table approval_fixture(key text primary key,value uuid);
grant select on approval_fixture to authenticated;
insert into approval_fixture select name,md5('round-approval:'||name)::uuid
from unnest(array['agency','client','designer','client-org','project','board',
 'release','submit','approve','share','resubmit','handoff']) name;
create function pg_temp.k(p_key text) returns uuid language sql as $$
 select value from approval_fixture where key=p_key
$$;
create function pg_temp.actor(p_key text) returns text language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.k(p_key)::text,true)
$$;
create function pg_temp.instructions(p_title text) returns jsonb language sql as $$
 select jsonb_build_object('title',p_title,'serviceId','social','overview','Explore directions',
 'goals','Develop concepts','direction',jsonb_build_object('notes','Private studio direction'),
 'deliverables',jsonb_build_array(jsonb_build_object('name','Concept','format','feed',
 'quantity',1,'scope','original','width',1080,'height',1350)),
 'dueDate','2026-10-01','references',jsonb_build_array())
$$;
create function pg_temp.request() returns board_work_requests language sql as $$
 select * from board_work_requests where board_id=pg_temp.k('board') and current
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.k(name),'approval-'||name||'@fixture.local',jsonb_build_object('display_name',name)
from unnest(array['agency','client','designer']) name;
update profiles set role='agency' where id=pg_temp.k('agency');
update profiles set role='designer' where id=pg_temp.k('designer');
insert into clients(id,name,slug) values(pg_temp.k('client-org'),'Approval fixture','approval-fixture');
insert into client_memberships(client_id,user_id,notify_all)
values(pg_temp.k('client-org'),pg_temp.k('client'),true);
insert into projects(id,client_id,title,service_type,status,due_date)
values(pg_temp.k('project'),pg_temp.k('client-org'),'Approval project','social','in_progress','2026-10-10');
insert into project_assignments(project_id,designer_id) values(pg_temp.k('project'),pg_temp.k('designer'));
insert into design_boards(id,project_id,name,designer_id,board_id,created_by)
values(pg_temp.k('board'),pg_temp.k('project'),'Direction A',pg_temp.k('designer'),
'uXjVApprovalA=',pg_temp.k('agency'));

-- Studio sends to the designer; the designer sends R1 to the studio.
select pg_temp.actor('agency'); set local role authenticated;
select save_production_brief(pg_temp.k('board'),pg_temp.instructions('A'),0,true,pg_temp.k('release'),1,1);
reset role;
select pg_temp.actor('designer'); set local role authenticated;
select set_config('approval.r1',send_board_round_for_request(pg_temp.k('board'),
 (pg_temp.request()).id,2,'First pass',null,pg_temp.k('submit'))::text,true);
select throws_ok($$select approve_board_round(pg_temp.k('board'),current_setting('approval.r1')::uuid,3,
 md5('approval:designer')::uuid)$$,'42501',null,'A designer cannot approve a round');
reset role;

select pg_temp.actor('agency'); set local role authenticated;
select is((get_project_workflow(pg_temp.k('project'))->'boards'->0->'capabilities'->>'approve')::boolean,
 true,'A submitted round offers Approve round');
select is((get_project_workflow(pg_temp.k('project'))->'boards'->0->'capabilities'->>'share')::boolean,
 false,'A submitted round is not yet offered for sharing');
select ok(exists(select 1 from action_notifications where kind='review_round'
 and entity_id=current_setting('approval.r1')::uuid),'The studio is asked to review R1');
select throws_ok($$select approve_board_round(pg_temp.k('board'),current_setting('approval.r1')::uuid,1,
 md5('approval:stale')::uuid)$$,'PT409',null,'A stale board revision cannot approve');
select is(approve_board_round(pg_temp.k('board'),current_setting('approval.r1')::uuid,3,
 pg_temp.k('approve'))->>'outcome','approved','The studio approves R1');
select is((pg_temp.request()).outcome,'approved','The current request records the approval');
select is(approve_board_round(pg_temp.k('board'),current_setting('approval.r1')::uuid,3,
 pg_temp.k('approve'))->>'outcome','approved','Retrying the same approval replays its result');
select throws_ok($$select approve_board_round(pg_temp.k('board'),current_setting('approval.r1')::uuid,4,
 md5('approval:twice')::uuid)$$,'PT409',null,'An approved round cannot be approved again');
select is((select status::text from projects where id=pg_temp.k('project')),'in_progress',
 'Studio approval never changes the public phase');
select is((get_project_workflow(pg_temp.k('project'))->'boards'->0->'capabilities'->>'share')::boolean,
 true,'An approved round is offered for sharing');
select is((get_project_workflow(pg_temp.k('project'))->'boards'->0->'capabilities'->>'requestChanges')::boolean,
 true,'The studio can still request changes after approving');
select ok(not exists(select 1 from action_notifications where kind='review_round'
 and entity_id=current_setting('approval.r1')::uuid),'Approval clears the review action');
select ok(exists(select 1 from action_notifications where kind='share_round'
 and entity_id=current_setting('approval.r1')::uuid),'An approved round asks the studio to share it');
reset role;

select pg_temp.actor('designer'); set local role authenticated;
select is((get_project_workflow(pg_temp.k('project'))->'boards'->0->'currentRequest'->>'outcome'),
 'approved','The designer sees the studio approved the round');
select ok(exists(select 1 from notifications where title='Round approved by the studio'
 and user_id=pg_temp.k('designer')),'The designer is told about the approval');
reset role;

select pg_temp.actor('client'); set local role authenticated;
select is((select count(*)::integer from action_notifications where kind='share_round'),0,
 'A client never receives the internal share action');
reset role;

-- The studio shares the approved round; the client requests changes.
select pg_temp.actor('agency'); set local role authenticated;
select set_config('approval.v1',share_workflow_version(pg_temp.k('project'),
 'https://miro.com/app/board/uXjVApprovalClient=/','First look',
 array[current_setting('approval.r1')::uuid],null,null,false,pg_temp.k('share'))::text,true);
select is((pg_temp.request()).outcome,'shared','Sharing an approved round marks it shared');
select ok(not exists(select 1 from action_notifications where kind='share_round'),
 'Sharing clears the share action');
reset role;
select pg_temp.actor('client'); set local role authenticated;
select review_publication(current_setting('approval.v1')::uuid,'changes_requested','Refine it');
reset role;

-- From Working files the studio sends the board back to its designer.
select pg_temp.actor('agency'); set local role authenticated;
select ok(exists(select 1 from action_notifications where kind='respond_feedback'
 and project_id=pg_temp.k('project')),'Client feedback asks the studio to respond');
select is((handoff_board_work(pg_temp.k('project'),current_setting('approval.v1')::uuid,2,
 jsonb_build_array(jsonb_build_object('boardId',pg_temp.k('board'),'action','continue',
 'content',pg_temp.instructions('Revision A'),
 'expectedBoardRevision',(select workflow_revision from design_boards where id=pg_temp.k('board')),
 'expectedAssignmentGeneration',1,'expectedBriefRevision',1)),
 pg_temp.k('handoff'))->>'continued')::integer,1,'The studio sends the board back to its designer');
select is((pg_temp.request()).outcome,'open','The designer has new work');
select is((pg_temp.request()).kind,'revision','The new work is a revision');
reset role;

select * from finish();
rollback;
