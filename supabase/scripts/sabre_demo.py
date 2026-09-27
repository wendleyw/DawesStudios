"""Prepare, populate, inspect and safely remove the local SABRE agency demonstration."""
import argparse
import base64
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
                             snapshot, save, fingerprint, difference, rollback_sql, sql,
                             layer_tables, restrict)

SOURCE = ROOT / 'supabase/demo/sabre'
PLAN = json.loads((SOURCE / 'plan.json').read_text())
RUN = PLAN['id']
CATALOG = json.loads((ROOT / 'apps/web/features/briefings/service-catalog.json').read_text())
FORMATS = {row['id']: row for row in CATALOG['formats']}
SERVICES = {row['id']: row for row in CATALOG['types']}
DOC_FORMATS = {'a4', 'a5', 'letter', 'guidelines', 'brand-kit', 'direction', 'research', 'shot-list', 'dieline', 'slides', 'custom', 'custom-mm'}


# Tables the Miro backfill must never change: it adds design data, not projects, briefs or credits.
BACKFILL_PROTECTED = ['public.clients', 'public.campaigns', 'public.briefings', 'public.projects',
    'public.credit_accounts', 'public.credit_plans', 'public.credit_months', 'public.credit_ledger',
    'public.credit_requests', 'public.project_settlements', 'public.deliverables',
    'public.project_assignments', 'public.project_assets', 'public.delivery_files']


def uid(key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, RUN + ':' + key))


def miro_url(board_key, frame_key=None):
    """A deterministic placeholder Miro board or frame link (`uXjV…`); the embed shows Miro's own
    "not found". One board key always gives the same board; a frame key picks a frame on it."""
    board = 'uXjV' + base64.urlsafe_b64encode(hashlib.sha256((RUN + ':miro:' + board_key).encode()).digest()).decode()[:7] + '='
    url = 'https://miro.com/app/board/' + board + '/'
    if frame_key is None:
        return url
    widget = int.from_bytes(hashlib.sha256((RUN + ':frame:' + frame_key).encode()).digest()[:8], 'big') % 10**9
    return url + '?moveToWidget=3458764' + str(widget).zfill(9)


def miro_history(status, index):
    """Rounds per board for a project status: None is a round kept inside the studio; any other
    value is a round shared as a client version with that review. A project in progress has not
    sent a round yet; later statuses end on the client version their status describes."""
    two = index % 2 == 1
    if status in ('planned', 'in_progress'):
        return []
    if status == 'internal_review':
        return [None, None] if two else [None]
    last = {'client_review': 'pending', 'changes_requested': 'changes_requested'}.get(status, 'approved')
    return (['changes_requested'] if two else []) + [last]


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

    def comment(self, key, project, body, role, channel, version=None):
        payload = dict(p_project_id=project, p_channel=channel, p_body=body, p_version_id=version,
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
        # Existing projects keep their status; new projects move through the real workflow to their stage.
        self.populate_miro(p, project, index, preserve=bool(p.get('existing')))
        if p['stage'] in ('approved', 'delivered') and self.project_row(project)['status'] == 'approved':
            deliver_files = []
            for di, deliverable in enumerate(deliverables):
                for ai, artwork_key in enumerate(p['artwork'][di][-1]):
                    art = self.artworks[artwork_key]
                    deliver_files.append((art['pdf'] or art['png'], deliverable['name'] + f' direction {chr(65 + ai)}'))
            for fi, (file, name) in enumerate(deliver_files):
                self.once(f'delivery:{key}:{fi}', lambda: self.request('/deliveries/prepare?projectId=' + project, Path(file).read_bytes(), media=True,
                    mime='application/pdf' if file.endswith('.pdf') else 'image/png', headers={'X-File-Name': urllib.parse.quote(name)}))
            if p['stage'] == 'delivered':
                self.once('complete:' + key, lambda: self.rpc('mark_project_delivered', {'p_project_id': project}))
        print(f'{index + 1:02}/{len(self.state["project_plan"])}  {p["title"]} — {p["stage"]}', flush=True)

    def project_row(self, project):
        return json.loads(sql(f"select row_to_json(t) from (select status, updated_at, delivered_at from public.projects where id='{uuid.UUID(project)}' and client_id='{CLIENT_ID}') t;"))

    def set_project_row(self, project, row):
        """Restore a project's own workflow fields after a backfill used the real round/share RPCs."""
        delivered = 'null' if row['delivered_at'] is None else f"'{row['delivered_at']}'"
        sql(f"begin; set local session_replication_role=replica; update public.projects set status='{row['status']}', "
            f"updated_at='{row['updated_at']}', delivered_at={delivered} where id='{uuid.UUID(project)}' and client_id='{CLIENT_ID}'; commit;")

    def project_id(self, p):
        return p['id'] if p.get('existing') else self.state['steps'].get('accept:' + p['key'])

    def populate_miro(self, p, project, index, preserve):
        """Design boards, rounds, client versions, Miro links, comments and a cover for one project.

        Only what is missing is added: a board for each assigned designer without one, a history only
        when the project has neither rounds nor client versions, and a cover when it has none. With
        `preserve`, the project's status, updated_at and delivered_at are restored afterwards, so an
        existing project keeps the status the round and share RPCs would otherwise move."""
        key = p['key']
        theme = PLAN['campaigns'][p['campaign']]
        original = self.once('miro-original:' + key, lambda: self.project_row(project)) if preserve else None
        roles = {user: role for role, user in self.users.items()}
        details = self.rows('projects', f'id=eq.{project}&select=start_date,due_date')[0]
        for bi, assignment in enumerate(self.rows('project_assignments', f'project_id=eq.{project}&select=designer_id&order=designer_id')):
            designer = assignment['designer_id']
            if self.rows('design_boards', f'project_id=eq.{project}&designer_id=eq.{designer}&select=id'):
                continue
            due = details['due_date'] and date.fromisoformat(details['due_date']) - timedelta(days=2 + index % 5)
            if due and details['start_date'] and due < date.fromisoformat(details['start_date']):
                due = date.fromisoformat(details['due_date'])
            self.once(f'miro-board:{key}:{designer}', lambda: self.rpc('create_design_board', {'p_project_id': project,
                'p_name': ('Campaign board', 'Adaptations board', 'Motion board')[bi % 3], 'p_url': miro_url(f'{key}:board:{bi}'),
                'p_designer_id': designer, 'p_due_date': str(due) if due else None}))
        def plan():
            existing = self.rows('design_versions', f'project_id=eq.{project}&select=id') or self.rows('published_versions', f'project_id=eq.{project}&select=id')
            return [] if existing else miro_history(original['status'] if preserve else p['stage'], index)
        history = self.once('miro-plan:' + key, plan)
        boards = self.rows('design_boards', f'project_id=eq.{project}&select=id,designer_id&order=created_at,id')
        history = history if boards else []
        if history and preserve and self.project_row(project)['status'] == 'delivered':
            # Delivered projects accept no new rounds; the delivered status is restored below.
            sql(f"begin; set local session_replication_role=replica; update public.projects set status='approved' where id='{uuid.UUID(project)}' and client_id='{CLIENT_ID}'; commit;")
        for cycle, decision in enumerate(history):
            rounds = []
            for bi, board in enumerate(boards):
                round_key = f'{key}:c{cycle}:b{bi}'
                role = roles.get(board['designer_id'], 'agency')
                rounds.append(self.once('miro-round:' + round_key, lambda: self.rpc('send_board_round', {'p_board_id': board['id'],
                    'p_note': f'Round {cycle + 1}: ' + ('Refined spacing and a quieter supporting message.' if cycle else 'Campaign photography, clear type and generous spacing across the requested formats.'),
                    'p_frame_url': miro_url(f'{key}:board:{bi}', round_key) if cycle else None,
                    'p_idempotency_key': uid('miro-round:' + round_key)}, role)))
                self.comment('miro-round-note:' + round_key, project, 'Studio review: ' + (
                    'ready to share with the client.' if decision else 'give the headline more room before the next round.'
                    if cycle < len(history) - 1 else 'the studio is reviewing this round.'), 'agency', 'internal', rounds[-1])
            if not decision:
                continue
            version_key = f'{key}:v{cycle}'
            version = self.once('miro-share:' + version_key, lambda: self.rpc('share_miro_version', {'p_project_id': project,
                'p_url': miro_url(f'{key}:board:0', version_key), 'p_source_round': rounds[cycle % len(rounds)],
                'p_note': f'Version {cycle + 1} of {p["title"]}: ' + ('spacing refined after your review.' if cycle else 'please review the composition and message across the requested formats.'),
                'p_idempotency_key': uid('miro-share:' + version_key)}))
            self.comment('miro-client:' + version_key, project, 'Demo client feedback: the image feels right. Please check the headline spacing in the narrow format.', 'client', 'client', version)
            self.comment('miro-reply:' + version_key, project, 'Demo studio reply: noted. We will carry the same spacing adjustment through the adaptations.', 'agency', 'client', version)
            if decision != 'pending':
                self.once('miro-review:' + version_key, lambda: self.rpc('review_publication', {'p_publication_id': version, 'p_decision': decision,
                    'p_feedback': 'Demo approval: the message, composition and adaptations are ready.' if decision == 'approved'
                    else 'Demo change request: increase spacing above the headline and retain the current image.'}, 'client'))
        if preserve:
            self.set_project_row(project, original)
        if not self.rows('project_covers', f'project_id=eq.{project}&select=project_id'):
            visible = bool(self.rows('published_versions', f'project_id=eq.{project}&select=id'))
            art = self.artworks[p['artwork'][0][0][0]]['png']
            self.once('miro-cover:' + key, lambda: self.request(f'/covers/prepare?projectId={project}&visible={str(visible).lower()}',
                Path(art).read_bytes(), media=True, mime='image/png'))

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

    def backfill(self):
        """Fill in the Miro model for an overlay applied before 202609270007 retired Versions.

        The overlay's working versions, designs and publications were deleted by that migration. This
        adds boards, rounds, client versions, Miro links, comments and covers where they are missing,
        through the same RPCs as `apply`, and restores each project's status afterwards. It records
        its own before/after snapshot as a second rollback layer, because an older checkpoint does
        not capture the Miro tables. Re-running it resumes; once complete it only reports status."""
        if not self.state or self.state['phase'] != 'complete' or self.state['canary']:
            raise RuntimeError('The Miro backfill needs the completed SABRE overlay.')
        backfill = self.state.get('backfill')
        if backfill and backfill['phase'] == 'complete':
            self.status()
            return
        if not (STATE_DIR / 'rendered/index.json').exists():
            self.render()
        self.artworks = json.loads((STATE_DIR / 'rendered/index.json').read_text())
        if not backfill:
            backfill = self.state['backfill'] = {'phase': 'applying', 'started_at': sql('select now();'), 'before': snapshot()}
            save(self.state)
        for index, p in enumerate(self.state['project_plan']):
            self.populate_miro(p, self.project_id(p), index, preserve=True)
            print(f'{index + 1:02}/{len(self.state["project_plan"])}  {p["title"]} — Miro model ready', flush=True)
        # The RPCs notify the client and studio as if the history happened today; it did not.
        self.once('miro-notifications-read', lambda: int(sql(
            f"with seen as (update public.notifications set read_at=created_at where client_id='{CLIENT_ID}' and read_at is null "
            f"and created_at>='{backfill['started_at']}' returning 1) select count(*) from seen;")))
        after = snapshot()
        changed = [t for t in BACKFILL_PROTECTED if fingerprint(backfill['before']['rows'][t]) != fingerprint(after['rows'][t])]
        backfill.update(after=after, phase='complete', protected_changes=changed)
        save(self.state)
        if changed:
            raise RuntimeError('The backfill changed protected tables: ' + ', '.join(changed))
        self.status()

    def status(self):
        current = snapshot()
        r = current['rows']
        def counts(rows, field):
            return {v: sum(row[field] == v for row in rows) for v in sorted({row[field] for row in rows})}
        projects = {row['id'] for row in r['public.projects']}
        def missing(table, rows=None):
            return len(projects - {row['project_id'] for row in (rows if rows is not None else r[table])})
        started = [row for row in r['public.projects'] if row['status'] not in ('planned', 'in_progress')]
        totals = json.loads(sql("select json_build_object('clients',(select count(*) from public.clients),'projects',(select count(*) from public.projects));"))
        report = {'client': 'SABRE', 'id': RUN, 'phase': self.state['phase'] if self.state else 'not applied',
            'miro_backfill': (self.state.get('backfill') or {}).get('phase', 'not run') if self.state else 'not run',
            'all_clients': totals['clients'], 'all_projects': totals['projects'],
            'projects': len(r['public.projects']), 'campaigns': len(r['public.campaigns']),
            'project_statuses': counts(r['public.projects'], 'status'), 'briefing_statuses': counts(r['public.briefings'], 'status'),
            'deliverables': len(r['public.deliverables']), 'formats': counts(r['public.deliverables'], 'format'),
            'design_boards': len(r['public.design_boards']), 'rounds': counts(r['public.design_versions'], 'status'),
            'client_versions': len(r['public.published_versions']), 'reviews': counts(r['public.publication_reviews'], 'status'),
            'miro_links': len(r['public.design_version_miro_links']) + len(r['public.publication_miro_links']),
            'covers': len(r['public.project_covers']), 'client_visible_covers': sum(row['client_visible'] for row in r['public.project_covers']),
            'projects_without': {'board': missing('public.design_boards'), 'cover': missing('public.project_covers'),
                'round_after_in_progress': len({row['id'] for row in started} - {row['project_id'] for row in r['public.design_versions']})},
            'internal_comments': len(r['public.internal_comments']),
            'client_comments': len(r['public.client_comments']), 'delivery_files': len(r['public.delivery_files']),
            'brand_assets': len(r['public.brand_assets']), 'templates': len(r['public.brand_templates']),
            'stored_files': len(current['storage']), 'credit_balance': r['public.credit_accounts'][0]['balance']}
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        (STATE_DIR / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
        return report

    def layers(self):
        """The saved before/after pairs, oldest first: the overlay, then the Miro backfill if it ran."""
        backfill = self.state.get('backfill')
        if backfill and backfill.get('phase') != 'complete':
            raise RuntimeError('The Miro backfill is incomplete; finish it before removal.')
        return [(self.state['before'], self.state['after'])] + ([(backfill['before'], backfill['after'])] if backfill else [])

    def remove(self, dry_run=False):
        if not self.state or self.state['phase'] not in ('complete', 'removing'):
            raise RuntimeError('A completed demo snapshot is required for guarded removal.')
        layers = self.layers()
        if self.state['phase'] == 'complete':
            current = snapshot()
            before, after = layers[-1]
            tables = layer_tables(before, after)
            if fingerprint(restrict(current, tables)) != fingerprint(restrict(after, tables)) or fingerprint(current['storage']) != fingerprint(after['storage']):
                raise RuntimeError('SABRE changed after population. Removal stopped to preserve newer work; compare the saved before/after snapshots first.')
            for (lower_before, lower_after), (upper_before, _) in zip(layers, layers[1:]):
                tables = layer_tables(lower_before, lower_after)
                if fingerprint(restrict(upper_before, tables)) != fingerprint(restrict(lower_after, tables)) or fingerprint(upper_before['storage']) != fingerprint(lower_after['storage']):
                    raise RuntimeError('SABRE changed between population and the Miro backfill. Removal stopped to preserve that work; compare the saved snapshots first.')
            print(json.dumps([{table: {kind: len(rows) for kind, rows in change.items()} for table, change in difference(before, after).items() if any(change.values())}
                              for before, after in layers], indent=2))
            if dry_run: return
            self.state['phase'] = 'removing'
            save(self.state)
        if dry_run:
            return
        # Newest layer first; each layer is one transaction, so an interrupted removal resumes.
        for before, after in reversed(layers):
            tables = layer_tables(before, after)
            current_rows = restrict(snapshot(), tables)
            if fingerprint(current_rows) == fingerprint(restrict(after, tables)):
                sql(rollback_sql(before, after))
            elif fingerprint(current_rows) != fingerprint(restrict(before, tables)):
                raise RuntimeError('Removal found unexpected database changes; storage cleanup stopped.')
        original = layers[0][0]
        old_paths = {(o['bucket'], o['path']) for o in original['storage']}
        added = list({(o['bucket'], o['path']): o for _, after in layers for o in after['storage'] if (o['bucket'], o['path']) not in old_paths}.values())
        for bucket in sorted({o['bucket'] for o in added}):
            paths = [o['path'] for o in added if o['bucket'] == bucket]
            for i in range(0, len(paths), 100):
                self.request('/storage/v1/object/' + bucket, {'prefixes': paths[i:i+100]}, role='service', method='DELETE')
        current, seen = snapshot(), set()
        for before, after in layers:
            tables = [t for t in layer_tables(before, after) if t not in seen]
            seen.update(tables)
            if fingerprint(restrict(current, tables)) != fingerprint(restrict(before, tables)):
                raise RuntimeError('Removal did not match the original SABRE snapshot; retain the state file for recovery.')
        if fingerprint(current['storage']) != fingerprint(original['storage']):
            raise RuntimeError('Removal did not match the original SABRE snapshot; retain the state file for recovery.')
        archive = STATE_PATH.with_name('completed-canary.json' if self.state['canary'] else 'removed-demo.json')
        STATE_PATH.replace(archive)
        print(f'Restored the original SABRE records and removed {len(added)} demo files. Snapshot: {archive.relative_to(ROOT)}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'apply', 'backfill', 'status', 'remove'])
    parser.add_argument('--canary', action='store_true', help='Exercise one new project before the complete overlay.')
    parser.add_argument('--dry-run', action='store_true', help='Inspect guarded removal without writing.')
    args = parser.parse_args()
    demo = Demo()
    if args.action == 'prepare': demo.prepare(args.canary)
    elif args.action == 'apply': demo.apply(args.canary)
    elif args.action == 'backfill': demo.backfill()
    elif args.action == 'status': demo.status()
    else: demo.remove(args.dry_run)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'SABRE demo stopped: {error}', file=sys.stderr)
        sys.exit(1)
