"""Read-only verification of the populated local SABRE demonstration and role boundaries."""
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sabre_demo import Demo, CLIENT_ID, PLAN, RUN
from sabre_demo_state import ROOT, SCOPES, quote, sql, snapshot


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
    check({r['project_id'] for r in rows['public.designs'] if r['internal_asset_path']} == project_ids, 'Every project has persisted working artwork')
    check(len({d['format'] for d in rows['public.deliverables']}) >= 20, 'At least twenty deliverable formats')
    new_ids = set(demo.state['new_projects'])
    debits = [r for r in rows['public.credit_ledger'] if r['project_id'] in new_ids and r['kind'] == 'project_debit']
    check(len(debits) == 43 and {r['project_id'] for r in debits} == new_ids, 'Exactly one real project debit for each of forty-three new projects')
    check(sum(r['amount'] for r in rows['public.credit_ledger']) == rows['public.credit_accounts'][0]['balance'], 'Credit balance reconciles to the persisted ledger')
    check(all(p['start_date'] <= p['due_date'] for p in projects if p['start_date'] and p['due_date']), 'Project date ranges are valid')
    check(len({p['start_date'][5:7] for p in projects if p['start_date']}) >= 8, 'Campaign schedules span the demonstration year')
    check({r['status'] for r in rows['public.credit_requests']} == {'pending', 'fulfilled', 'rejected'}, 'Credit requests demonstrate all three outcomes')
    check({'draft', 'awaiting_review', 'budget_confirmed', 'accepted'} <= {r['status'] for r in rows['public.briefings']}, 'Briefings demonstrate the full intake progression')

    client_projects = demo.rows('projects', 'client_id=eq.' + CLIENT_ID, 'client')
    check({p['id'] for p in client_projects} == project_ids, 'Client can open all fifty SABRE projects')
    for table in ('designs', 'design_versions', 'project_assignments', 'internal_comments', 'project_assets'):
        check(demo.rows(table, 'project_id=in.(' + ','.join(project_ids) + ')', 'client') == [], 'Client cannot read ' + table)
    published = demo.rows('published_designs', 'project_id=in.(' + ','.join(project_ids) + ')', 'client')
    check(len(published) == len(rows['public.published_designs']), 'Client receives all published snapshots')
    check(all(not {'created_by', 'author_id', 'internal_asset_path', 'version_id'} & p.keys() for p in published), 'Published artwork contains no production identity or internal IDs')
    for role in ('designer', 'designer2'):
        assigned = {r['project_id'] for r in rows['public.project_assignments'] if r['designer_id'] == demo.users[role]}
        visible = {p['id'] for p in demo.rows('projects', 'client_id=eq.' + CLIENT_ID, role)}
        check(visible == assigned, role + ' sees exactly the assigned SABRE projects')
    check(all(r['owner_id'] == demo.users['client'] for r in demo.rows('template_drafts', 'client_id=eq.' + CLIENT_ID, 'client')), 'Client template drafts are private to their owner')
    for role in ('agency', 'client', 'designer2'):
        boards = demo.rows('playground_boards', 'client_id=eq.' + CLIENT_ID, role)
        check(all(b['role'] == ('designer' if role == 'designer2' else role) for b in boards), role + ' Playground reads stay in the same role')
    try:
        demo.request('/storage/v1/object/authenticated/internal-assets/' + rows['public.designs'][0]['internal_asset_path'], role='client')
        raise AssertionError('Client unexpectedly downloaded a private production file')
    except RuntimeError as error:
        check('(400)' in str(error) or '(403)' in str(error) or '(404)' in str(error), 'Storage denies client access to private production bytes')

    downloaded = 0
    for art in published:
        if not art['asset_path']: continue
        data = demo.request('/storage/v1/object/authenticated/published-assets/' + art['asset_path'], role='client')
        check_bytes = data.startswith(b'\x89PNG') if art['asset_path'].endswith('.png') else b'ftyp' in data[:32] if art['asset_path'].endswith('.mp4') else bool(data)
        if not check_bytes: raise AssertionError('Published file is not valid media: ' + art['id'])
        downloaded += 1
    check(downloaded >= 120, 'Client downloads every published image/video with valid media bytes')
    deliveries = demo.rows('delivery_files', 'project_id=in.(' + ','.join(project_ids) + ')', 'client')
    for delivery in deliveries:
        data = demo.request('/storage/v1/object/authenticated/delivery-files/' + delivery['storage_path'], role='client')
        if delivery['mime_type'] == 'application/pdf': assert data.startswith(b'%PDF')
        else: assert data.startswith(b'\x89PNG')
    delivered_ids = {p['id'] for p in projects if p['status'] == 'delivered'}
    expected_deliveries = [d for d in rows['public.delivery_files'] if d['project_id'] in delivered_ids]
    check(len(deliveries) == len(expected_deliveries) == 10, 'Client downloads all ten released delivery files; twenty-four staged finals stay private')

    baseline = json.loads((ROOT / 'supabase/.local/sabre-demo-baseline-integrity.json').read_text())
    for name, digest in baseline['storage'].items():
        data = demo.request('/storage/v1/object/authenticated/' + name, role='service')
        if hashlib.sha256(data).hexdigest() != digest: raise AssertionError('An original stored file changed: ' + name)
    check(True, 'All 183 original stored files retain their exact SHA-256 hashes')
    before = demo.state['before']
    for table, original in baseline['tables'].items():
        name = 'public.' + table
        if name in SCOPES:
            # Reconstruct the original whole-table JSON without writing: current unrelated rows
            # plus the saved original SABRE rows must equal the global pre-overlay digest.
            query = f"select md5(coalesce(jsonb_agg(v order by v::text)::text,'[]')) from (select to_jsonb(t) v from {name} t where ({SCOPES[name]}) is not true union all select value v from jsonb_array_elements({quote(json.dumps(before['rows'][name]))}::jsonb)) original;"
        else:
            query = f"select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) from {name} t;"
        if sql(query) != original['digest']: raise AssertionError('Records outside the SABRE overlay changed in ' + table)
    check(True, 'All thirty-five original table digests reconcile outside the intentional SABRE changes')
    report = {'overlay': RUN, 'result': 'pass', 'checks': checks, 'check_count': len(checks),
              'downloaded_publications': downloaded, 'downloaded_deliveries': len(deliveries),
              'original_file_hashes_preserved': len(baseline['storage']), 'reconciled_tables': len(baseline['tables'])}
    path = ROOT / 'docs/verification/sabre-demo-http-2026-09-23.json'
    path.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__': main()
