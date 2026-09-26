"""Generate deterministic local-only fixtures from the checked-in service catalog."""
from pathlib import Path
import hashlib
import json
import uuid
from fixture_media import FORMAT_FREE_SIZE, format_pixel_size

ROOT = Path(__file__).resolve().parents[2]
CATALOG = json.loads((ROOT / 'docs/ref/00-guia/CATALOGO-DE-SERVICOS.json').read_text())
CLIENTS = [('Acme','acme','Consumer goods'),('Harbor & Pine','harbor-pine','Hospitality'),('Kestrel Outdoor','kestrel-outdoor','Outdoor'),('Northfield Bank','northfield-bank','Finance'),('Otto & Sons','otto-sons','Retail'),('Pelagic','pelagic','Travel'),('Rune Fitness','rune-fitness','Wellness'),('SABRE','sabre','Personal safety'),('Sablefish Provisions','sablefish-provisions','Food & beverage'),('Vela Skincare','vela-skincare','Beauty')]

ADAPTATION_PROJECTS = (4, 8, 12, 20)
SABRE_SLUG = 'sabre'
# SABRE is the workspace the reference package documents end to end — its agency board is the one
# every `#/client/sabre/board` capture in `docs/ref` was taken from — so it is seeded from that
# structure instead of the uniform pattern the other nine clients share: three named campaigns,
# seven projects already in flight, and two briefings that have not become projects yet. Services
# and formats are taken from the real catalog rather than from the two placeholder sizes the
# wireframe reused everywhere, and each campaign window contains the work inside it.
SABRE_CAMPAIGNS = [
    ('summer-safety', 'Summer Safety', 'Seasonal safety push across paid and owned channels.', '2026-09-15', '2026-09-30'),
    ('everyday-confidence', 'Everyday Confidence', 'Product storytelling for the core range.', '2026-09-15', '2026-10-15'),
    ('brand-essentials', 'Brand Essentials', 'Always on: the brand system every campaign is built from.', None, None),
]
# key, title, campaign, service, [(deliverable name, format)], status, start, due, designs in V1, second version
SABRE_PROJECTS = [
    ('instagram-ads', 'Instagram Ads', 'summer-safety', 'static-ad', [('Instagram Feed', 'feed'), ('Instagram Story', 'story')], 'client_review', '2026-09-17', '2026-09-23', 2, False),
    ('campaign-landing-page', 'Campaign Landing Page', 'summer-safety', 'web', [('Desktop Layout', 'desktop')], 'client_review', '2026-09-18', '2026-09-24', 1, True),
    ('email-banner', 'Email Banner', 'summer-safety', 'email-hero', [('Email Hero', 'email-hero')], 'approved', '2026-09-19', '2026-09-25', 1, False),
    ('social-launch', 'Social Launch', 'everyday-confidence', 'social', [('Portrait Feed', 'feed')], 'in_progress', '2026-09-17', '2026-09-23', 1, False),
    ('product-story', 'Product Story', 'everyday-confidence', 'social', [('Instagram Story', 'story')], 'internal_review', '2026-09-18', '2026-09-24', 1, True),
    ('brand-guidelines', 'Brand Guidelines', 'brand-essentials', 'branding', [('Brand Guidelines', 'guidelines')], 'internal_review', '2026-09-17', '2026-09-23', 1, False),
    ('stationery', 'Stationery', 'brand-essentials', 'print', [('A4 Stationery', 'a4')], 'client_review', '2026-09-18', '2026-09-24', 1, True),
]
# Work the client has asked for that the studio has not turned into a project yet: one waiting on the
# studio's budget, one the client is still writing and has not chosen a campaign for.
SABRE_OPEN_BRIEFINGS = [
    ('social-launch-reel', 'Social launch', 'everyday-confidence', 'reel', 'awaiting_review', '2026-10-01',
     [('Launch reel', 'reel', 'original'), ('Story cutdown', 'story', 'adaptation')]),
    ('product-spotlight', 'Product spotlight', None, 'reel', 'draft', None, []),
]

def uid(label):
    return str(uuid.UUID(hashlib.md5(('dawes:'+label).encode()).hexdigest()))

def answers(service):
    return {q['id']:q['options'][0] if q.get('options') else ('12' if q['id']=='pages' else 'Use the supplied campaign direction and approved brand resources.') for q in service.get('questions',[])}

# Artwork lives in two separate buckets, one per audience, and each file is named after the design it
# belongs to rather than after the project. That keeps the two paths independent, lets a project hold
# several distinct images, and satisfies the check constraint that every path starts with its project.
def working_asset_path(project, design):
    """The private production file the agency and the assigned designer read from `internal-assets`."""
    return f'{project}/{uid("working-asset-"+design)}.png'

def published_asset_path(project, design):
    """The sanitized copy a publication hands the client from `published-assets`."""
    return f'{project}/{uid("published-asset-"+design)}.png'

def sql(value):
    if value is None: return 'null'
    if isinstance(value, bool): return str(value).lower()
    if isinstance(value, (int,float)): return str(value)
    if isinstance(value, (dict,list)): value=json.dumps(value,separators=(',',':'))
    return "'"+str(value).replace("'","''")+"'"

lines=['-- Deterministic development fixtures. Never apply to a production database.','-- Regenerate with python3 supabase/scripts/build_seed.py.']
def insert(table, **values):
    lines.append(f"insert into {table} ({','.join(values)}) values ({','.join(sql(v) for v in values.values())});")

accounts=[('agency','studio@dawes.local','Dawes Studio','agency'),('designer-1','designer@dawes.local','Alex Morgan','designer'),('designer-2','designer2@dawes.local','Jordan Reed','designer')]
accounts += [(f'client-{i+1}',f'{slug}@client.dawes.local',f'{name} Team','client') for i,(name,slug,_) in enumerate(CLIENTS)]
for key,email,name,role in accounts:
    insert('auth.users',instance_id='00000000-0000-0000-0000-000000000000',id=uid(key),aud='authenticated',role='authenticated',email=email,encrypted_password='',email_confirmed_at='2026-09-01T12:00:00Z',raw_app_meta_data={'provider':'email','providers':['email']},raw_user_meta_data={'display_name':name},created_at='2026-09-01T12:00:00Z',updated_at='2026-09-01T12:00:00Z',confirmation_token='',email_change='',email_change_token_new='',recovery_token='')
    insert('auth.identities',id=uid('identity-'+key),provider_id=uid(key),user_id=uid(key),identity_data={'sub':uid(key),'email':email,'email_verified':True,'phone_verified':False},provider='email',last_sign_in_at='2026-09-01T12:00:00Z',created_at='2026-09-01T12:00:00Z',updated_at='2026-09-01T12:00:00Z')
    lines.append(f"update public.profiles set role={sql(role)} where id={sql(uid(key))};")

states=['planned','in_progress','internal_review','client_review','changes_requested','approved','approved','in_progress','client_review','planned','in_progress','client_review','changes_requested','approved','internal_review','client_review','in_progress','approved','planned','client_review']
# Project schedules keyed by project index, as (start_date, due_date) inclusive windows.
# Every seeded campaign runs 2026-09-01 to 2026-10-31 and the fixture reference day is 2026-09-20, so each
# window is placed against the status above it: delivered and approved work closes before that day,
# in-progress work straddles it, review work lands just after it, and planned work opens later in the
# campaign. The two projects of a campaign overlap so a lane of the planning calendar shows contention,
# durations range from a four-day turnaround to a five-week production, and several windows stay short
# enough to sit whole inside the fortnight the planning calendar opens on.
schedules={
  1:('2026-09-28','2026-10-09'), 2:('2026-09-14','2026-10-02'), 3:('2026-09-07','2026-09-23'), 4:('2026-09-19','2026-09-24'),
  5:('2026-09-09','2026-09-22'), 6:('2026-09-02','2026-09-15'), 7:('2026-09-01','2026-09-11'), 8:('2026-09-10','2026-10-01'),
  9:('2026-09-15','2026-09-26'), 10:('2026-09-24','2026-09-27'), 11:('2026-09-17','2026-09-30'), 12:('2026-09-12','2026-09-24'),
  13:('2026-09-04','2026-09-21'), 14:('2026-09-03','2026-09-17'), 15:('2026-09-18','2026-09-27'), 16:('2026-09-17','2026-09-21'),
  17:('2026-09-08','2026-10-07'), 18:('2026-09-05','2026-09-19'), 19:('2026-10-12','2026-10-30'), 20:('2026-09-13','2026-09-25')}
# One project, emitted whole: its accepted briefing, the work itself, the artwork a board card
# shows, and — where the status says the client has seen it — the publication, its review and the
# comments on both sides of it. Two callers share it, the uniform nine-client baseline and SABRE's
# own workspace, so a project means the same set of records whichever one produced it.
def emit_project(*, key, name, client, customer, campaign, service, specs, title, description,
                 status, start_date, due_date, credits, balance, designer, designs_in_v1,
                 extra_version, debit_at, campaign_label='the fall campaign', adaptation_versions=2):
    project=uid(f'project-{key}'); briefing=uid(f'briefing-{key}'); deliverable=uid(f'deliverable-{key}'); version=uid(f'version-{key}-1')
    spec=specs[0]
    format_spec=next(f for f in CATALOG['formats'] if f['id']==spec['format'])
    # Artwork of this deliverable is rendered at the true canvas of the format it was ordered in, so
    # a square post is 1080x1080 and a portrait feed 1080x1350 on the board and inside the project.
    artwork_width,artwork_height=format_pixel_size(format_spec)
    insert('public.briefings',id=briefing,client_id=client,campaign_id=campaign,title=title,service_type=service['id'],status='accepted',overview=f'Create a focused {service["name"].lower()} for {campaign_label}.',goals='Build awareness and give our audience one clear next step.',direction={'source':'brand_hub','tone':'Clear, confident and human','questions':answers(service)},requested_deliverables=specs,due_date=due_date,estimated_credits=credits,confirmed_credits=credits,budget_note='Scope confirmed.',created_by=customer,requested_by=customer)
    insert('public.projects',id=project,client_id=client,campaign_id=campaign,briefing_id=briefing,title=title,description=description,service_type=service['id'],status=status,due_date=due_date,start_date=start_date,board_position={'x':0,'y':0})
    insert('public.project_assignments',project_id=project,designer_id=designer)
    insert('public.deliverables',id=deliverable,project_id=project,**spec)
    insert('public.credit_ledger',id=uid(f'debit-{key}'),client_id=client,project_id=project,amount=-credits,balance_after=balance,kind='project_debit',description=title,idempotency_key=f'briefing:{briefing}',created_at=debit_at)
    insert('public.client_comments',id=uid(f'project-context-{key}'),project_id=project,author_label=f'{name} Team',author_kind='client',body='The campaign scope is confirmed. Please keep the direction clear and aligned with our brand.')
    insert('private.client_comment_authors',comment_id=uid(f'project-context-{key}'),author_id=customer)
    # Artwork of the first version of the leading deliverable, which is what a board card shows.
    # Every started project gets it, so no card falls back to an empty tile; later internal
    # versions stay bare because publishing one is a production step the fixture has not taken.
    version_artwork=[]
    if status!='planned':
        insert('public.design_versions',id=version,project_id=project,deliverable_id=deliverable,version_number=1,notes='Initial creative direction. Internal production notes.',status='submitted' if status=='internal_review' else 'draft',created_by=designer)
        for di in range(designs_in_v1):
            content={'headline':'Every detail,\nconsidered.' if di==0 else 'A new perspective.','subheading':'FALL / 2026','body':'Made for the moments that matter.','background':'#F2F0E8' if di==0 else '#272B27','foreground':'#20231F' if di==0 else '#F2F0E8','accent':'#BAC69B','eyebrow':name.upper(),'layout':'editorial','internal_author':'Alex Morgan — NEVER PUBLISH','internal_note':'Production-only color exploration'}
            design=uid(f'design-{key}-1-{di}')
            # The card index gives every fixture image its own accent colour, so a wall of cards
            # reads as twenty different pieces of work rather than one picture repeated.
            artwork={'project_id':project,'design_id':design,'source_path':working_asset_path(project,design),'published_path':None,'index':len(manifest['working_assets'])+1,'width':artwork_width,'height':artwork_height}
            manifest['working_assets'].append(artwork); version_artwork.append(artwork)
            insert('public.designs',id=design,project_id=project,version_id=version,title=f'Direction {chr(65+di)}',content=content,internal_asset_path=artwork['source_path'],sort_order=di,created_by=designer)
        insert('public.internal_comments',id=uid(f'internal-comment-{key}'),project_id=project,version_id=version,design_id=uid(f'design-{key}-1-0'),author_id=designer,body='The first direction is ready for studio feedback.',pin_x=.42,pin_y=.35)
    if status in ('client_review','changes_requested','approved'):
        publication=uid(f'publication-{key}'); review='changes_requested' if status=='changes_requested' else ('approved' if status=='approved' else 'pending')
        insert('public.published_versions',id=publication,project_id=project,deliverable_id=deliverable,version_number=1,release_note='A considered direction for the fall campaign.')
        insert('private.publication_sources',publication_id=publication,internal_version_id=version,published_by=uid('agency'))
        # Publication copies each design's working artwork into the client bucket under its own
        # path, so a snapshot a client reads never points back at a private production file. The
        # snapshot rows are selected from `designs` to reuse the content sanitizer, and the path
        # is mapped per design id because this generator, not the database, owns the file names.
        for artwork in version_artwork: artwork['published_path']=published_asset_path(project,artwork['design_id'])
        published_case='case id '+' '.join(f"when {sql(artwork['design_id'])} then {sql(artwork['published_path'])}" for artwork in version_artwork)+' end'
        lines.append(f"insert into public.published_designs(id,project_id,publication_id,title,content,asset_path,sort_order) select md5('published:'||id::text)::uuid,project_id,{sql(publication)},title,private.public_design_content(content),{published_case},sort_order from public.designs where version_id={sql(version)};")
        insert('public.client_comments',id=uid(f'client-pin-{key}'),project_id=project,publication_id=publication,design_id=str(uuid.UUID(hashlib.md5(('published:'+uid(f'design-{key}-1-0')).encode()).hexdigest())),author_label=f'{name} Team',author_kind='client',body='Please preserve this focal point in the final composition.',pin_x=.63,pin_y=.42)
        insert('private.client_comment_authors',comment_id=uid(f'client-pin-{key}'),author_id=customer)
        insert('public.publication_reviews',id=uid(f'review-{key}'),publication_id=publication,project_id=project,status=review,feedback='Please give the headline a little more space.' if review=='changes_requested' else ('This feels right. Approved.' if review=='approved' else ''))
        insert('public.client_comments',id=uid(f'client-comment-{key}'),project_id=project,publication_id=publication,author_label='Studio',author_kind='studio',body='Your first direction is ready. We would love your feedback.')
        insert('private.client_comment_authors',comment_id=uid(f'client-comment-{key}'),author_id=uid('agency'))
        insert('public.notifications',id=uid(f'notification-{key}'),user_id=customer,client_id=client,project_id=project,title='New designs ready for review',body=title)
    if extra_version:
        insert('public.design_versions',id=uid(f'version-{key}-2'),project_id=project,deliverable_id=deliverable,version_number=2,notes='Unpublished refinement. Keep private.',created_by=designer)
        insert('public.designs',id=uid(f'design-{key}-2-0'),project_id=project,version_id=uid(f'version-{key}-2'),title='Internal refinement',content={'headline':'Unpublished exploration','internal_author':'Jordan Reed','background':'#DDD9CE','foreground':'#222222'},created_by=designer)
    if len(specs)>1:
        extra=uid(f'deliverable-{key}-adaptation')
        insert('public.deliverables',id=extra,project_id=project,sort_order=1,**specs[1])
        for revision in range(1,adaptation_versions+1):
            extra_version_id=uid(f'version-{key}-adaptation-{revision}')
            insert('public.design_versions',id=extra_version_id,project_id=project,deliverable_id=extra,version_number=revision,notes='Adaptation direction for the secondary format.',created_by=designer)
            insert('public.designs',id=uid(f'design-{key}-adaptation-{revision}'),project_id=project,version_id=extra_version_id,title=f'Adaptation V{revision}',content={'headline':'A clear next step.','subheading':name,'background':'#E4E7DC','foreground':'#242824','accent':'#BAC69B','layout':'editorial'},created_by=designer)
        if status=='client_review':
            extra_publication=uid(f'publication-{key}-adaptation')
            insert('public.published_versions',id=extra_publication,project_id=project,deliverable_id=extra,version_number=1,release_note='Secondary format adaptation.')
            insert('private.publication_sources',publication_id=extra_publication,internal_version_id=uid(f'version-{key}-adaptation-1'),published_by=uid('agency'))
            lines.append(f"insert into public.published_designs(id,project_id,publication_id,title,content,sort_order) select md5('published:'||id::text)::uuid,project_id,{sql(extra_publication)},title,private.public_design_content(content),sort_order from public.designs where version_id={sql(uid(f'version-{key}-adaptation-1'))};")
            insert('public.publication_reviews',id=uid(f'review-{key}-adaptation'),publication_id=extra_publication,project_id=project,status='pending')
            insert('public.client_comments',id=uid(f'client-pin-{key}-adaptation'),project_id=project,publication_id=extra_publication,design_id=str(uuid.UUID(hashlib.md5(('published:'+uid(f'design-{key}-adaptation-1')).encode()).hexdigest())),author_label=f'{name} Team',author_kind='client',body='Keep the focal point consistent across formats.',pin_x=.63,pin_y=.42)
            insert('private.client_comment_authors',comment_id=uid(f'client-pin-{key}-adaptation'),author_id=customer)
    manifest['projects'].append({'id':project,'client_id':client,'briefing_id':briefing,'deliverable_id':deliverable,'service_type':service['id'],'title':title,'status':status,'credits':credits})

manifest={'users':[{'id':uid(k),'email':e,'role':r} for k,e,n,r in accounts],'clients':[],'projects':[],'delivery_project_id':uid('project-7'),'brand_assets':[],'working_assets':[]}
for index,(name,slug,industry) in enumerate(CLIENTS):
    ci=index+1; client=uid(f'client-org-{ci}'); campaign=uid(f'campaign-{ci}'); customer=uid(f'client-{ci}'); balance=100
    insert('public.clients',id=client,name=name,slug=slug,industry=industry,initials=''.join(w[0] for w in name.split() if w[0].isalpha())[:2],description=f'{name} brand workspace',website=f'https://{slug}.example')
    insert('public.client_memberships',client_id=client,user_id=customer)
    campaigns={}
    if slug==SABRE_SLUG:
        for ck,ctitle,cdescription,cstart,cend in SABRE_CAMPAIGNS:
            campaigns[ck]=uid(f'campaign-sabre-{ck}')
            insert('public.campaigns',id=campaigns[ck],client_id=client,title=ctitle,description=cdescription,start_date=cstart,end_date=cend)
    else:
        insert('public.campaigns',id=campaign,client_id=client,title='Fall 2026',description='A focused launch campaign for the season.',start_date='2026-09-01',end_date='2026-10-31')
    insert('public.credit_ledger',id=uid(f'allocation-{ci}'),client_id=client,amount=100,balance_after=100,kind='allocation',description='September credit allocation',idempotency_key=f'seed-allocation-{ci}',created_at='2026-09-01T12:00:00Z')
    manifest['clients'].append({'id':client,'name':name,'slug':slug,'user_id':customer})
    sections={
      'overview':{'name':name,'tagline':'Made for what comes next.','description':f'{name} creates considered experiences with a clear point of view.','audience':'Curious people who value purposeful design.','tone':['Clear','Confident','Human'],'rules':['Keep the message direct.','Use generous whitespace.','Build on the core brand palette.']},
      'logos':{'guidance':'Maintain clear space equal to the height of the wordmark.','variants':['Primary wordmark','Compact mark','Reversed wordmark']},
      'colors':{'palette':[{'name':'Ink','hex':'#191919'},{'name':'Paper','hex':'#F7F6F2'},{'name':'Stone','hex':'#C9C5BB'},{'name':'Accent','hex':'#D4DCB4'}]},
      'typography':{'heading':'Inter','body':'Inter','headingSource':'https://rsms.me/inter/','bodySource':'https://rsms.me/inter/','scale':[12,14,16,24,36,56]},
      'visual-style':{'principles':['Natural light','Quiet composition','Honest materials'],'photography':'Focus on authentic moments and simple backgrounds.','use':['Natural light and honest materials.','Keep the hero subject clear.'],'avoid':['Heavy filters and busy backgrounds.','Unsupported product claims.']},
      'products':{'items':[{'name':'Essential collection','description':'Our signature everyday offering.','specs':'Core range. Matte finish. Main label must remain legible.','rules':'Use the primary palette and show the complete product.'},{'name':'Signature collection','description':'A considered expression for the seasonal campaign.','specs':'Premium range. Warm neutral treatment. Front-facing hero view.','rules':'Keep props minimal and avoid unsupported product claims.'},{'name':'Travel collection','description':'A compact offering for moments on the move.','specs':'Compact format. Clear proportions. Include one scale reference.','rules':'Preserve the approved mark and use an uncluttered background.'}]},
      'messaging':{'headline':'Every detail, considered.','description':'A clear expression of what matters.','cta':'Discover the collection','terminology':['Collection','Considered design','Everyday essentials'],'rules':['Use plain, specific language.','Avoid urgency that the offer does not support.']},
      'ai':{'instructions':f'Write in the {name} voice: clear, confident and human. Keep sentences concise. Never invent product claims.','use':['Approved client context and confirmed product facts.','Concise English copy.'],'never':['Invent certifications or performance claims.','Name the internal designer or expose production notes.']}}
    for section,content in sections.items(): insert('public.brand_sections',client_id=client,section=section,content=content)
    for ai,(asset_name,category,kind,extension,mime,tags) in enumerate([
        ('Sample brand mark','Logo','mark','svg','image/svg+xml',['Sample','Brand mark']),
        ('Essential collection reference','Product','product-1','png','image/png',['Sample','Essential collection']),
        ('Signature collection reference','Product','product-2','png','image/png',['Sample','Signature collection']),
        ('Travel collection reference','Product','product-3','png','image/png',['Sample','Travel collection']),
        ('Sample brand guidelines','Document','guidelines','pdf','application/pdf',['Sample','Guidelines']),
        ('Sample compact mark (PNG)','Logo','mark-png','png','image/png',['Sample','Brand mark','Compact']),
        ('Sample compact mark (PDF)','Logo','mark-pdf','pdf','application/pdf',['Sample','Brand mark','Compact'])
    ]):
        aid=uid(f'brand-asset-{ci}-{ai}');path=f'{client}/{aid}.{extension}'
        insert('public.brand_assets',id=aid,client_id=client,name=asset_name,category=category,description='Deterministic demonstration material. Replace with approved brand assets before live client use.',storage_path=path,mime_type=mime,tags='{'+','.join('"'+tag+'"' for tag in tags)+'}')
        entry={'id':aid,'client_id':client,'client_name':name,'kind':kind,'storage_path':path,'mime_type':mime,'index':ci}
        # A brand product reference belongs to no deliverable and therefore to no format, so it is
        # rendered at the documented format-free size rather than at a shape it was never ordered in.
        if kind.startswith('product'): entry['width'],entry['height']=FORMAT_FREE_SIZE
        manifest['brand_assets'].append(entry)
    for ti,(template,category,width,height) in enumerate([('Instagram Post','Social',1080,1080),('Website Hero','Web',1920,1080),('Amazon Gallery','Commerce',2000,2000),('Presentation','Presentation',1920,1080),('Email Header','Email',1200,600),('Print Flyer','Print',1240,1754),('Product Card','Commerce',1200,1500)]):
        tid=uid(f'template-{ci}-{ti}')
        insert('public.brand_templates',id=tid,client_id=client,name=template,category=category,width=width,height=height,content={'headline':'Every detail, considered.','subheading':name,'background':'#F7F6F2','foreground':'#191919','accent':'#D4DCB4','layout':'editorial','body':'A thoughtful expression of the everyday.','cta':'Explore the collection'})
        if ti==0: insert('public.template_drafts',id=uid(f'draft-{ci}'),client_id=client,template_id=tid,owner_id=customer,name=f'{name} social exploration',content={'headline':'Make room for the everyday.','background':'#F7F6F2','foreground':'#191919'})
    for j in range(2):
        pi=index*2+j+1
        if slug==SABRE_SLUG: break
        service=CATALOG['types'][pi-1]; designer=uid(f'designer-{1+pi%2}'); credits=(service.get('min') or 3)+j; balance-=credits
        fmt=service['formats'][0]; format_spec=next(f for f in CATALOG['formats'] if f['id']==fmt)
        spec={'name':service['name'],'format':fmt,'width':format_spec.get('width'),'height':format_spec.get('height'),'quantity':2 if pi%4==0 else 1,'scope':'original'}
        specs=[spec]
        # Four representative projects carry a second deliverable in another format, each on V1 and V2.
        # The fourth used to be project 16, which belonged to SABRE before SABRE took the reference
        # package's own workspace, so it moved to 20 rather than leaving only three behind.
        if pi in ADAPTATION_PROJECTS:
            other_format=next(f for f in CATALOG['formats'] if f['id']==service['formats'][1])
            specs.append({'name':service['name']+' adaptation','format':other_format['id'],'width':other_format.get('width'),'height':other_format.get('height'),'quantity':1,'scope':'adaptation'})
        start_date,due_date=schedules[pi]
        emit_project(key=pi,name=name,client=client,customer=customer,campaign=campaign,service=service,specs=specs,
                     title=f"{name} / {service['name']}",description=f'A fresh perspective on {name}.',
                     status=states[pi-1],start_date=start_date,due_date=due_date,credits=credits,balance=balance,
                     designer=designer,designs_in_v1=2 if pi%4==0 else 1,
                     extra_version=(states[pi-1] in ('client_review','changes_requested','approved') and pi%2==0) or pi in ADAPTATION_PROJECTS,
                     debit_at=f'2026-09-{2+j:02d}T12:00:00Z')
    if slug==SABRE_SLUG:
        for pi,(key,ptitle,ckey,service_id,deliverables,status,start_date,due_date,designs_in_v1,extra_version) in enumerate(SABRE_PROJECTS,start=1):
            service=next(item for item in CATALOG['types'] if item['id']==service_id)
            specs=[]
            for si,(dname,dformat) in enumerate(deliverables):
                definition=next(f for f in CATALOG['formats'] if f['id']==dformat)
                specs.append({'name':dname,'format':dformat,'width':definition.get('width'),'height':definition.get('height'),'quantity':1,'scope':'original' if si==0 else 'adaptation'})
            credits=service.get('min') or 3; balance-=credits
            campaign_title=next(c[1] for c in SABRE_CAMPAIGNS if c[0]==ckey)
            emit_project(key=f'sabre-{key}',name=name,client=client,customer=customer,campaign=campaigns[ckey],service=service,specs=specs,
                         title=ptitle,description=f'{campaign_title} — {service["name"].lower()} for {name}.',
                         status=status,start_date=start_date,due_date=due_date,credits=credits,balance=balance,
                         designer=uid(f'designer-{1+pi%2}'),designs_in_v1=designs_in_v1,extra_version=extra_version,
                         adaptation_versions=2 if extra_version else 1,
                         debit_at=f'2026-09-{14+pi:02d}T12:00:00Z',campaign_label=campaign_title)
        for key,btitle,ckey,service_id,status,due_date,deliverables in SABRE_OPEN_BRIEFINGS:
            service=next(item for item in CATALOG['types'] if item['id']==service_id)
            specs=[]
            for dname,dformat,scope in deliverables:
                definition=next(f for f in CATALOG['formats'] if f['id']==dformat)
                specs.append({'name':dname,'format':dformat,'width':definition.get('width'),'height':definition.get('height'),'quantity':1,'scope':scope})
            insert('public.briefings',id=uid(f'briefing-sabre-open-{key}'),client_id=client,campaign_id=campaigns[ckey] if ckey else None,title=btitle,service_type=service['id'],status=status,overview='Introduce the new range with one clear, memorable moment.',goals='Give the audience a reason to look twice and one next step.',direction={'source':'brand_hub','questions':answers(service)},requested_deliverables=specs,due_date=due_date,estimated_credits=service.get('min') or 3,created_by=customer,requested_by=customer)
    if ci in (7,8,9):
        request=uid(f'credit-request-{ci}');request_status={7:'pending',8:'fulfilled',9:'rejected'}[ci];ledger=uid(f'credit-request-ledger-{ci}') if ci==8 else None
        if ci==8:
            balance+=25
            insert('public.credit_ledger',id=ledger,client_id=client,amount=25,balance_after=balance,kind='adjustment',description='Credit request allocation',idempotency_key=f'credit-request:{request}',created_at='2026-09-05T12:00:00Z')
        insert('public.credit_requests',id=request,client_id=client,requested_by=customer,amount={7:100,8:25,9:50}[ci],note='Planning the next campaign.',status=request_status,response_note='Additional allocation approved.' if ci==8 else ('Current allocation covers the approved scope.' if ci==9 else ''),ledger_id=ledger)
    insert('public.credit_accounts',client_id=client,balance=balance)
    if ci<=3:
        draft_state=['draft','awaiting_review','budget_confirmed'][ci-1]
        insert('public.briefings',id=uid(f'pending-{ci}'),client_id=client,campaign_id=campaign,title=['Seasonal social exploration','Product launch campaign','Expanded brand rollout'][ci-1],service_type='social',status=draft_state,overview='Introduce the new collection with a concise visual story.',direction={'source':'brand_hub','questions':answers(next(s for s in CATALOG['types'] if s['id']=='social'))},requested_deliverables=[{'name':'Launch post','format':'feed','width':1080,'height':1350,'quantity':1,'scope':'original'}],estimated_credits=3,confirmed_credits=500 if ci==3 else None,budget_note='Expanded rollout across markets.' if ci==3 else None,created_by=customer,requested_by=customer)

(ROOT/'supabase/seed.sql').write_text('\n'.join(lines)+'\n')
(ROOT/'supabase/fixtures.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Generated {len(CLIENTS)} clients and {len(manifest["projects"])} projects; Auth passwords require local provisioning.')
