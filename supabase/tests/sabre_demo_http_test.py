"""Read-only verification of the populated local SABRE demonstration on the Miro model and its role boundaries.

Asserts the same status mapping as `miro_history` in `sabre_demo.py` and `build_seed.py`: a planned or
in-progress project holds design boards only; internal review keeps its rounds with the studio; later
statuses end on the client version whose review the status names, every earlier one sent back.
"""
from collections import Counter
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sabre_demo import Demo, CLIENT_ID, RUN
from sabre_demo_state import STATE_DIR, snapshot, sql

DECISION = {'client_review': 'pending', 'changes_requested': 'changes_requested', 'approved': 'approved', 'delivered': 'approved'}


def main():
    demo = Demo()
    if not demo.state or demo.state['phase'] != 'complete' or demo.state['canary']:
        raise RuntimeError('Apply the complete local demonstration before running this verification.')
    checks = []
    def check(condition, label):
        if not condition: raise AssertionError(label)
        checks.append(label)
        print('PASS ' + label, flush=True)

    current = snapshot()
    rows = current['rows']
    projects = rows['public.projects']
    check(len(projects) == 50, 'SABRE contains exactly fifty projects')
    check(sql('select count(*) from public.clients;') == '10' and sql('select count(*) from public.projects;') == '68', 'Ten clients and sixty-eight total projects')
    project_ids = {p['id'] for p in projects}
    in_projects = 'project_id=in.(' + ','.join(project_ids) + ')'
    check(len({d['format'] for d in rows['public.deliverables']}) >= 20, 'At least twenty deliverable formats')
    new_ids = set(demo.state['new_projects'])
    debits = [r for r in rows['public.credit_ledger'] if r['project_id'] in new_ids and r['kind'] == 'project_debit']
    check(len(debits) == 43 and {r['project_id'] for r in debits} == new_ids, 'Exactly one real project debit for each of forty-three new projects')
    check(sum(r['amount'] for r in rows['public.credit_ledger']) == rows['public.credit_accounts'][0]['balance'], 'Credit balance reconciles to the persisted ledger')
    check(all(p['start_date'] <= p['due_date'] for p in projects if p['start_date'] and p['due_date']), 'Project date ranges are valid')
    check(len({p['start_date'][5:7] for p in projects if p['start_date']}) >= 8, 'Campaign schedules span the demonstration year')
    check({r['status'] for r in rows['public.credit_requests']} == {'pending', 'fulfilled', 'rejected'}, 'Credit requests demonstrate all three outcomes')
    check({'draft', 'awaiting_review', 'budget_confirmed', 'accepted'} <= {r['status'] for r in rows['public.briefings']}, 'Briefings demonstrate the full intake progression')

    # The Miro model, per project.
    boards, rounds, versions = rows['public.design_boards'], rows['public.design_versions'], rows['public.published_versions']
    round_links = {r['version_id'] for r in rows['public.design_version_miro_links']}
    version_links = {r['publication_id'] for r in rows['public.publication_miro_links']}
    reviews = {r['publication_id']: r['status'] for r in rows['public.publication_reviews']}
    covers = {r['project_id']: r for r in rows['public.project_covers']}
    assignments = rows['public.project_assignments']
    # A project that already held hand-made rounds or versions when the Miro backfill ran kept them
    # (its plan is empty), so only the decision its status names is asserted for it.
    steps = demo.state['steps']
    plan_of = {(p['id'] if p.get('existing') else steps.get('accept:' + p['key'])): steps.get('miro-plan:' + p['key']) for p in demo.state['project_plan']}
    # A project the canonical seed created keeps the seed's history, which follows the same
    # `miro_history`, so it gets the full check; only a hand-edited project can be exempt.
    seeded = {p['id'] for p in demo.state['project_plan'] if p.get('existing')}
    kept = {pid for pid, plan in plan_of.items() if plan == []} - seeded - {p['id'] for p in projects if p['status'] in ('planned', 'in_progress')}
    for project in projects:
        pid, status = project['id'], project['status']
        own_boards = [b for b in boards if b['project_id'] == pid]
        assigned = sorted(r['designer_id'] for r in assignments if r['project_id'] == pid)
        if sorted(b['designer_id'] for b in own_boards) != assigned or not own_boards:
            raise AssertionError('One design board per assigned designer: ' + project['title'])
        own_rounds = [r for r in rounds if r['project_id'] == pid]
        own_versions = sorted((v for v in versions if v['project_id'] == pid), key=lambda v: v['version_number'])
        per_board = Counter(r['board_id'] for r in own_rounds)
        if any(r['board_id'] not in {b['id'] for b in own_boards} for r in own_rounds) or len({per_board[b['id']] for b in own_boards}) != 1:
            raise AssertionError('Every board of a project holds the same round cycles: ' + project['title'])
        if not all(r['id'] in round_links for r in own_rounds) or not all(v['id'] in version_links for v in own_versions):
            raise AssertionError('A round or client version has no Miro link: ' + project['title'])
        decisions = [reviews[v['id']] for v in own_versions]
        if status in ('planned', 'in_progress'):
            ok = not own_rounds and not own_versions
        elif status == 'internal_review':
            ok = bool(own_rounds) and {r['status'] for r in own_rounds} == {'submitted'} and not own_versions and per_board[own_boards[0]['id']] <= 2
        elif pid in kept:
            ok = bool(decisions) and decisions[-1] == DECISION[status]
        else:
            ok = bool(decisions) and decisions[-1] == DECISION[status] and all(d == 'changes_requested' for d in decisions[:-1]) \
                and per_board[own_boards[0]['id']] == len(own_versions)
        if not ok:
            raise AssertionError(f'Status {status} does not match its rounds and client versions: ' + project['title'])
        if pid not in kept and sum(1 for r in own_rounds if r['status'] == 'reviewed') != len(own_versions):
            raise AssertionError('A round reads Shared exactly when a client version came from it: ' + project['title'])
        if pid not in covers or covers[pid]['client_visible'] != bool(own_versions):
            raise AssertionError('Every project has a cover, client-visible exactly when it has a client version: ' + project['title'])
    check(True, 'Every project has one design board per assigned designer, a cover and Miro links on every round and version')
    check(len(kept) <= 1, 'Each status maps to its rounds and client versions (miro_history); %d hand-edited project(s) kept' % len(kept))
    check({p['status'] for p in projects} >= {'in_progress', 'internal_review', 'client_review', 'changes_requested', 'approved', 'delivered'}, 'The demonstration covers every production status')
    check({r['status'] for r in rounds} == {'submitted', 'reviewed'} and set(reviews.values()) == {'pending', 'approved', 'changes_requested'}, 'Rounds and client reviews demonstrate every state')

    # Drive backup links: only a fresh `apply` sets them, and it records each one it set.
    recorded = {demo.state['steps'].get('accept:' + name.split(':', 1)[1]): url for name, url in demo.state['steps'].items() if name.startswith('drive-link:')}
    # Seeded SABRE projects keep the canonical seed's own Drive links; the rest come from the apply.
    check({p['id']: p.get('drive_url') for p in projects if p.get('drive_url') and p['id'] not in seeded} == recorded, 'Drive links are exactly the ones the fresh apply recorded (%d)' % len(recorded))

    client_projects = demo.rows('projects', 'client_id=eq.' + CLIENT_ID, 'client')
    check({p['id'] for p in client_projects} == project_ids, 'Client can open all fifty SABRE projects')
    check({p['id']: p.get('drive_url') for p in client_projects if p.get('drive_url') and p['id'] not in seeded} == recorded, 'Client reads the same Drive links')
    for table in ('design_boards', 'design_versions', 'design_version_miro_links', 'project_assignments', 'internal_comments', 'project_assets'):
        # Narrow selects: a whole-row read of design_versions is refused outright (author column).
        check(demo.rows(table, in_projects + '&select=project_id', 'client') == [], 'Client cannot read ' + table)
    client_versions = demo.rows('published_versions', in_projects, 'client')
    client_links = demo.rows('publication_miro_links', in_projects, 'client')
    client_reviews = demo.rows('publication_reviews', in_projects, 'client')
    check({v['id'] for v in client_versions} == {v['id'] for v in versions} and {r['publication_id'] for r in client_links} == version_links, 'Client receives every client version and its Miro link')
    designers = {r['designer_id'] for r in assignments} | {demo.users['designer'], demo.users['designer2']}
    visible = json.dumps([client_versions, client_links, client_reviews, demo.rows('client_comments', in_projects, 'client'), demo.rows('notifications', 'client_id=eq.' + CLIENT_ID, 'client')])
    check(not any(designer in visible for designer in designers) and 'created_by' not in json.dumps(client_versions), 'Client-visible rows carry no designer identity')
    for role in ('designer', 'designer2'):
        user = demo.users[role]
        assigned = {r['project_id'] for r in assignments if r['designer_id'] == user}
        check({p['id'] for p in demo.rows('projects', 'client_id=eq.' + CLIENT_ID, role)} == assigned, role + ' sees exactly the assigned SABRE projects')
        own = {b['id'] for b in boards if b['designer_id'] == user}
        check({b['id'] for b in demo.rows('design_boards', in_projects, role)} == own, role + ' reads only their own design boards')
        check({r['board_id'] for r in demo.rows('design_versions', in_projects + '&select=id,board_id', role)} <= own, role + ' reads only rounds on their own boards')
        check(demo.rows('client_comments', in_projects, role) == [] and demo.rows('publication_reviews', in_projects, role) == [], role + ' cannot read the client channel')
    check(all(r['owner_id'] == demo.users['client'] for r in demo.rows('template_drafts', 'client_id=eq.' + CLIENT_ID, 'client')), 'Client template drafts are private to their owner')
    for role in ('agency', 'client', 'designer2'):
        playground = demo.rows('playground_boards', 'client_id=eq.' + CLIENT_ID, role)
        check(all(b['role'] == ('designer' if role == 'designer2' else role) for b in playground), role + ' Playground reads stay in the same role')
    private_file = next(a['storage_path'] for a in rows['public.project_assets'] if a['storage_path'])
    try:
        demo.request('/storage/v1/object/authenticated/internal-assets/' + private_file, role='client')
        raise AssertionError('Client unexpectedly downloaded a private production file')
    except RuntimeError as error:
        check('(400)' in str(error) or '(403)' in str(error) or '(404)' in str(error), 'Storage denies client access to private working files')

    downloaded_covers = 0
    client_covers = {r['project_id'] for r in demo.rows('project_covers', in_projects + '&select=project_id', 'client')}
    check(client_covers == {pid for pid, c in covers.items() if c['client_visible']}, 'Client sees exactly the covers of projects with a client version')
    for pid, cover in covers.items():
        path = '/storage/v1/object/authenticated/project-covers/' + cover['storage_path']
        if cover['client_visible']:
            if not demo.request(path, role='client').startswith(b'\x89PNG'): raise AssertionError('Cover is not a PNG: ' + pid)
            downloaded_covers += 1
            continue
        try:
            demo.request(path, role='client')
            raise AssertionError('Client downloaded a hidden cover')
        except RuntimeError as error:
            if not ('(400)' in str(error) or '(403)' in str(error) or '(404)' in str(error)): raise
    check(downloaded_covers > 0, 'Client downloads every visible cover and none of the hidden ones')
    deliveries = demo.rows('delivery_files', in_projects, 'client')
    for delivery in deliveries:
        data = demo.request('/storage/v1/object/authenticated/delivery-files/' + delivery['storage_path'], role='client')
        if delivery['mime_type'] == 'application/pdf': assert data.startswith(b'%PDF')
        else: assert data.startswith(b'\x89PNG')
    delivered_ids = {p['id'] for p in projects if p['status'] == 'delivered'}
    expected_deliveries = [d for d in rows['public.delivery_files'] if d['project_id'] in delivered_ids]
    check(len(deliveries) == len(expected_deliveries) == 10, 'Client downloads all ten released delivery files; staged finals stay private')

    report = {'overlay': RUN, 'result': 'pass', 'checks': checks, 'check_count': len(checks),
              'design_boards': len(boards), 'rounds': len(rounds), 'client_versions': len(versions),
              'downloaded_covers': downloaded_covers, 'downloaded_deliveries': len(deliveries), 'drive_links': len(recorded), 'hand_edited_projects_kept': len(kept)}
    # Working evidence stays with the ignored overlay state; a verification record cites a copy.
    (STATE_DIR / 'http-report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__': main()
