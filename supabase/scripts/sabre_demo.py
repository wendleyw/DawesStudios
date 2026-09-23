"""Prepare, populate, inspect and safely remove the local SABRE agency demonstration."""
import argparse
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

from sabre_demo_state import (ROOT, CLIENT_ID, STATE_PATH, STATE_DIR, SCOPES, assert_local,
                             snapshot, save, fingerprint, difference, rollback_sql, sql)

SOURCE = ROOT / 'supabase/demo/sabre'
PLAN = json.loads((SOURCE / 'plan.json').read_text())
RUN = PLAN['id']
CATALOG = json.loads((ROOT / 'apps/web/features/briefings/service-catalog.json').read_text())
FORMATS = {row['id']: row for row in CATALOG['formats']}
SERVICES = {row['id']: row for row in CATALOG['types']}
DOC_FORMATS = {'a4', 'a5', 'letter', 'guidelines', 'brand-kit', 'direction', 'research', 'shot-list', 'dieline', 'slides', 'custom', 'custom-mm'}


def uid(key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, RUN + ':' + key))


class Demo:
    def __init__(self):
        env = dict(line.split('=', 1) for line in (ROOT / 'supabase/.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
        self.api = env['SUPABASE_URL']
        assert_local(self.api)
        self.anon = env['SUPABASE_ANON_KEY']
        self.service = env['SUPABASE_SERVICE_ROLE_KEY']
        self.tokens = {'service': self.service}
        self.users = {}
        for role, email in [('agency', 'studio@dawes.local'), ('client', 'sabre@client.dawes.local'), ('designer', 'designer@dawes.local'), ('designer2', 'designer2@dawes.local')]:
            session = self.request('/auth/v1/token?grant_type=password', {'email': email, 'password': env['DEMO_PASSWORD']}, role='service')
            self.tokens[role] = session['access_token']
            self.users[role] = session['user']['id']
        self.state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else None

    def request(self, path, data=None, *, role='agency', method=None, mime='application/json', headers=None, media=False):
        body = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
        request = urllib.request.Request(('http://127.0.0.1:55430' if media else self.api) + path, data=body,
            method=method or ('POST' if data is not None else 'GET'), headers={
                'apikey': self.anon, 'Authorization': 'Bearer ' + self.tokens[role], 'Content-Type': mime,
                'Origin': 'http://localhost:3003', **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                content = response.read()
                return json.loads(content) if content and 'json' in response.headers.get('Content-Type', '') else content or None
        except urllib.error.HTTPError as error:
            try:
                payload = json.loads(error.read())
                message = payload.get('message') or payload.get('error') or payload.get('msg') or str(error.code)
            except (ValueError, AttributeError):
                message = str(error.code)
            raise RuntimeError(f'{method or "request"} {path.split("?")[0]} failed ({error.code}): {message}') from None

    def rows(self, table, query='', role='agency'):
        return self.request('/rest/v1/' + table + '?' + query, role=role) or []

    def rpc(self, name, data, role='agency'):
        return self.request('/rest/v1/rpc/' + name, data, role=role)

    def insert(self, table, data, role='agency'):
        return self.request('/rest/v1/' + table, data, role=role, headers={'Prefer': 'return=representation'})[0]

    def once(self, key, operation):
        if key not in self.state['steps']:
            self.state['steps'][key] = operation()
            save(self.state)
        return self.state['steps'][key]

    def upload(self, bucket, scope, key, file, role='agency', mime='image/png'):
        suffix = '.raw' if mime == 'video/mp4' else Path(file).suffix
        object_path = scope + '/' + uid(key) + suffix
        def operation():
            self.request('/storage/v1/object/' + bucket + '/' + object_path, Path(file).read_bytes(), role=role, mime=mime)
            return object_path
        return self.once('upload:' + key, operation)

    def start(self, canary):
        if self.state:
            if self.state['id'] != RUN or self.state['canary'] != canary:
                raise RuntimeError('A different demonstration is active; inspect its saved state first.')
            return
        before = snapshot()
        if len(before['rows']['public.projects']) != 7:
            raise RuntimeError('Expected the seven existing SABRE projects before this overlay.')
        self.state = {'id': RUN, 'canary': canary, 'phase': 'preparing', 'before': before, 'steps': {}, 'new_projects': [], 'existing_projects': [], 'jobs': []}
        save(self.state)

    def prepare(self, canary=False):
        self.start(canary)
        if self.state.get('jobs'):
            return
        projects = [dict(p) for p in (PLAN['projects'][:1] if canary else PLAN['projects'])]
        if not canary:
            mappings = {'Social Launch': (0, 'client_review'), 'Product Story': (5, 'client_review'), 'Instagram Ads': (1, 'changes_requested'), 'Campaign Landing Page': (2, 'client_review'), 'Email Banner': (3, 'approved'), 'Brand Guidelines': (6, 'internal_review'), 'Stationery': (7, 'in_progress')}
            for old in self.state['before']['rows']['public.projects']:
                campaign, stage = mappings.get(old['title'], (0, 'client_review'))
                ds = [dict(d) for d in self.state['before']['rows']['public.deliverables'] if d['project_id'] == old['id']]
                projects.append(dict(key='existing-' + old['id'], id=old['id'], title=old['title'], campaign=campaign, stage=stage, service=old['service_type'], designs=2, revision=False, motion=False, deliverables=ds, existing=True))
        jobs = []
        for pi, p in enumerate(projects):
            theme = PLAN['campaigns'][p['campaign']]
            p['artwork'] = []
            for di, d in enumerate(p['deliverables']):
                fmt = FORMATS[d['format']]
                w, h = d.get('width'), d.get('height')
                if fmt.get('unit') == 'mm':
                    w, h = round((w or 210) * 150 / 25.4), round((h or 297) * 150 / 25.4)
                elif not w or not h:
                    w, h = (1240, 1754) if d['format'] in DOC_FORMATS else (1080, 1080)
                document = d['format'] in DOC_FORMATS
                layout = 'web' if d['format'] in ('desktop', 'mobile') else 'email' if d['format'] == 'email' else 'guide' if document and w < h else None
                versions = []
                for vi in range(2 if p['revision'] else 1):
                    variant_jobs = []
                    for ai in range(p['designs']):
                        key = f'{p["key"]}-d{di}-v{vi}-a{ai}'
                        job = dict(key=key, image=theme['image'], campaign=theme['title'], headline=theme['headline'], body=theme['body'],
                            width=w, height=h, variant=pi + vi + ai, number=pi + 1, document=document, motion=p['motion'] and di == 0 and ai == 0,
                            eyebrow=d['name'] if document else theme['title'], cta='Explore the collection')
                        if layout: job['layout'] = layout
                        if vi: job['body'] = 'A fresh point of view, with room for what matters.'
                        jobs.append(job)
                        variant_jobs.append(key)
                    versions.append(variant_jobs)
                p['artwork'].append(versions)
        self.state['jobs'] = jobs
        self.state['project_plan'] = projects
        save(self.state)
        self.write_jobs()
        print(f'Prepared {len(projects)} projects and {len(jobs)} distinct artwork layouts.', flush=True)

    def write_jobs(self):
        path = STATE_DIR / 'render-jobs.json'
        path.write_text(json.dumps(self.state['jobs'], indent=2) + '\n')
        return path

    def render(self):
        subprocess.run(['node', str(SOURCE / 'render.mjs'), str(self.write_jobs())], cwd=ROOT, check=True)

    def comment(self, key, project, body, role, channel, version=None, design=None, pin=False, time=None):
        payload = dict(p_project_id=project, p_channel=channel, p_body=body, p_version_id=version, p_design_id=design,
                       p_pin_x=0.56 if pin else None, p_pin_y=0.29 if pin else None, p_pin_t=time,
                       p_idempotency_key=RUN + ':' + key)
        return self.once('comment:' + key, lambda: self.rpc('post_comment', payload, role))

    def create_briefing(self, p, campaign, key=None):
        key = key or p['key']
        due = PLAN['campaigns'][p['campaign']]['end']
        answers = {'content': 'A mix of both', 'duration': '15 seconds', 'production': 'Animation / motion design',
            'pages': '3', 'sections': 'Campaign hero, product introduction, community story and footer.',
            'print': 'Single-sided concept, 3 mm bleed to be added for final print production.',
            'scope': 'Campaign creative direction, channel planning and a consistent visual system.',
            'task': 'Generate fictional product and lifestyle photography for campaign exploration.',
            'template': 'I need help defining it', 'brand': 'Refresh an existing brand'}
        questions = {q['id']: answers[q['id']] for q in SERVICES[p['service']]['questions']}
        payload = dict(
            p_client_id=CLIENT_ID, p_campaign_id=campaign, p_title=p['title'], p_service_type=p['service'],
            p_overview=p['overview'], p_goals=p['goals'], p_direction={'demoOverlay': RUN, 'questions': questions, 'audience': 'Adults looking for thoughtfully designed everyday essentials.', 'notes': 'Fictional demonstration content. Generated concept imagery; no product-performance claims.'},
            p_deliverables=p['deliverables'], p_due_date=due, p_estimated_credits=p['credits'])
        briefing = self.once('brief:' + key, lambda: self.rpc('save_briefing', payload, 'client'))
        current = self.rows('briefings', 'id=eq.' + briefing, 'client')[0]
        if current['status'] == 'draft' and (current['direction'] != payload['p_direction'] or current['requested_deliverables'] != p['deliverables']):
            self.rpc('save_briefing', {**payload, 'p_briefing_id': briefing, 'p_expected_updated_at': current['updated_at']}, 'client')
        first = p.get('artwork', [[[None]]])[0][0][0]
        if first:
            file = self.artworks[first]['png']
            path = self.upload('briefing-files', briefing, key + ':reference', file, 'client')
            self.once('attachment:' + key, lambda: self.rpc('add_briefing_attachment', dict(p_briefing_id=briefing, p_name='Campaign visual reference.png', p_storage_path=path, p_mime_type='image/png', p_file_size=Path(file).stat().st_size), 'client'))
        return briefing

    def populate_project(self, p, index):
        key = p['key']
        theme = PLAN['campaigns'][p['campaign']]
        if p.get('existing'):
            project = p['id']
            if project not in self.state['existing_projects']:
                self.state['existing_projects'].append(project)
                save(self.state)
        else:
            campaign = self.once('campaign:' + theme['key'], lambda: self.insert('campaigns', dict(id=uid(theme['key']), client_id=CLIENT_ID, title=theme['title'], description=theme['description'], start_date=theme['start'], end_date=theme['end']))['id'])
            briefing = self.create_briefing(p, campaign)
            self.once('submit-brief:' + key, lambda: self.rpc('submit_briefing', {'p_briefing_id': briefing}, 'client'))
            self.once('budget:' + key, lambda: self.rpc('confirm_briefing_budget', {'p_briefing_id': briefing, 'p_credits': p['credits'], 'p_note': 'Demonstration budget covering the listed formats and review rounds.'}))
            # Acceptance starts projects today. Historical demo dates are backfilled only after
            # the real atomic acceptance/debit workflow has completed successfully.
            self.once('accept-date:' + key, lambda: sql(f"update public.briefings set due_date=greatest(due_date,current_date) where id='{uuid.UUID(briefing)}' and client_id='{CLIENT_ID}' and status='budget_confirmed';"))
            project = self.once('accept:' + key, lambda: self.rpc('accept_briefing', {'p_briefing_id': briefing}))
            if project not in self.state['new_projects']:
                self.state['new_projects'].append(project)
                save(self.state)
            start = date.fromisoformat(theme['start']) + timedelta(days=(index % 6) * 3)
            due = min(start + timedelta(days=21 + index % 18), date.fromisoformat(theme['end']))
            self.once('dates:' + key, lambda: self.request('/rest/v1/projects?id=eq.' + project,
                {'start_date': str(start), 'due_date': str(due)}, method='PATCH'))
            self.once('brief-date:' + key, lambda: sql(f"update public.briefings set due_date='{due}' where id='{uuid.UUID(briefing)}' and client_id='{CLIENT_ID}';"))
        producer = 'designer' if index % 2 == 0 else 'designer2'
        self.once('assign:' + key, lambda: self.rpc('assign_designer', {'p_project_id': project, 'p_designer_id': self.users[producer]}))
        deliverables = self.rows('deliverables', 'project_id=eq.' + project + '&order=sort_order')
        self.comment(key + ':internal', project, 'Demo production note: keep the headline hierarchy consistent across formats and check the safe area before the studio review.', producer, 'internal')
        final_publications = []
        deliver_files = []
        for di, deliverable in enumerate(deliverables):
            for vi, keys in enumerate(p['artwork'][di]):
                version_key = f'{key}:d{di}:v{vi}'
                version = self.once('version:' + version_key, lambda: self.rpc('create_design_version', {
                    'p_deliverable_id': deliverable['id'],
                    'p_notes': f'Demo creative round {vi + 1}: ' + ('Refined spacing and a quieter supporting message.' if vi else 'Explore the campaign through photography, clear type and generous spacing.')}, producer))
                first_design = None
                for ai, artwork_key in enumerate(keys):
                    art = self.artworks[artwork_key]
                    design_key = version_key + f':a{ai}'
                    path = self.upload('internal-assets', project, design_key, art['png'], producer)
                    design = self.once('design:' + design_key, lambda: self.rpc('add_design', {'p_version_id': version,
                        'p_title': f'{deliverable["name"]} — Direction {chr(65 + ai)}',
                        'p_content': {'headline': theme['headline'].replace('\n', ' '), 'body': theme['body'], 'background': '#f4f0e7', 'foreground': '#143b30', 'demoOverlay': RUN},
                        'p_internal_asset_path': path}, producer))
                    if first_design is None: first_design = design
                    if art['video']:
                        raw = self.upload('internal-assets', project, design_key + ':motion', art['video'], producer, 'video/mp4')
                        video = self.once('sanitize:' + design_key, lambda: self.request('/designs/sanitize-video', {'projectId': project, 'rawPath': raw, 'mimeType': 'video/mp4'}, role=producer, media=True))
                        self.once('video-design:' + design_key, lambda: self.rpc('add_design', {'p_version_id': version, 'p_title': 'Campaign motion — 15 second preview', 'p_internal_asset_path': video['path'], 'p_content': {'headline': theme['headline'].replace('\n', ' ')}}, producer))
                    if vi == len(p['artwork'][di]) - 1:
                        deliver_files.append((art['pdf'] or art['png'], deliverable['name'] + f' direction {chr(65 + ai)}'))
                self.comment(version_key + ':pin', project, 'Demo studio feedback: keep this detail aligned with the visual grid in every adaptation.', 'agency', 'internal', version, first_design, True)
                if p['stage'] == 'internal_review':
                    self.once('submit-version:' + version_key, lambda: self.rpc('submit_design_version', {'p_version_id': version}, producer))
                if p['stage'] in ('in_progress', 'internal_review'):
                    continue
                prepared = self.once('prepare:' + version_key, lambda: self.request('/publications/prepare', {'versionId': version}, media=True))
                publication = self.once('publish:' + version_key, lambda: self.rpc('publish_version', {
                    'p_version_id': version, 'p_release_note': f'Demo review: {p["title"]}. ' + ('Spacing refined after the first review.' if vi else 'Please review the composition and message across the requested formats.'),
                    'p_assets': prepared['assets'], 'p_idempotency_key': uid(version_key + ':publication')}))
                published = self.rows('published_designs', 'publication_id=eq.' + publication + '&order=sort_order')
                self.comment(version_key + ':client-pin', project, 'Demo client feedback: the image feels right. Please check the headline spacing in the narrow format.', 'client', 'client', publication, published[0]['id'], True)
                self.comment(version_key + ':reply', project, 'Demo studio reply: noted. We will carry the same spacing adjustment through the adaptations.', 'agency', 'client', publication)
                if vi < len(p['artwork'][di]) - 1:
                    self.once('review:' + version_key, lambda: self.rpc('review_publication', {'p_publication_id': publication, 'p_decision': 'changes_requested', 'p_feedback': 'Demo revision request: give the headline more breathing room and simplify the supporting copy.'}, 'client'))
                else:
                    final_publications.append(publication)
        for i, publication in enumerate(final_publications):
            decision = 'changes_requested' if p['stage'] == 'changes_requested' and i == 0 else 'approved'
            if p['stage'] in ('approved', 'delivered', 'changes_requested'):
                self.once('final-review:' + publication, lambda: self.rpc('review_publication', {'p_publication_id': publication, 'p_decision': decision, 'p_feedback': 'Demo approval: the message, composition and adaptations are ready.' if decision == 'approved' else 'Demo change request: increase spacing above the headline and retain the current image.'}, 'client'))
        if p['stage'] in ('approved', 'delivered'):
            for fi, (file, name) in enumerate(deliver_files):
                self.once(f'delivery:{key}:{fi}', lambda: self.request('/deliveries/prepare?projectId=' + project, Path(file).read_bytes(), media=True,
                    mime='application/pdf' if file.endswith('.pdf') else 'image/png', headers={'X-File-Name': urllib.parse.quote(name)}))
            if p['stage'] == 'delivered':
                self.once('complete:' + key, lambda: self.rpc('mark_project_delivered', {'p_project_id': project}))
        print(f'{index + 1:02}/{len(self.state["project_plan"])}  {p["title"]} — {p["stage"]}', flush=True)

    def apply(self, canary=False):
        self.prepare(canary)
        if self.state['phase'] == 'complete':
            self.status()
            return
        self.render()
        self.artworks = json.loads((STATE_DIR / 'rendered/index.json').read_text())
        self.state['phase'] = 'applying'
        save(self.state)
        self.once('allocation', lambda: self.rpc('adjust_credits', {'p_client_id': CLIENT_ID, 'p_amount': 500, 'p_description': 'Temporary SABRE demonstration credits', 'p_idempotency_key': RUN + ':allocation'}))
        for index, p in enumerate(self.state['project_plan']):
            self.populate_project(p, index)
        if not canary:
            from sabre_demo_extras import populate_extras
            populate_extras(self)
        self.state['after'] = snapshot()
        self.state['phase'] = 'complete'
        save(self.state)
        self.status()

    def status(self):
        current = snapshot()
        r = current['rows']
        def counts(rows, field):
            return {v: sum(row[field] == v for row in rows) for v in sorted({row[field] for row in rows})}
        report = {'client': 'SABRE', 'id': RUN, 'phase': self.state['phase'] if self.state else 'not applied',
            'projects': len(r['public.projects']), 'campaigns': len(r['public.campaigns']),
            'project_statuses': counts(r['public.projects'], 'status'), 'briefing_statuses': counts(r['public.briefings'], 'status'),
            'deliverables': len(r['public.deliverables']), 'formats': counts(r['public.deliverables'], 'format'),
            'working_versions': len(r['public.design_versions']), 'working_designs': len(r['public.designs']),
            'published_versions': len(r['public.published_versions']), 'published_designs': len(r['public.published_designs']),
            'reviews': counts(r['public.publication_reviews'], 'status'), 'internal_comments': len(r['public.internal_comments']),
            'client_comments': len(r['public.client_comments']), 'delivery_files': len(r['public.delivery_files']),
            'brand_assets': len(r['public.brand_assets']), 'templates': len(r['public.brand_templates']),
            'stored_files': len(current['storage']), 'credit_balance': r['public.credit_accounts'][0]['balance']}
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        (STATE_DIR / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
        return report

    def remove(self, dry_run=False):
        if not self.state or self.state['phase'] not in ('complete', 'removing'):
            raise RuntimeError('A completed demo snapshot is required for guarded removal.')
        before, after = self.state['before'], self.state['after']
        if self.state['phase'] == 'complete':
            current = snapshot()
            if fingerprint(current) != fingerprint(after):
                raise RuntimeError('SABRE changed after population. Removal stopped to preserve newer work; compare the saved before/after snapshots first.')
            changes = difference(before, after)
            print(json.dumps({table: {kind: len(rows) for kind, rows in change.items()} for table, change in changes.items() if any(change.values())}, indent=2))
            if dry_run: return
            self.state['phase'] = 'removing'
            save(self.state)
        if dry_run:
            return
        current_rows = snapshot()['rows']
        if fingerprint(current_rows) == fingerprint(after['rows']):
            sql(rollback_sql(before, after))
        elif fingerprint(current_rows) != fingerprint(before['rows']):
            raise RuntimeError('Removal found unexpected database changes; storage cleanup stopped.')
        old_paths = {(o['bucket'], o['path']) for o in before['storage']}
        added = [o for o in after['storage'] if (o['bucket'], o['path']) not in old_paths]
        for bucket in sorted({o['bucket'] for o in added}):
            paths = [o['path'] for o in added if o['bucket'] == bucket]
            for i in range(0, len(paths), 100):
                self.request('/storage/v1/object/' + bucket, {'prefixes': paths[i:i+100]}, role='service', method='DELETE')
        if fingerprint(snapshot()) != fingerprint(before):
            raise RuntimeError('Removal did not match the original SABRE snapshot; retain the state file for recovery.')
        archive = STATE_PATH.with_name('completed-canary.json' if self.state['canary'] else 'removed-demo.json')
        STATE_PATH.replace(archive)
        print(f'Restored the original SABRE records and removed {len(added)} demo files. Snapshot: {archive.relative_to(ROOT)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'apply', 'status', 'remove'])
    parser.add_argument('--canary', action='store_true', help='Exercise one new project before the complete overlay.')
    parser.add_argument('--dry-run', action='store_true', help='Inspect guarded removal without writing.')
    args = parser.parse_args()
    demo = Demo()
    if args.action == 'prepare': demo.prepare(args.canary)
    elif args.action == 'apply': demo.apply(args.canary)
    elif args.action == 'status': demo.status()
    else: demo.remove(args.dry_run)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'SABRE demo stopped: {error}', file=sys.stderr)
        sys.exit(1)
