"""Read-only acceptance checks for the exact local fixture dataset and actual private files."""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import urllib.error
import urllib.request
from fixture_media import FORMAT_FREE_SIZE, format_pixel_size, png_card, png_pixel_size, monogram_svg, monogram_png, monogram_pdf, simple_pdf

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
    assert {row['status'] for row in projects} == {'planned', 'in_progress', 'internal_review', 'client_review', 'changes_requested', 'approved', 'delivered'}
    deliverables, versions, designs = rows('deliverables'), rows('design_versions'), rows('designs')
    # Artwork carries the true canvas of the format its deliverable was ordered in, so the board and the
    # project canvas show every piece in the shape it will really be delivered in. The expected size is
    # derived from the format catalog; the actual size is read from each downloaded file's IHDR header
    # further down, never from the manifest that asked for it.
    deliverable_of_version = {row['id']: row['deliverable_id'] for row in versions}
    format_of_deliverable = {row['id']: row['format'] for row in deliverables}
    artwork_size = {row['id']: format_pixel_size(formats[format_of_deliverable[deliverable_of_version[row['version_id']]]]) for row in designs if row['internal_asset_path']}
    multi = [project for project, count in Counter(row['project_id'] for row in deliverables).items() if count >= 2]
    assert len(multi) >= 4, 'At least four projects need multiple deliverables'
    # A multi-deliverable project may legitimately still be on its first version throughout — SABRE's
    # Instagram Ads is — so the guarantee is that at least four of them carry V1 and V2 on every
    # deliverable, not that all of them do.
    fully_versioned = [project for project in multi
                       if all({1, 2} <= {row['version_number'] for row in versions if row['deliverable_id'] == deliverable['id']}
                              for deliverable in [row for row in deliverables if row['project_id'] == project])]
    assert len(fully_versioned) >= 4, 'At least four multi-deliverable projects need V1 and V2 on every deliverable'
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

    # Artwork coverage, stated per role because the two channels are filled by different events.
    # Production starts a project's artwork; publication, and only publication, hands a copy to the
    # client. A project still in planning has no design at all and therefore carries no image.
    started = {row['id'] for row in projects if row['status'] != 'planned'}
    internal_artwork = {row['project_id'] for row in designs if row['internal_asset_path']}
    published_artwork = {row['project_id'] for row in rows('published_designs') if row['asset_path']}
    assert internal_artwork == started, 'Every project past planning needs internal artwork'
    assert published_artwork == {row['project_id'] for row in publications}, 'Every published project shows the client real artwork'

    for email in ['studio@dawes.local', 'designer@dawes.local', 'designer2@dawes.local']:
        session = request('/auth/v1/token?grant_type=password', payload={'email': email, 'password': env['DEMO_PASSWORD']})
        token = session['access_token']
        actual = {row['id'] for row in rows('projects', token=token)}
        expected_projects = {row['id'] for row in projects} if email == 'studio@dawes.local' else {row['project_id'] for row in rows('project_assignments') if row['designer_id'] == session['user']['id']}
        assert actual == expected_projects, 'Agency/designer project list differs from authorization'
        if email != 'studio@dawes.local':
            assert rows('briefings', token=token) == [] and rows('credit_ledger', token=token) == []
            assert rows('client_comments', token=token) == []

    # The file total below is an arithmetic statement about the dataset, not a magic number: each
    # term is the count of one kind of fixture file, and each is checked against the manifest first
    # so a term that drifts fails where it is defined rather than as an unexplained total.
    brand_files = 70            # seven brand files for each of the ten clients
    working_files = 27          # one private production PNG per version-1 design on the 22 started projects
    publication_files = 18      # the sanitized copy of each version-1 design the agency has actually published
    delivery_files = 1          # the single approved delivery PDF
    assert len(fixture['brand_assets']) == brand_files, 'Brand fixture count moved'
    assert len(fixture['working_assets']) == working_files, 'Production artwork count moved'
    assert sum(1 for row in fixture['working_assets'] if row['published_path']) == publication_files, 'Published artwork count moved'

    downloaded = 0
    for client in fixture['clients']:
        session = request('/auth/v1/token?grant_type=password', payload={'email': client['slug'] + '@client.dawes.local', 'password': env['DEMO_PASSWORD']})
        token = session['access_token']
        client_project_count = sum(1 for row in fixture['projects'] if row['client_id'] == client['id'])
        assert len(rows('clients', token=token)) == 1 and len(rows('projects', token=token)) == client_project_count
        for table in ('designs', 'design_versions', 'project_assignments', 'internal_comments'):
            assert rows(table, token=token) == [], 'Client read leaked internal rows: ' + table
        for asset in [row for row in fixture['brand_assets'] if row['client_id'] == client['id']]:
            if asset['kind'] == 'mark': expected_bytes = monogram_svg(asset['client_name'])
            elif asset['kind'] == 'mark-png': expected_bytes = monogram_png(asset['client_name'])
            elif asset['kind'] == 'mark-pdf': expected_bytes = monogram_pdf(asset['client_name'])
            elif asset['kind'] == 'guidelines': expected_bytes = simple_pdf(asset['client_name'] + ' / Sample brand guidelines')
            else: expected_bytes = png_card(asset['index'] + int(asset['kind'][-1]), asset['width'], asset['height'])
            actual = request('/storage/v1/object/authenticated/brand-assets/' + asset['storage_path'], token)
            assert actual == expected_bytes, 'Brand fixture bytes differ'
            # A brand product reference belongs to no deliverable, so it holds the documented
            # format-free canvas instead of a shape that was never ordered.
            if asset['kind'].startswith('product'): assert png_pixel_size(actual) == FORMAT_FREE_SIZE, 'Brand product reference is not the documented format-free size'
            downloaded += 1
        for asset in [row for row in fixture['working_assets'] if row['project_id'] in {project['id'] for project in projects if project['client_id'] == client['id']}]:
            internal = request('/storage/v1/object/authenticated/internal-assets/' + asset['source_path'])
            expected_size = artwork_size[asset['design_id']]
            assert (asset['width'], asset['height']) == expected_size, 'Manifest artwork size differs from the deliverable format'
            assert internal == png_card(asset['index'], asset['width'], asset['height'], internal=True) and b'Author' in internal
            assert png_pixel_size(internal) == expected_size, 'Internal artwork is not rendered at the size of its format'
            downloaded += 1
            try:
                request('/storage/v1/object/authenticated/internal-assets/' + asset['source_path'], token)
                raise AssertionError('Client downloaded private working bytes')
            except urllib.error.HTTPError as error:
                assert error.code in (400, 403, 404)
                error.close()
            # Unpublished production work has no client-readable copy at all, which is the point.
            if not asset['published_path']: continue
            actual = request('/storage/v1/object/authenticated/published-assets/' + asset['published_path'], token)
            assert actual == png_card(asset['index'], asset['width'], asset['height']) and b'Author' not in actual
            assert png_pixel_size(actual) == expected_size, 'Published artwork is not rendered at the size of its format'
            downloaded += 1
        for delivery in rows('delivery_files', token=token):
            actual = request('/storage/v1/object/authenticated/delivery-files/' + delivery['storage_path'], token)
            assert actual.startswith(b'%PDF-') and len(actual) == delivery['file_size']
            downloaded += 1
    assert downloaded == brand_files + working_files + publication_files + delivery_files, 'Downloaded file total does not match the fixture dataset'
    evidence = {'result': 'PASS', 'api_url': expected, 'clients': 10, 'projects': 25, 'service_types': 20, 'formats': 25, 'multiple_deliverable_projects': len(multi), 'multiple_deliverable_projects_with_v1_v2': len(fully_versioned), 'product_records': sum(len(row['content']['items']) for row in products), 'brand_templates': 70, 'verified_actual_file_downloads': downloaded, 'projects_with_internal_artwork': len(internal_artwork), 'projects_with_published_artwork': len(published_artwork), 'artwork_pixel_sizes_match_deliverable_format': True, 'distinct_artwork_pixel_sizes': len(set(artwork_size.values())), 'client_logins_and_tenant_checks': 10, 'agency_and_both_designer_project_scope': True, 'credit_ledger_reconciled': True, 'all_project_briefings_and_questions_valid': True, 'all_publications_have_client_pins': True, 'fixture_manifest_sha256': hashlib.sha256((ROOT / 'supabase/fixtures.json').read_bytes()).hexdigest()}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
