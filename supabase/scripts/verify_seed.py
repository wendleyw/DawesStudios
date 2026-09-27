"""Read-only acceptance checks for the exact fixture dataset, its Miro-model records and actual files.

Targets the local stack by default, the restore drill with `--workdir supabase/.restore-drill`, or the
disposable staging rehearsal with `--staging` (credentials from deploy/staging/.work/fixtures.env)."""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import urllib.error
import re
import urllib.request
from fixture_media import FORMAT_FREE_SIZE, brand_asset_bytes, format_pixel_size, png_pixel_size

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', type=Path)
    parser.add_argument('--staging', action='store_true', help='verify the disposable staging rehearsal instead')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.staging and args.workdir:
        parser.error('--staging verifies the staging rehearsal; it cannot be combined with --workdir')
    workdir = (args.workdir or ROOT).resolve()
    if args.staging:
        env_file = ROOT / 'deploy/staging/.work/fixtures.env'
        expected = 'http://127.0.0.1:56010'
    else:
        if workdir not in (ROOT, ROOT / 'supabase/.restore-drill'):
            raise SystemExit('Verification is restricted to the two isolated local projects or --staging.')
        env_file = workdir / 'supabase/.env.local'
        expected = 'http://127.0.0.1:55421' if workdir == ROOT else 'http://127.0.0.1:55521'
    env = dict(line.split('=', 1) for line in env_file.read_text().splitlines() if '=' in line and not line.startswith('#'))
    assert env['SUPABASE_URL'] == expected, 'Unexpected local API URL'
    fixture = json.loads((ROOT / 'supabase/fixtures.json').read_text())

    def request(path, token=None, payload=None):
        req = urllib.request.Request(expected + path, data=json.dumps(payload).encode() if payload is not None else None, headers={'apikey': env['SUPABASE_ANON_KEY'], 'Authorization': 'Bearer ' + (token or env['SUPABASE_SERVICE_ROLE_KEY']), 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read()
            return json.loads(body) if 'json' in response.headers.get('Content-Type', '') else body

    def rows(table, query='select=*', token=None):
        return request('/rest/v1/' + table + '?' + query, token)

    clients, projects = rows('clients'), rows('projects')
    assert {row['id'] for row in clients} == {row['id'] for row in fixture['clients']}, 'Expected exactly the 10 reference clients'
    assert {row['id'] for row in projects} == {row['id'] for row in fixture['projects']}, 'Expected exactly the 25 reference projects'
    # Nine clients carry the uniform pair; SABRE carries the workspace the reference package
    # documents, so the shape is read from the manifest rather than asserted as one number.
    project_count = Counter(row['client_id'] for row in projects)
    assert project_count == Counter(row['client_id'] for row in fixture['projects']), 'Project distribution moved away from the manifest'
    assert sorted(project_count.values()) == [2] * 9 + [7], 'Expected two projects per client and seven for SABRE'
    assert {row['service_type'] for row in projects} == {row['id'] for row in rows('service_catalog')}, 'All 20 services must be represented'
    formats = {row['id']: row['definition'] for row in rows('format_catalog')}
    assert len(formats) == 25
    catalog = json.loads((ROOT / 'docs/ref/00-guia/CATALOGO-DE-SERVICOS.json').read_text())
    briefs = {row['id']: row for row in rows('briefings')}
    for project in projects:
        brief = briefs[project['briefing_id']]
        assert brief['status'] == 'accepted' and brief['confirmed_credits'] > 0
        assert brief['client_id'] == project['client_id'] and brief['campaign_id'] == project['campaign_id']
        service = next(row for row in catalog['types'] if row['id'] == project['service_type'])
        for question in service.get('questions', []):
            value = brief['direction']['questions'][question['id']]
            assert isinstance(value, str) and value.strip()
            if question.get('options'): assert value in question['options']
            if question['id'] == 'pages': assert value.isdecimal() and int(value) > 0
        assert brief['requested_deliverables'] and all(row['format'] in service['formats'] for row in brief['requested_deliverables'])
        assert project['due_date'] >= project['start_date']
    # Google Drive backup links: exactly the projects the manifest names, each set through
    # `set_project_drive_link`, so each is an https://drive.google.com link the constraint accepts.
    drive_links = {row['id']: row['drive_url'] for row in projects}
    assert drive_links == {row['id']: row['drive_url'] for row in fixture['projects']}, 'Drive links differ from the manifest'
    assert len([url for url in drive_links.values() if url]) >= 3, 'A few projects need a Drive backup link'
    assert all(re.fullmatch(r'https://drive\.google\.com/\S*', url) for url in drive_links.values() if url), 'A Drive link is not a drive.google.com URL'
    assert {row['status'] for row in projects} == {'planned', 'in_progress', 'internal_review', 'client_review', 'changes_requested', 'approved', 'delivered'}
    deliverables = rows('deliverables')
    multi = [project for project, count in Counter(row['project_id'] for row in deliverables).items() if count >= 2]
    assert len(multi) >= 4, 'At least four projects need multiple deliverables'
    ledger = rows('credit_ledger')
    assert Counter(row['project_id'] for row in ledger if row['kind'] == 'project_debit') == Counter({row['id']: 1 for row in projects})
    assert all(account['balance'] == sum(row['amount'] for row in ledger if row['client_id'] == account['client_id']) for account in rows('credit_accounts'))
    assert {'draft', 'awaiting_review', 'budget_confirmed', 'accepted'} <= {row['status'] for row in rows('briefings')}
    assert {'pending', 'fulfilled', 'rejected'} == {row['status'] for row in rows('credit_requests')}
    products = rows('brand_sections', 'section=eq.products')
    assert len(products) == 10 and all(len(row['content']['items']) >= 3 for row in products)
    assert all(all(isinstance(item.get(field), str) and item[field] for field in ('name', 'description', 'specs', 'rules')) for row in products for item in row['content']['items'])
    assert len(rows('brand_assets')) == 70
    for client in clients:
        assert {row['mime_type'] for row in rows('brand_assets') if row['client_id'] == client['id'] and row['category'] == 'Logo'} == {'image/svg+xml', 'image/png', 'application/pdf'}
    assert Counter(row['client_id'] for row in rows('brand_templates')) == Counter({row['id']: 7 for row in clients})
    comments = rows('client_comments')
    assert {'studio', 'client'} <= {row['author_kind'] for row in comments}
    assert rows('internal_comments'), 'Internal channel examples are required'
    assert {row['id'] for row in projects} <= {row['project_id'] for row in comments}, 'Every project has meaningful client activity'

    # The Miro model, per project: one design board per assigned designer, due on or before the
    # project; rounds on those boards and client versions whose statuses are the ones the project's
    # status implies; a placeholder Miro link on every round and version; and a cover.
    boards, rounds, versions = rows('design_boards'), rows('design_versions'), rows('published_versions')
    round_links = {row['version_id']: row for row in rows('design_version_miro_links')}
    version_links = {row['publication_id']: row for row in rows('publication_miro_links')}
    reviews = {row['publication_id']: row for row in rows('publication_reviews')}
    assignments = rows('project_assignments')
    covers = {row['project_id']: row for row in rows('project_covers')}
    miro_id = re.compile(r'^uXjV[0-9a-f]{7}=$')  # Miro's 12-character board id shape
    manifest_projects = {row['id']: row for row in fixture['projects']}
    shared_rounds = set()
    for project in projects:
        pid, status = project['id'], project['status']
        expected_row = manifest_projects[pid]
        assert status == expected_row['status'] or (status == 'delivered' and pid == fixture['delivery_project_id']), 'Project status moved: ' + project['title']
        assigned = sorted(row['designer_id'] for row in assignments if row['project_id'] == pid)
        project_boards = [row for row in boards if row['project_id'] == pid]
        assert sorted(row['designer_id'] for row in project_boards) == assigned == sorted(expected_row['designers']), 'One board per assigned designer: ' + project['title']
        for board in project_boards:
            assert board['due_date'] and board['due_date'] <= project['due_date'], 'Board due after its project'
            assert miro_id.match(board['board_id']), 'Board is not on a placeholder Miro id'
        project_rounds = [row for row in rounds if row['project_id'] == pid]
        project_versions = sorted((row for row in versions if row['project_id'] == pid), key=lambda row: row['version_number'])
        for row in project_rounds:
            board = next(b for b in project_boards if b['id'] == row['board_id'])
            assert row['created_by'] == board['designer_id'], "A round is on its own designer's board"
            assert miro_id.match(round_links[row['id']]['board_id']) and round_links[row['id']]['widget_id'], 'Round without a Miro frame'
        # Sending a round moves a project to internal review, so earlier statuses hold boards only.
        per_board = Counter(row['board_id'] for row in project_rounds)
        assert all(per_board[board['id']] == expected_row['rounds_per_board'] for board in project_boards), 'Round count moved: ' + project['title']
        if status in ('planned', 'in_progress'):
            assert not project_rounds and not project_versions, 'A project before internal review has no round'
        else:
            assert 1 <= expected_row['rounds_per_board'] <= 2, 'Each board holds one or two rounds'
        assert len(project_versions) == expected_row['client_versions'] <= 2
        for version in project_versions:
            assert miro_id.match(version_links[version['id']]['board_id']), 'Client version without a Miro link'
        decisions = [reviews[row['id']]['status'] for row in project_versions]
        # Every version before the latest was sent back, so the client only ever decides the newest.
        assert all(decision == 'changes_requested' for decision in decisions[:-1])
        if status == 'internal_review':
            assert {row['status'] for row in project_rounds} == {'submitted'} and not decisions, 'Internal review keeps every round with the studio'
        elif status == 'client_review':
            assert decisions and decisions[-1] == 'pending'
        elif status == 'changes_requested':
            assert decisions and decisions[-1] == 'changes_requested'
        elif status in ('approved', 'delivered'):
            assert decisions and decisions[-1] == 'approved'
        # A round reads "Shared" exactly when a client version was made from it.
        assert sum(1 for row in project_rounds if row['status'] == 'reviewed') == len(project_versions)
        shared_rounds |= {row['id'] for row in project_rounds if row['status'] == 'reviewed'}
        cover = covers.get(pid)
        assert cover and cover['storage_path'].startswith(pid + '/'), 'Every project needs a cover: ' + project['title']
        assert cover['client_visible'] == bool(project_versions), 'A cover is client-visible exactly when the client has a version'
    assert {row['status'] for row in rounds} == {'submitted', 'reviewed'}
    assert {row['status'] for row in reviews.values()} == {'pending', 'approved', 'changes_requested'}
    assert any(len(assignments_of) == 2 for assignments_of in [[row for row in assignments if row['project_id'] == p['id']] for p in projects]), 'Designer isolation needs a two-designer project'
    # Client-visible rows never name a designer.
    designer_names = [user['name'] for user in fixture['users'] if user['role'] == 'designer']
    client_users = {row['user_id'] for row in fixture['clients']}
    client_notifications = [row for row in rows('notifications') if row['user_id'] in client_users]
    client_text = json.dumps([comments, versions, list(reviews.values()), client_notifications])
    assert not any(name in client_text for name in designer_names), 'A client-visible row names a designer'

    for email in ['studio@dawes.local', 'designer@dawes.local', 'designer2@dawes.local']:
        session = request('/auth/v1/token?grant_type=password', payload={'email': email, 'password': env['DEMO_PASSWORD']})
        token = session['access_token']
        actual = {row['id'] for row in rows('projects', token=token)}
        expected_projects = {row['id'] for row in projects} if email == 'studio@dawes.local' else {row['project_id'] for row in rows('project_assignments') if row['designer_id'] == session['user']['id']}
        assert actual == expected_projects, 'Agency/designer project list differs from authorization'
        if email != 'studio@dawes.local':
            assert rows('briefings', token=token) == [] and rows('credit_ledger', token=token) == []
            assert rows('client_comments', token=token) == []
            # A designer sees only their own boards and the rounds on them, never another designer's.
            own = {row['id'] for row in boards if row['designer_id'] == session['user']['id']}
            assert {row['id'] for row in rows('design_boards', token=token)} == own, 'A designer read another designer\'s board'
            assert {row['board_id'] for row in rows('design_versions', 'select=id,board_id', token=token)} <= own, 'A designer read another designer\'s round'

    # The file total below is an arithmetic statement about the dataset, not a magic number: each
    # term is the count of one kind of fixture file, and each is checked against the manifest first
    # so a term that drifts fails where it is defined rather than as an unexplained total.
    brand_files = 70            # seven brand files for each of the ten clients
    cover_files = 25            # one sanitized cover per project, downloaded by the agency
    visible_cover_files = sum(1 for row in covers.values() if row['client_visible'])  # and by the client
    delivery_files = 1          # the single approved delivery PDF
    assert len(fixture['brand_assets']) == brand_files, 'Brand fixture count moved'
    assert len(fixture['covers']) == cover_files, 'Cover fixture count moved'
    agency_session = request('/auth/v1/token?grant_type=password', payload={'email': 'studio@dawes.local', 'password': env['DEMO_PASSWORD']})
    # A cover is drawn at the canvas of its project's leading deliverable, derived here from the
    # format catalog rather than read back from the manifest that asked for it.
    leading = {}
    for row in sorted(deliverables, key=lambda row: row['sort_order']):
        leading.setdefault(row['project_id'], row)
    cover_size = {pid: format_pixel_size(formats[leading[pid]['format']]) for pid in covers}
    cover_bytes = {}
    for pid, cover in covers.items():
        content = request('/storage/v1/object/authenticated/project-covers/' + cover['storage_path'], agency_session['access_token'])
        # The media worker regenerates the image, so its bytes are not the card's; its canvas is.
        assert png_pixel_size(content) == cover_size[pid] and b'Author' not in content, 'Cover is not the sanitized card'
        cover_bytes[pid] = content

    downloaded = 0
    for client in fixture['clients']:
        session = request('/auth/v1/token?grant_type=password', payload={'email': client['slug'] + '@client.dawes.local', 'password': env['DEMO_PASSWORD']})
        token = session['access_token']
        client_project_count = sum(1 for row in fixture['projects'] if row['client_id'] == client['id'])
        assert len(rows('clients', token=token)) == 1 and len(rows('projects', token=token)) == client_project_count
        # A client reads the Drive link of its own projects, the same one the studio set.
        assert {row['id']: row['drive_url'] for row in rows('projects', 'select=id,drive_url', token=token)} == {pid: url for pid, url in drive_links.items() if pid in {row['id'] for row in fixture['projects'] if row['client_id'] == client['id']}}, 'Client Drive links differ'
        for table, column in (('design_boards', 'id'), ('design_versions', 'id'), ('design_version_miro_links', 'version_id'), ('project_assignments', 'project_id'), ('internal_comments', 'id')):
            assert rows(table, 'select=' + column, token=token) == [], 'Client read leaked internal rows: ' + table
        for asset in [row for row in fixture['brand_assets'] if row['client_id'] == client['id']]:
            expected_bytes = brand_asset_bytes(asset)
            actual = request('/storage/v1/object/authenticated/brand-assets/' + asset['storage_path'], token)
            assert actual == expected_bytes, 'Brand fixture bytes differ'
            # A brand product reference belongs to no deliverable, so it holds the documented
            # format-free canvas instead of a shape that was never ordered.
            if asset['kind'].startswith('product'): assert png_pixel_size(actual) == FORMAT_FREE_SIZE, 'Brand product reference is not the documented format-free size'
            downloaded += 1
        own_projects = {project['id'] for project in projects if project['client_id'] == client['id']}
        client_covers = {row['project_id']: row for row in rows('project_covers', 'select=project_id,storage_path,client_visible', token=token)}
        assert set(client_covers) == {pid for pid in own_projects if covers[pid]['client_visible']}, 'Client cover visibility differs from its client versions'
        for pid in own_projects:
            path = covers[pid]['storage_path']
            if covers[pid]['client_visible']:
                assert request('/storage/v1/object/authenticated/project-covers/' + path, token) == cover_bytes[pid]
                downloaded += 1
                continue
            try:
                request('/storage/v1/object/authenticated/project-covers/' + path, token)
                raise AssertionError('Client downloaded a hidden cover')
            except urllib.error.HTTPError as error:
                assert error.code in (400, 403, 404)
                error.close()
        for delivery in rows('delivery_files', token=token):
            actual = request('/storage/v1/object/authenticated/delivery-files/' + delivery['storage_path'], token)
            assert actual.startswith(b'%PDF-') and len(actual) == delivery['file_size']
            downloaded += 1
    downloaded += len(cover_bytes)
    assert downloaded == brand_files + cover_files + visible_cover_files + delivery_files, 'Downloaded file total does not match the fixture dataset'
    evidence = {'result': 'PASS', 'api_url': expected, 'clients': 10, 'projects': 25, 'service_types': 20, 'formats': 25, 'multiple_deliverable_projects': len(multi), 'product_records': sum(len(row['content']['items']) for row in products), 'brand_templates': 70, 'design_boards': len(boards), 'rounds': len(rounds), 'client_versions': len(versions), 'rounds_by_status': dict(sorted(Counter(row['status'] for row in rounds).items())), 'client_versions_by_decision': dict(sorted(Counter(row['status'] for row in reviews.values()).items())), 'drive_links': sum(1 for url in drive_links.values() if url), 'covers': len(covers), 'client_visible_covers': sum(1 for row in covers.values() if row['client_visible']), 'verified_actual_file_downloads': downloaded, 'client_logins_and_tenant_checks': 10, 'agency_and_both_designer_project_scope': True, 'designer_board_isolation': True, 'no_designer_names_in_client_rows': True, 'credit_ledger_reconciled': True, 'all_project_briefings_and_questions_valid': True, 'fixture_manifest_sha256': hashlib.sha256((ROOT / 'supabase/fixtures.json').read_bytes()).hexdigest()}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
