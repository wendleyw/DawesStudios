begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Every row in this test is rolled back. Fixed IDs make the result independent of the canonical
-- seed and of the optional SABRE demonstration overlay.
create temporary table an(key text primary key, value uuid);
grant select on an to authenticated;
insert into an values
  ('agency', md5('an:agency')::uuid),
  ('designer-a', md5('an:designer-a')::uuid),
  ('designer-b', md5('an:designer-b')::uuid),
  ('client-requester', md5('an:client-requester')::uuid),
  ('client-watcher', md5('an:client-watcher')::uuid),
  ('client-quiet', md5('an:client-quiet')::uuid),
  ('client-other', md5('an:client-other')::uuid),
  ('client-a', md5('an:client-a')::uuid),
  ('client-b', md5('an:client-b')::uuid),
  ('brief-review', md5('an:brief-review')::uuid),
  ('brief-budget', md5('an:brief-budget')::uuid),
  ('brief-work', md5('an:brief-work')::uuid),
  ('brief-other', md5('an:brief-other')::uuid),
  ('project-prepare', md5('an:project-prepare')::uuid),
  ('project-work', md5('an:project-work')::uuid),
  ('project-delivered', md5('an:project-delivered')::uuid),
  ('project-other', md5('an:project-other')::uuid),
  ('board-a', md5('an:board-a')::uuid),
  ('board-b', md5('an:board-b')::uuid),
  ('round-a1', md5('an:round-a1')::uuid),
  ('round-a2', md5('an:round-a2')::uuid),
  ('round-a3', md5('an:round-a3')::uuid),
  ('version-1', md5('an:version-1')::uuid),
  ('version-2', md5('an:version-2')::uuid),
  ('version-other', md5('an:version-other')::uuid),
  ('credit-request', md5('an:credit-request')::uuid);
create function pg_temp.k(p_key text) returns uuid language sql as $$
  select value from an where key = p_key
$$;
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.k(p_key)::text, true)
$$;
create function pg_temp.has_action(p_kind text, p_entity uuid) returns boolean language sql as $$
  select exists(select 1 from public.action_notifications
    where kind = p_kind and entity_id = p_entity)
$$;

insert into auth.users(id, email, raw_user_meta_data) values
  (pg_temp.k('agency'), 'an-agency@fixture.local', '{"display_name":"Action agency"}'),
  (pg_temp.k('designer-a'), 'an-designer-a@fixture.local', '{"display_name":"Action designer A"}'),
  (pg_temp.k('designer-b'), 'an-designer-b@fixture.local', '{"display_name":"Action designer B"}'),
  (pg_temp.k('client-requester'), 'an-requester@fixture.local', '{"display_name":"Action requester"}'),
  (pg_temp.k('client-watcher'), 'an-watcher@fixture.local', '{"display_name":"Action watcher"}'),
  (pg_temp.k('client-quiet'), 'an-quiet@fixture.local', '{"display_name":"Action quiet"}'),
  (pg_temp.k('client-other'), 'an-other@fixture.local', '{"display_name":"Action other"}');
update public.profiles set role = 'agency' where id = pg_temp.k('agency');
update public.profiles set role = 'designer'
  where id in (pg_temp.k('designer-a'), pg_temp.k('designer-b'));
insert into public.clients(id, name, slug) values
  (pg_temp.k('client-a'), 'Action client A', 'action-client-a'),
  (pg_temp.k('client-b'), 'Action client B', 'action-client-b');
insert into public.client_memberships(client_id, user_id, notify_all) values
  (pg_temp.k('client-a'), pg_temp.k('client-requester'), false),
  (pg_temp.k('client-a'), pg_temp.k('client-watcher'), true),
  (pg_temp.k('client-a'), pg_temp.k('client-quiet'), false),
  (pg_temp.k('client-b'), pg_temp.k('client-other'), false);

insert into public.briefings
  (id, client_id, title, service_type, status, direction, requested_deliverables,
   confirmed_credits, created_by, requested_by)
values
  (pg_temp.k('brief-review'), pg_temp.k('client-a'), 'Review this brief', 'ai',
   'awaiting_review', '{"questions":{"task":"Plan the campaign"}}',
   '[{"name":"Research","format":"research"}]', null,
   pg_temp.k('client-requester'), pg_temp.k('client-requester')),
  (pg_temp.k('brief-budget'), pg_temp.k('client-a'), 'Start this project', 'ai',
   'budget_confirmed', '{"questions":{"task":"Plan the campaign"}}',
   '[{"name":"Research","format":"research"}]', 1,
   pg_temp.k('client-requester'), pg_temp.k('client-requester')),
  (pg_temp.k('brief-work'), pg_temp.k('client-a'), 'Work briefing', 'ai',
   'accepted', '{"questions":{"task":"Plan the campaign"}}',
   '[{"name":"Research","format":"research"}]', 1,
   pg_temp.k('client-requester'), pg_temp.k('client-requester')),
  (pg_temp.k('brief-other'), pg_temp.k('client-b'), 'Other briefing', 'ai',
   'accepted', '{"questions":{"task":"Plan the campaign"}}',
   '[{"name":"Research","format":"research"}]', 1,
   pg_temp.k('client-other'), pg_temp.k('client-other'));
insert into public.projects(id, client_id, briefing_id, title, service_type, status) values
  (pg_temp.k('project-prepare'), pg_temp.k('client-a'), null, 'Prepare project', 'ai', 'planned'),
  (pg_temp.k('project-work'), pg_temp.k('client-a'), pg_temp.k('brief-work'), 'Work project', 'ai', 'client_review'),
  (pg_temp.k('project-delivered'), pg_temp.k('client-a'), null, 'Delivered project', 'ai', 'delivered'),
  (pg_temp.k('project-other'), pg_temp.k('client-b'), pg_temp.k('brief-other'), 'Other project', 'ai', 'client_review');
insert into public.project_assignments(project_id, designer_id) values
  (pg_temp.k('project-work'), pg_temp.k('designer-a')),
  (pg_temp.k('project-work'), pg_temp.k('designer-b'));
insert into public.design_boards(id, project_id, name, designer_id, board_id, created_by) values
  (pg_temp.k('board-a'), pg_temp.k('project-work'), 'Board A', pg_temp.k('designer-a'), 'uXjVActionA1=', pg_temp.k('agency')),
  (pg_temp.k('board-b'), pg_temp.k('project-work'), 'Board B', pg_temp.k('designer-b'), 'uXjVActionB1=', pg_temp.k('agency'));
insert into public.design_versions(id, project_id, board_id, version_number, status, created_by) values
  (pg_temp.k('round-a1'), pg_temp.k('project-work'), pg_temp.k('board-a'), 1, 'submitted', pg_temp.k('designer-a'));
insert into public.board_work_requests(id,project_id,board_id,recipient_id,
 assignment_generation,sequence,kind,outcome,round_id,content,brief_revision)
values
 (md5('an:request-a1')::uuid,pg_temp.k('project-work'),pg_temp.k('board-a'),
 pg_temp.k('designer-a'),1,1,'legacy_round','submitted',pg_temp.k('round-a1'),null,null),
 (md5('an:request-b1')::uuid,pg_temp.k('project-work'),pg_temp.k('board-b'),
 pg_temp.k('designer-b'),1,1,'initial','open',null,'{}'::jsonb,1);
update public.design_versions set work_request_id=md5('an:request-a1')::uuid
 where id=pg_temp.k('round-a1');
insert into public.published_versions(id, project_id, version_number) values
  (pg_temp.k('version-1'), pg_temp.k('project-work'), 1),
  (pg_temp.k('version-other'), pg_temp.k('project-other'), 1);
insert into public.publication_reviews(publication_id, project_id) values
  (pg_temp.k('version-1'), pg_temp.k('project-work')),
  (pg_temp.k('version-other'), pg_temp.k('project-other'));
insert into public.credit_requests(id, client_id, requested_by, amount) values
  (pg_temp.k('credit-request'), pg_temp.k('client-a'), pg_temp.k('client-requester'), 25);
insert into public.notifications(user_id, client_id, project_id, title) values
  (pg_temp.k('agency'), pg_temp.k('client-a'), pg_temp.k('project-work'), 'Action fixture event');

select has_view('public', 'action_notifications', 'Pending actions are a view');
select ok((select reloptions @> array['security_invoker=true', 'security_barrier=true']
  from pg_class where oid = 'public.action_notifications'::regclass),
  'The view invokes source RLS and keeps the security barrier');
select ok(not has_table_privilege('authenticated', 'public.action_notifications', 'INSERT')
  and not has_table_privilege('authenticated', 'public.action_notifications', 'UPDATE'),
  'Authenticated users can only read the derived view');
set local role anon;
select throws_ok($$select * from public.action_notifications$$, '42501', null,
  'Anonymous callers cannot select actions');
reset role;

select pg_temp.act_as('agency');
set local role authenticated;
select ok(pg_temp.has_action('review_briefing', pg_temp.k('brief-review')),
  'Agency reviews submitted briefings');
select ok(pg_temp.has_action('start_project', pg_temp.k('brief-budget')),
  'Agency accepts the confirmed budget into a project');
select ok(pg_temp.has_action('review_credit_request', pg_temp.k('credit-request')),
  'Agency sees pending credit requests');
select is((select subject from public.action_notifications
  where kind = 'review_credit_request' and entity_id = pg_temp.k('credit-request')),
  'Action client A - 25 credits', 'Credit requests identify their client and amount');
select ok(pg_temp.has_action('prepare_project', pg_temp.k('project-prepare')),
  'Agency prepares projects with no board');
select ok(not pg_temp.has_action('prepare_project', pg_temp.k('project-delivered')),
  'Delivered projects have no preparation action');
select ok(not pg_temp.has_action('prepare_project', pg_temp.k('project-other')),
  'A direct client publication removes preparation even without a design board');
select ok(pg_temp.has_action('review_round', pg_temp.k('round-a1')),
  'Agency reviews the latest submitted round');
select is((select subject from public.action_notifications where entity_id=pg_temp.k('round-a1') and kind='review_round'),
  'Work project · Board A', 'Agency actions identify the particular board');
select ok(not pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'Agency does not receive client review actions');
select is((select id from public.action_notifications
  where kind = 'review_round' and entity_id = pg_temp.k('round-a1')),
  'review_round:' || pg_temp.k('round-a1')::text, 'Action IDs are stable kind/entity keys');
select is((select board_id from public.action_notifications
  where kind = 'review_round' and entity_id = pg_temp.k('round-a1')),
  pg_temp.k('board-a'), 'Round actions name their board');
update public.notifications set read_at = now()
  where user_id = pg_temp.k('agency') and title = 'Action fixture event';
select ok(pg_temp.has_action('review_round', pg_temp.k('round-a1')),
  'Reading a historical event does not resolve a pending action');
reset role;

-- A newly released request supersedes the submitted request; draft rows alone are historical.
insert into public.design_versions(id, project_id, board_id, version_number, status, created_by) values
  (pg_temp.k('round-a2'), pg_temp.k('project-work'), pg_temp.k('board-a'), 2, 'draft', pg_temp.k('designer-a'));
update public.board_work_requests set current=false,outcome='closed',closed_reason='superseded'
 where id=md5('an:request-a1')::uuid;
insert into public.board_work_requests(id,project_id,board_id,recipient_id,
 assignment_generation,sequence,kind,outcome,content,brief_revision)
values(md5('an:request-a2')::uuid,pg_temp.k('project-work'),pg_temp.k('board-a'),
 pg_temp.k('designer-a'),1,2,'revision','open','{}'::jsonb,2);
select pg_temp.act_as('agency');
set local role authenticated;
select ok(not pg_temp.has_action('review_round', pg_temp.k('round-a1')),
  'An older submitted round does not leave a stale review action');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select ok(pg_temp.has_action('revise_board', pg_temp.k('board-a')),
  'The board owner can submit a newer draft');
select ok(not pg_temp.has_action('submit_round', pg_temp.k('board-b')),
  'A designer cannot see another designer board action');
select ok(not pg_temp.has_action('review_round', pg_temp.k('round-a1')),
  'A designer does not receive studio review actions');
reset role;
insert into public.design_versions(id, project_id, board_id, version_number, status, created_by) values
  (pg_temp.k('round-a3'), pg_temp.k('project-work'), pg_temp.k('board-a'), 3, 'submitted', pg_temp.k('designer-a'));
update public.board_work_requests set outcome='submitted',round_id=pg_temp.k('round-a3')
 where id=md5('an:request-a2')::uuid;
update public.design_versions set work_request_id=md5('an:request-a2')::uuid
 where id=pg_temp.k('round-a3');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(pg_temp.has_action('review_round', pg_temp.k('round-a3')),
  'The next submitted round becomes the only review action');
select is((select count(*)::int from public.action_notifications
  where kind = 'review_round' and board_id = pg_temp.k('board-a')),
  1, 'Older submitted rounds do not duplicate the latest action');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select ok(not pg_temp.has_action('revise_board', pg_temp.k('board-a')),
  'A submitted latest round closes designer submit');
reset role;
update public.design_versions set status = 'reviewed' where id = pg_temp.k('round-a3');
select pg_temp.act_as('designer-a');
set local role authenticated;
select ok(not pg_temp.has_action('revise_board', pg_temp.k('board-a')),
  'A reviewed latest round also closes designer submit');
reset role;
update public.design_versions set status = 'submitted' where id = pg_temp.k('round-a3');
update public.profiles set removed_at = now() where id = pg_temp.k('designer-a');
update public.board_work_requests set outcome='submitted',round_id=pg_temp.k('round-a3')
 where id=md5('an:request-a2')::uuid;
update public.design_versions set work_request_id=md5('an:request-a2')::uuid
 where id=pg_temp.k('round-a3');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(pg_temp.has_action('review_round', pg_temp.k('round-a3')),
  'The studio still reviews submitted work after its designer leaves');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.action_notifications), 0,
  'A removed designer reads no pending actions');
reset role;
update public.profiles set removed_at = null where id = pg_temp.k('designer-a');
select pg_temp.act_as('designer-b');
set local role authenticated;
select ok(pg_temp.has_action('submit_round', pg_temp.k('board-b')),
  'An assigned designer with no rounds sees their own action');
select is((select subject from public.action_notifications where entity_id=pg_temp.k('board-b') and kind='submit_round'),
  'Work project · Board B', 'Designer actions identify only their own board');
reset role;
delete from public.project_assignments where project_id = pg_temp.k('project-work')
  and designer_id = pg_temp.k('designer-b');
select pg_temp.act_as('designer-b');
set local role authenticated;
select ok(not pg_temp.has_action('submit_round', pg_temp.k('board-b')),
  'Reassignment removes the old board owner action');
reset role;

-- Project and budget transitions remove resolved actions without changing notifications.
update public.briefings set status = 'budget_confirmed', confirmed_credits = 1
  where id = pg_temp.k('brief-review');
update public.credit_requests set status = 'rejected', response_note = 'No allocation'
  where id = pg_temp.k('credit-request');
insert into public.project_assignments(project_id, designer_id) values
  (pg_temp.k('project-prepare'), pg_temp.k('designer-a'));
insert into public.design_boards(id, project_id, name, designer_id, board_id, created_by) values
  (md5('an:board-prepare')::uuid, pg_temp.k('project-prepare'), 'Prepared',
   pg_temp.k('designer-a'), 'uXjVPrep001=', pg_temp.k('agency'));
select pg_temp.act_as('agency');
set local role authenticated;
select ok(not pg_temp.has_action('review_briefing', pg_temp.k('brief-review')),
  'Budget confirmation resolves briefing review');
select ok(pg_temp.has_action('start_project', pg_temp.k('brief-review')),
  'Confirmed briefing moves to project acceptance');
select ok(not pg_temp.has_action('review_credit_request', pg_temp.k('credit-request')),
  'Resolved credit requests leave the list');
select ok(not pg_temp.has_action('prepare_project', pg_temp.k('project-prepare')),
  'Creating a board resolves project preparation');
reset role;
update public.briefings set status = 'accepted' where id = pg_temp.k('brief-review');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(not pg_temp.has_action('start_project', pg_temp.k('brief-review')),
  'Accepted briefings do not remain actionable');
reset role;

-- Client routing: requester and notify_all, then all remaining members when requester is gone.
select pg_temp.act_as('client-requester');
set local role authenticated;
select ok(pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'Active requester receives the latest client version action');
select ok(not pg_temp.has_action('review_version', pg_temp.k('version-other')),
  'A client cannot read another client project action');
select ok(private.can_receive_project_action(pg_temp.k('project-work')),
  'The routing helper accepts the current requester''s project');
select ok(not private.can_receive_project_action(pg_temp.k('project-other')),
  'The routing helper refuses another client project');
select ok(not pg_temp.has_action('review_credit_request', pg_temp.k('credit-request')),
  'A client never receives billing acceptance');
reset role;
select pg_temp.act_as('client-watcher');
set local role authenticated;
select ok(pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'An opted-in client member receives the version action');
reset role;
select pg_temp.act_as('client-quiet');
set local role authenticated;
select ok(not pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'A non-requester without notify_all does not receive the action');
reset role;
update public.briefings set requested_by = null where id = pg_temp.k('brief-work');
select pg_temp.act_as('client-quiet');
set local role authenticated;
select ok(pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'No active requester routes the action to every current client member');
reset role;
update public.briefings set requested_by = pg_temp.k('client-requester')
  where id = pg_temp.k('brief-work');
update public.profiles set removed_at = now() where id = pg_temp.k('client-requester');
select pg_temp.act_as('client-requester');
set local role authenticated;
select ok(not private.can_receive_project_action(pg_temp.k('project-work')),
  'A removed requester fails the routing helper');
select is((select count(*)::int from public.action_notifications), 0,
  'A removed client identity reads no pending actions');
reset role;
select pg_temp.act_as('client-quiet');
set local role authenticated;
select ok(pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'Removal of the requester activates the all-member fallback');
reset role;

-- Replacing a publication removes its old action; a reviewed latest version moves to the studio.
insert into public.published_versions(id, project_id, version_number) values
  (pg_temp.k('version-2'), pg_temp.k('project-work'), 2);
insert into public.publication_reviews(publication_id, project_id) values
  (pg_temp.k('version-2'), pg_temp.k('project-work'));
select pg_temp.act_as('client-watcher');
set local role authenticated;
select ok(not pg_temp.has_action('review_version', pg_temp.k('version-1')),
  'A replaced publication no longer has a client action');
select ok(pg_temp.has_action('review_version', pg_temp.k('version-2')),
  'Only the latest pending publication needs client review');
reset role;
update public.publication_reviews set status = 'changes_requested', reviewed_at = now()
  where publication_id = pg_temp.k('version-2');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(pg_temp.has_action('respond_feedback', pg_temp.k('version-2')),
  'Requested changes create a studio response action');
select ok(not pg_temp.has_action('respond_feedback', pg_temp.k('version-1')),
  'Older versions never create duplicate feedback actions');
reset role;
update public.publication_reviews set status = 'approved' where publication_id = pg_temp.k('version-2');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(not pg_temp.has_action('respond_feedback', pg_temp.k('version-2')),
  'Approval resolves feedback');
select ok(not pg_temp.has_action('deliver_project', pg_temp.k('version-2')),
  'An approved review is not deliverable while the project is in another state');
reset role;
update public.projects set status = 'approved' where id = pg_temp.k('project-work');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(pg_temp.has_action('deliver_project', pg_temp.k('version-2')),
  'Approved latest version creates the delivery action');
reset role;
insert into public.design_versions(id, project_id, board_id, version_number, status, created_by) values
  (md5('an:round-a4')::uuid, pg_temp.k('project-work'), pg_temp.k('board-a'), 4,
   'submitted', pg_temp.k('designer-a'));
-- Internal rounds leave the approved public phase unchanged.
select pg_temp.act_as('agency');
set local role authenticated;
select ok(pg_temp.has_action('deliver_project', pg_temp.k('version-2')),
  'An internal round does not revoke the latest client approval');
reset role;
update public.projects set status = 'approved' where id = pg_temp.k('project-work');
update public.projects set status = 'delivered' where id = pg_temp.k('project-work');
select pg_temp.act_as('agency');
set local role authenticated;
select ok(not pg_temp.has_action('deliver_project', pg_temp.k('version-2')),
  'Delivery removes the completed action');
select ok(not pg_temp.has_action('review_round', pg_temp.k('round-a3')),
  'Delivery also removes pending internal review');
reset role;

select * from finish();
rollback;
