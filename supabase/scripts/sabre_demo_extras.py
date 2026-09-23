"""Related, role-owned demonstration content for the local SABRE overlay."""
from pathlib import Path

from sabre_demo import CLIENT_ID, PLAN, RUN, SOURCE, uid


BRAND = {
    'overview': {
        'name': 'SABRE', 'tagline': 'Everyday confidence.',
        'description': 'A fictional creative direction for the SABRE studio demonstration. Thoughtful everyday essentials, expressed through warm photography and a calm editorial voice. All imagery and product concepts in this workspace are demonstration material.',
        'audience': 'Adults building everyday routines: city commuters, students, runners, outdoor communities and thoughtful gift givers.',
        'tone': ['Considered', 'Clear', 'Warm', 'Confident'],
        'rules': ['Lead with everyday moments.', 'Keep the product easy to recognize.', 'Give the message room to breathe.', 'Treat generated product imagery as concept work.'],
    },
    'logos': {'guidance': 'Use the supplied demonstration wordmark on quiet backgrounds. Keep clear space equal to the height of the S on every side. Do not stretch, outline or add shadows. These assets are a demo identity, not a replacement for approved brand originals.', 'variants': ['Forest on warm ivory', 'Ivory on forest', 'Monochrome for small formats']},
    'colors': {'palette': [{'name': n, 'hex': h} for n, h in [('Forest', '#143B30'), ('Warm Ivory', '#F4F0E7'), ('Sage', '#B9CCB1'), ('Clay', '#E2CABB'), ('Stone', '#DBDACD')]]},
    'typography': {'heading': 'Georgia', 'body': 'Arial', 'headingSource': '', 'bodySource': '', 'scale': [12, 16, 20, 28, 40, 56, 80]},
    'visual-style': {
        'principles': ['Warm natural light', 'Simple editorial compositions', 'Generous spacing', 'Tactile everyday materials'],
        'photography': 'Show adult subjects in ordinary, relaxed situations. Favor limestone, soft greenery and warm daylight. Product photos use fictional personal-alarm concepts with a restrained sage or forest finish.',
        'use': ['One clear focal point', 'A consistent horizon and grid', 'Natural expressions', 'Readable type over quiet areas'],
        'avoid': ['Fear-based scenes', 'Unsupported product claims', 'Busy gradients', 'Stock-photo gestures'],
    },
    'products': {'items': [
        {'name': 'Everyday Alarm - Forest Concept', 'description': 'Compact oval personal-alarm concept for the Everyday Essentials campaign.', 'specs': 'Fictional visual concept. Forest finish with silver key ring; no technical performance specifications.', 'rules': 'Use the Everyday Kit or Personal Alarm concept imagery. Do not describe generated proportions as manufacturing dimensions.'},
        {'name': 'Everyday Alarm - Sage Concept', 'description': 'Soft sage product direction for calm lifestyle compositions.', 'specs': 'Fictional visual concept shown with everyday accessories.', 'rules': 'Keep the product finish consistent within each presentation. Label demonstration imagery in handoff notes.'},
        {'name': 'Thoughtful Giving Concept Set', 'description': 'Ivory gift packaging and forest ribbon around the personal-alarm concept.', 'specs': 'Packaging exploration for the Q4 demonstration campaign.', 'rules': 'Use for concept presentations only; final production requires approved specifications.'},
    ]},
    'messaging': {'headline': 'Small essentials. Everyday confidence.', 'description': 'Thoughtfully part of your day, from the morning commute to the weekend outside.', 'cta': 'Explore the collection', 'terminology': ['Everyday essentials', 'Thoughtfully designed', 'Your daily routine', 'Community'], 'rules': ['Use short, conversational sentences.', 'Pair one message with one clear action.', 'Avoid guarantees and unsupported performance claims.', 'Describe generated products as concepts in project notes.']},
    'ai': {'instructions': 'Create English-language SABRE demonstration concepts using forest green, warm ivory, sage and natural photography. Use Georgia for editorial headlines and Arial for supporting text. Keep layouts quiet and easy to scan. Show adults in relaxed everyday situations. Generated personal-alarm products are fictional visual concepts. Never invent technical specifications, testimonials or performance claims.', 'use': ['Clear message hierarchy', 'Warm daylight and honest texture', 'Readable type and generous margins', 'Campaign-specific adult audiences'], 'never': ['Present concept imagery as approved product photography', 'Invent technical specifications', 'Use fear-based advertising', 'Expose internal production notes in client publications']},
}


def populate_brand(demo):
    for section, content in BRAND.items():
        demo.once('brand-section:' + section, lambda: demo.request('/rest/v1/brand_sections?on_conflict=client_id,section',
            {'client_id': CLIENT_ID, 'section': section, 'content': content},
            headers={'Prefer': 'resolution=merge-duplicates,return=representation'}))
    for theme in PLAN['campaigns']:
        key = 'brand-photo:' + theme['image']
        path = demo.upload('brand-assets', CLIENT_ID, key, SOURCE / 'assets' / (theme['image'] + '.png'))
        demo.once(key, lambda: demo.insert('brand_assets', {'id': uid(key), 'client_id': CLIENT_ID,
            'name': theme['title'] + ' - Campaign photography', 'category': 'Photography',
            'description': 'Generated concept imagery for the fictional SABRE demonstration. ' + theme['body'],
            'storage_path': path, 'mime_type': 'image/png', 'tags': ['Demo', theme['title'], 'Photography']}))
    for i, (name, category, width, height, layout) in enumerate([
        ('Everyday Editorial', 'Social', 1080, 1350, 'editorial'),
        ('Campus Story', 'Social', 1080, 1920, 'minimal'),
        ('Collection Email Hero', 'Email', 1200, 600, 'centered'),
        ('Community Presentation', 'Presentation', 1920, 1080, 'editorial'),
    ]):
        key = 'brand-template:' + str(i)
        content = {'headline': PLAN['campaigns'][i]['headline'].replace('\n', ' '),
            'subheading': 'Everyday confidence', 'eyebrow': 'SABRE / DEMO COLLECTION',
            'body': PLAN['campaigns'][i]['body'], 'cta': 'Explore the collection',
            'background': '#F4F0E7', 'foreground': '#143B30', 'accent': '#B9CCB1', 'layout': layout}
        template = demo.once(key, lambda: demo.insert('brand_templates', {'id': uid(key), 'client_id': CLIENT_ID,
            'name': name, 'category': category, 'width': width, 'height': height, 'content': content}))
        if i < 2:
            for role in ('agency', 'client'):
                draft_key = key + ':' + role
                demo.once(draft_key, lambda: demo.insert('template_drafts', {'id': uid(draft_key),
                    'client_id': CLIENT_ID, 'template_id': template['id'], 'owner_id': demo.users[role],
                    'name': name + ' - My concept draft', 'content': {**content, 'headline': 'A new point of view.'}}, role))


def populate_intake(demo):
    titles = ['Winter Community Stories', 'New Year Collection Teaser', 'Holiday Retail Window',
              'Gift Guide Newsletter', 'Campus Partner Welcome Pack', 'Everyday Essentials Animation']
    for i, title in enumerate(titles):
        project = dict(demo.state['project_plan'][34 + i])
        project.update(key=f'open-brief-{i}', title=title,
                       overview=f'Create {title.lower()} for the next campaign round. Demonstration brief with a reference image and defined deliverables.')
        theme = PLAN['campaigns'][project['campaign']]
        campaign = demo.state['steps']['campaign:' + theme['key']]
        briefing = demo.create_briefing(project, campaign)
        if i >= 2:
            demo.once('submit-brief:' + project['key'], lambda: demo.rpc('submit_briefing', {'p_briefing_id': briefing}, 'client'))
        if i >= 4:
            demo.once('budget:' + project['key'], lambda: demo.rpc('confirm_briefing_budget', {
                'p_briefing_id': briefing, 'p_credits': project['credits'], 'p_note': 'Demo estimate ready for acceptance; no project or debit yet.'}))
    for i, (amount, outcome, note) in enumerate([
        (50, 'fulfilled', 'Allocate the next campaign round.'),
        (25, 'pending', 'Please reserve credits for the winter creative work.'),
        (25, 'rejected', 'Additional exploration credits for a paused concept.'),
    ]):
        key = 'credit-request:' + str(i)
        request = demo.once(key, lambda: demo.rpc('request_credits', {'p_client_id': CLIENT_ID,
            'p_amount': amount, 'p_note': 'Demo request: ' + note, 'p_idempotency_key': RUN + ':' + key}, 'client'))
        if outcome != 'pending':
            demo.once(key + ':resolve', lambda: demo.rpc('fulfill_credit_request' if outcome == 'fulfilled' else 'reject_credit_request',
                {'p_request_id': request, 'p_note': 'Demo allocation approved for the next campaign.' if outcome == 'fulfilled' else 'Demo request paused until the campaign scope is confirmed.'}))


def populate_resources(demo):
    for i in (12, 23, 29):
        project = demo.state['project_plan'][i]
        project_id = demo.state['steps']['accept:' + project['key']]
        key = project['key'] + ':reference-asset'
        artwork = demo.artworks[project['artwork'][0][0][0]]
        file = artwork['pdf'] or artwork['png']
        mime = 'application/pdf' if file.endswith('.pdf') else 'image/png'
        path = demo.upload('internal-assets', project_id, key, file, mime=mime)
        demo.once(key, lambda: demo.insert('project_assets', {'id': uid(key), 'project_id': project_id,
            'name': 'Campaign composition reference', 'category': 'reference', 'storage_path': path,
            'mime_type': mime, 'file_size': Path(file).stat().st_size}))
    project = demo.state['project_plan'][23]
    project_id = demo.state['steps']['accept:' + project['key']]
    for role in ('agency', 'client', 'designer2'):
        key = 'playground:' + role
        board = demo.once(key, lambda: demo.rpc('get_playground_board', {'p_client_id': CLIENT_ID, 'p_project_id': project_id}, role))
        notes = [('Creative starting point', 'Explore a warm welcome to campus with everyday moments and one clear message.'),
                 ('Audience and channel', 'Adult students and community partners. Prioritize mobile readability, then adapt to the presentation format.'),
                 ('Next exploration', 'Try a quieter headline treatment and compare a portrait crop with the wide composition.')]
        for i, (title, body) in enumerate(notes):
            item_key = key + ':' + str(i)
            item = {'id': uid(item_key), 'kind': 'note', 'title': title, 'body': 'Demo idea: ' + body,
                    'asset_path': None, 'mime_type': None, 'x': i * 350, 'y': 0, 'width': 320, 'height': 240}
            demo.once(item_key, lambda: demo.rpc('save_playground_item', {'p_board_id': board, 'p_item': item}, role))
        item_key = key + ':image'
        path = demo.upload('playground-assets', board + '/' + uid(item_key), item_key,
                           SOURCE / 'assets/campus-days.png', role)
        item = {'id': uid(item_key), 'kind': 'image', 'title': 'Campus campaign visual reference',
                'body': 'Generated demonstration photography.', 'asset_path': path, 'mime_type': 'image/png',
                'x': 0, 'y': 290, 'width': 340, 'height': 510}
        demo.once(item_key, lambda: demo.rpc('save_playground_item', {'p_board_id': board, 'p_item': item}, role))


def populate_extras(demo):
    populate_brand(demo)
    populate_intake(demo)
    populate_resources(demo)
    print('Brand Hub, private drafts, intake, credits, resources and role-specific Playground examples are ready.', flush=True)
