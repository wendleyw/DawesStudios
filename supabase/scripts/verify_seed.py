"""Read-only acceptance checks for the exact local fixture dataset and actual private files."""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import urllib.error
import urllib.request
from fixture_media import png_card, monogram_svg, monogram_png, monogram_pdf, simple_pdf

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    workdir = args.workdir.resolve()
    if workdir not in (ROOT, ROOT / 'supabase/.restore-drill'):
        raise SystemExit('Verification is restricted to the two isolated local projects.')
    env = dict(line.split('=', 1) for line in (workdir / 'supabase/.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
    expected = 'http://127.0.0.1:55421' if workdir == ROOT else 'http://127.0.0.1:55521'
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
    assert {row['id'] for row in projects} == {row['id'] for row in fixture['projects']}, 'Expected exactly the 20 reference projects'
    assert set(Counter(row['client_id'] for row in projects).values()) == {2}, 'Expected two projects per client'
    assert {row['service_type'] for row in projects} == {row['id'] for row in rows('service_catalog')}, 'All 20 services must be represented'
    assert len(rows('format_catalog')) == 25
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
    assert {row['status'] for row in projects} == {'planned', 'in_progress', 'internal_review', 'client_review', 'changes_requested', 'approved', 'delivered'}
    deliverables, versions, designs = rows('deliverables'), rows('design_versions'), rows('designs')
    multi = [project for project, count in Counter(row['project_id'] for row in deliverables).items() if count >= 2]
    assert len(multi) >= 4, 'At least four projects need multiple deliverables'
    for project in multi:
        for deliverable in [row for row in deliverables if row['project_id'] == project]:
            assert {1, 2} <= {row['version_number'] for row in versions if row['deliverable_id'] == deliverable['id']}, 'Each deliverable on representative projects needs V1 and V2'
    assert max(Counter(row['version_id'] for row in designs).values()) >= 2, 'A version must contain multiple designs'
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
    publications = rows('published_versions')
    assert {'studio', 'client'} <= {row['author_kind'] for row in comments}
    assert {row['id'] for row in publications} <= {row['publication_id'] for row in comments if row['pin_x'] is not None and row['pin_y'] is not None}
    assert rows('internal_comments'), 'Internal channel examples are required'
    assert {row['id'] for row in projects} <= {row['project_id'] for row in comments}, 'Every project has meaningful client activity'

    for email in ['studio@dawes.local', 'designer@dawes.local', 'designer2@dawes.local']:
        session = request('/auth/v1/token?grant_type=password', payload={'email': email, 'password': env['DEMO_PASSWORD']})
        token = session['access_token']
        actual = {row['id'] for row in rows('projects', token=token)}
        expected_projects = {row['id'] for row in projects} if email == 'studio@dawes.local' else {row['project_id'] for row in rows('project_assignments') if row['designer_id'] == session['user']['id']}
        assert actual == expected_projects, 'Agency/designer project list differs from authorization'
        if email != 'studio@dawes.local':
            assert rows('briefings', token=token) == [] and rows('credit_ledger', token=token) == []
            assert rows('client_comments', token=token) == []

    downloaded = 0
    for client in fixture['clients']:
        session = request('/auth/v1/token?grant_type=password', payload={'email': client['slug'] + '@client.dawes.local', 'password': env['DEMO_PASSWORD']})
        token = session['access_token']
        assert len(rows('clients', token=token)) == 1 and len(rows('projects', token=token)) == 2
        for table in ('designs', 'design_versions', 'project_assignments', 'internal_comments'):
            assert rows(table, token=token) == [], 'Client read leaked internal rows: ' + table
        for asset in [row for row in fixture['brand_assets'] if row['client_id'] == client['id']]:
            if asset['kind'] == 'mark': expected_bytes = monogram_svg(asset['client_name'])
            elif asset['kind'] == 'mark-png': expected_bytes = monogram_png(asset['client_name'])
            elif asset['kind'] == 'mark-pdf': expected_bytes = monogram_pdf(asset['client_name'])
            elif asset['kind'] == 'guidelines': expected_bytes = simple_pdf(asset['client_name'] + ' / Sample brand guidelines')
            else: expected_bytes = png_card(asset['index'] + int(asset['kind'][-1]))
            actual = request('/storage/v1/object/authenticated/brand-assets/' + asset['storage_path'], token)
            assert actual == expected_bytes, 'Brand fixture bytes differ'
            downloaded += 1
        for asset in [row for row in fixture['working_assets'] if row['project_id'] in {project['id'] for project in projects if project['client_id'] == client['id']}]:
            actual = request('/storage/v1/object/authenticated/published-assets/' + asset['published_path'], token)
            assert actual == png_card(asset['index']) and b'Author' not in actual
            downloaded += 1
            try:
                request('/storage/v1/object/authenticated/internal-assets/' + asset['source_path'], token)
                raise AssertionError('Client downloaded private working bytes')
            except urllib.error.HTTPError as error:
                assert error.code in (400, 403, 404)
                error.close()
            internal = request('/storage/v1/object/authenticated/internal-assets/' + asset['source_path'])
            assert internal == png_card(asset['index'], internal=True) and b'Author' in internal
            downloaded += 1
        for delivery in rows('delivery_files', token=token):
            actual = request('/storage/v1/object/authenticated/delivery-files/' + delivery['storage_path'], token)
            assert actual.startswith(b'%PDF-') and len(actual) == delivery['file_size']
            downloaded += 1
    assert downloaded == 79, 'Expected 70 brand files, four working/publication pairs and one delivery'
    evidence = {'result': 'PASS', 'api_url': expected, 'clients': 10, 'projects': 20, 'service_types': 20, 'formats': 25, 'multiple_deliverable_projects_with_v1_v2': len(multi), 'product_records': sum(len(row['content']['items']) for row in products), 'brand_templates': 70, 'verified_actual_file_downloads': downloaded, 'client_logins_and_tenant_checks': 10, 'agency_and_both_designer_project_scope': True, 'credit_ledger_reconciled': True, 'all_project_briefings_and_questions_valid': True, 'all_publications_have_client_pins': True, 'fixture_manifest_sha256': hashlib.sha256((ROOT / 'supabase/fixtures.json').read_bytes()).hexdigest()}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
