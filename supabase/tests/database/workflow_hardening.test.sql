begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create temporary table wh(key text primary key,value uuid);
grant select on wh to authenticated;
insert into wh select name,md5('workflow-hardening:'||name)::uuid
from unnest(array['agency','client','designer-a','designer-b','client-org','project',
 'work-board','history-board','work-release','history-release','history-round',
 'pause','resume','close','reactivate','fresh-release']) name;
create function pg_temp.k(p_key text) returns uuid language sql as $$
 select value from wh where key=p_key
$$;
create function pg_temp.actor(p_key text) returns text language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.k(p_key)::text,true)
$$;
create function pg_temp.brief(p_title text) returns jsonb language sql as $$
 select jsonb_build_object('title',p_title,'serviceId','social','overview','Internal work',
 'goals','Prepare concepts','direction',jsonb_build_object('notes','Studio only'),
 'deliverables',jsonb_build_array(jsonb_build_object('name','Concept','format','feed',
 'quantity',1,'scope','original','width',1080,'height',1350)),
 'dueDate','2026-10-01','references',jsonb_build_array())
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.k(name),'workflow-hardening-'||name||'@fixture.local',
 jsonb_build_object('display_name',name)
from unnest(array['agency','client','designer-a','designer-b']) name;
update profiles set role='agency' where id=pg_temp.k('agency');
update profiles set role='designer' where id in(pg_temp.k('designer-a'),pg_temp.k('designer-b'));
insert into clients(id,name,slug) values(pg_temp.k('client-org'),'Workflow hardening','workflow-hardening');
insert into client_memberships(client_id,user_id,notify_all)
values(pg_temp.k('client-org'),pg_temp.k('client'),true);
insert into projects(id,client_id,title,service_type,status,due_date)
values(pg_temp.k('project'),pg_temp.k('client-org'),'Hardening project','social','in_progress','2026-10-10');
insert into project_assignments(project_id,designer_id)
values(pg_temp.k('project'),pg_temp.k('designer-a')),
(pg_temp.k('project'),pg_temp.k('designer-b'));
insert into design_boards(id,project_id,name,designer_id,board_id,created_by)
values(pg_temp.k('work-board'),pg_temp.k('project'),'Current work',pg_temp.k('designer-a'),
 'uXjVHardWork=',pg_temp.k('agency')),
(pg_temp.k('history-board'),pg_temp.k('project'),'Round history',pg_temp.k('designer-a'),
 'uXjVHardHistory=',pg_temp.k('agency'));

select pg_temp.actor('agency'); set local role authenticated;
select is(save_production_brief(pg_temp.k('work-board'),pg_temp.brief('Current'),0,true,
 pg_temp.k('work-release'),1,1),1,'Agency releases active work');
select is(save_production_brief(pg_temp.k('history-board'),pg_temp.brief('History'),0,true,
 pg_temp.k('history-release'),1,1),1,'Agency releases history direction');
reset role;
select pg_temp.actor('designer-a'); set local role authenticated;
select set_config('wh.history_round',send_board_round_for_request(pg_temp.k('history-board'),
 (select id from board_work_requests where board_id=pg_temp.k('history-board') and current),
 2,'Historical round',null,pg_temp.k('history-round'))::text,true);
reset role;
select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select update_design_board(pg_temp.k('history-board'),'Round history',
 'https://miro.com/app/board/uXjVHardHistory=/',pg_temp.k('designer-b'),null)$$,
 'Board reassignment advances its generation');
select lives_ok($$select post_comment(pg_temp.k('project'),'internal','Historical note',
 current_setting('wh.history_round')::uuid,'wh:old-round-comment')$$,
 'Agency may comment on retained old round');
reset role;
select is((select count(*)::integer from notifications where user_id=pg_temp.k('designer-b')
 and project_id=pg_temp.k('project') and title='New studio message'),0,
 'New board owner gets no unreadable historical-round event');
select pg_temp.actor('designer-b'); set local role authenticated;
select is((select count(*)::integer from internal_comments
 where version_id=current_setting('wh.history_round')::uuid),0,
 'New owner cannot read comments on the old assignment generation');
reset role;

select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select revoke_design_assignment(pg_temp.k('project'),pg_temp.k('designer-a'))$$,
 'Explicit assignment revocation succeeds');
reset role;
select is((select assignment_generation from design_boards where id=pg_temp.k('work-board')),
 2,'Revocation increments the remaining board generation');
select is((select count(*)::integer from board_work_requests
 where board_id=pg_temp.k('work-board') and current),0,
 'Revocation closes the current work request');
select is((select count(*)::integer from production_briefs where board_id=pg_temp.k('work-board')),
 0,'Revocation clears the current released instructions');
select is((select count(*)::integer from production_brief_drafts where board_id=pg_temp.k('work-board')),
 0,'Revocation clears the stale draft');
select is((select closed_reason from board_work_requests
 where board_id=pg_temp.k('work-board') order by sequence desc limit 1),
 'reassigned','Old request retains its closure reason');
select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select save_project_details_with_activity(pg_temp.k('project'),
 'Hardening project','', '2026-10-10'::date,current_date,'backlog',
 (select updated_at from projects where id=pg_temp.k('project')),
 (select workflow_revision from projects where id=pg_temp.k('project')),pg_temp.k('pause'))$$,
 'Agency pauses the project');
select lives_ok($$select save_project_details_with_activity(pg_temp.k('project'),
 'Hardening project','', '2026-10-10'::date,current_date,'active',
 (select updated_at from projects where id=pg_temp.k('project')),
 (select workflow_revision from projects where id=pg_temp.k('project')),pg_temp.k('resume'))$$,
 'Agency resumes the project');
select lives_ok($$select close_board_work(pg_temp.k('work-board'),3,pg_temp.k('close'))$$,
 'Agency may close the orphaned board');
reset role;
select is((select count(*)::integer from notifications where user_id=pg_temp.k('designer-a')
 and project_id=pg_temp.k('project') and title in
 ('Project moved to backlog','Project resumed','No further work needed')),0,
 'Revoked designer receives no activity or closure events');
select is((select count(*)::integer from notifications where user_id=pg_temp.k('designer-b')
 and project_id=pg_temp.k('project') and title in
 ('Project moved to backlog','Project resumed')),2,
 'Current assigned designer receives both activity events');
select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select reactivate_board_work(pg_temp.k('work-board'),4,
 pg_temp.k('reactivate'))$$,'Board reactivation needs a new release');
select lives_ok($$select assign_designer(pg_temp.k('project'),pg_temp.k('designer-a'))$$,
 'Same designer can be assigned again');
select is((select count(*)::integer from board_work_requests
 where board_id=pg_temp.k('work-board') and current),0,
 'Reassignment does not resurrect the old request');
select is(save_production_brief(pg_temp.k('work-board'),pg_temp.brief('Fresh'),0,true,
 pg_temp.k('fresh-release'),5,2),1,'Agency explicitly releases fresh work');
reset role;
select pg_temp.actor('designer-a'); set local role authenticated;
select is((select count(*)::integer from board_work_requests
 where board_id=pg_temp.k('work-board')),1,
 'Reassigned designer reads only the fresh generation');
select is((select content->>'title' from board_work_requests
 where board_id=pg_temp.k('work-board') and current),'Fresh',
 'Fresh release is the only current task');
reset role;
select pg_temp.actor('agency'); set local role authenticated;
select lives_ok($$select remove_team_member(pg_temp.k('designer-a'))$$,
 'Team removal revokes its project assignments through the same trigger');
reset role;
select is((select assignment_generation from design_boards where id=pg_temp.k('work-board')),
 3,'Team removal advances assignment generation again');
select is((select count(*)::integer from board_work_requests
 where board_id=pg_temp.k('work-board') and current),0,
 'Team removal closes the fresh current request');
select is((select count(*)::integer from production_briefs where board_id=pg_temp.k('work-board')),
 0,'Team removal clears released instructions');
select pg_temp.actor('agency'); set local role authenticated;
select lives_ok(format($sql$select handoff_board_work(%L::uuid,null,null,%L::jsonb,%L::uuid)$sql$,
 pg_temp.k('project'),jsonb_build_array(
 jsonb_build_object('boardId',pg_temp.k('work-board'),'action','close',
  'expectedBoardRevision',(select workflow_revision from design_boards where id=pg_temp.k('work-board')),
  'expectedAssignmentGeneration',(select assignment_generation from design_boards where id=pg_temp.k('work-board'))),
 jsonb_build_object('boardId',pg_temp.k('history-board'),'action','continue',
  'content',pg_temp.brief('Next direction'),'expectedBriefRevision',0,
  'expectedBoardRevision',(select workflow_revision from design_boards where id=pg_temp.k('history-board')),
  'expectedAssignmentGeneration',(select assignment_generation from design_boards where id=pg_temp.k('history-board')))
 ),md5('workflow-hardening:handoff')::uuid),
 'Handoff may close a revoked board while continuing assigned work');
reset role;
select is((select count(*)::integer from notifications where user_id=pg_temp.k('designer-a')
 and project_id=pg_temp.k('project') and title='No further work needed'),0,
 'Handoff closure does not notify a removed designer');

select * from finish();
rollback;
